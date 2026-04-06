/**
 * Content script: Plays back workflows using spreadsheet data.
 * Executes clicks, typing, waits, file uploads, and downloads.
 */
;(function() {
  'use strict';
  if (typeof window !== 'undefined' && window.__CFS_contentScriptPlayerInstalled) return;
  if (typeof window !== 'undefined') window.__CFS_contentScriptPlayerInstalled = true;

  let isPlaying = false;
  let currentWorkflow = null;
  let currentRow = null;
  let currentRowIndex = 0;
  let actionIndex = 0;
  let manualProceedResolver = null;
  let currentCryptoWalletId = '';

  function formatErr(err) {
    return err?.message || String(err);
  }

  /** Tell the service worker to abort in-flight Apify work for this tab (APIFY_RUN, APIFY_RUN_START, APIFY_RUN_WAIT, APIFY_DATASET_ITEMS). */
  function cfsSendApifyRunCancelFromContentTab() {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.getCurrent === 'function') {
        chrome.tabs.getCurrent((tab) => {
          const id = tab && typeof tab.id === 'number' && Number.isInteger(tab.id) && tab.id >= 0 ? tab.id : null;
          const payload = id != null ? { type: 'APIFY_RUN_CANCEL', tabId: id } : { type: 'APIFY_RUN_CANCEL' };
          try {
            chrome.runtime.sendMessage(payload, () => void chrome.runtime.lastError);
          } catch (_) {}
        });
        return;
      }
    } catch (_) {}
    try {
      chrome.runtime.sendMessage({ type: 'APIFY_RUN_CANCEL' }, () => void chrome.runtime.lastError);
    } catch (_) {}
  }

  const QC_FAILED_GEN_PHRASES = ['failed generation', 'generation failed', 'something went wrong', 'try again', 'generation error', "couldn't generate", 'could not generate'];

  /** Shared Virtuoso/QC helper: failure text without any video yet. */
  function qcLastItemHasFailed(item, phrases) {
    const list = Array.isArray(phrases) && phrases.length ? phrases : QC_FAILED_GEN_PHRASES;
    if (!item) return false;
    const text = (item.textContent || '').toLowerCase();
    if (!list.some((p) => text.includes(p))) return false;
    return item.querySelectorAll('video[src]').length === 0;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'PLAYER_PROCEED') {
      if (manualProceedResolver) {
        manualProceedResolver();
        manualProceedResolver = null;
      }
      sendResponse({ ok: true });
      return false;
    }
    if (msg.type === 'PLAYER_START') {
      let responded = false;
      const safeSend = (r) => {
        if (responded) return;
        responded = true;
        try { sendResponse(r); } catch (_) {}
      };
      isPlaying = true;
      const w = msg.workflow || {};
      currentWorkflow = { ...w, actions: w.actions || w.analyzed?.actions || [] };
      currentRow = msg.row || {};
      currentRowIndex = msg.rowIndex != null ? Number(msg.rowIndex) : 0;
      currentCryptoWalletId = msg.cryptoWalletId || '';
      actionIndex = Math.max(0, parseInt(msg.startIndex, 10) || 0);
      executeNext(safeSend).catch(err => safeSend({ ok: false, error: err?.message || String(err), actionIndex, rowFailureAction: err?.rowFailureAction }));
      return true;
    } else if (msg.type === 'PLAYER_STOP') {
      isPlaying = false;
      currentWorkflow = null;
      if (manualProceedResolver) {
        manualProceedResolver();
        manualProceedResolver = null;
      }
      cfsSendApifyRunCancelFromContentTab();
      sendResponse({ ok: true });
    } else if (msg.type === 'PLAYER_STATUS') {
      sendResponse({ isPlaying, actionIndex, waitingManual: !!manualProceedResolver });
    } else if (msg.type === 'GET_ELEMENT_TEXT') {
      try {
        const sel = msg.selector;
        let el = null;
        if (sel && typeof resolveElement === 'function') {
          const arr = Array.isArray(sel) ? sel : [sel];
          el = resolveElement(arr, document);
        } else if (typeof sel === 'string') {
          el = document.querySelector(sel);
        }
        const text = el ? (el.textContent || el.value || '').trim() : '';
        sendResponse({ ok: true, text });
      } catch (e) {
        sendResponse({ ok: false, error: formatErr(e) });
      }
    } else if (msg.type === 'CFS_RESOLVE_ACTION_ELEMENT_PAIR') {
      try {
        const a = msg.actionA;
        const b = msg.actionB;
        if (!a || !b || typeof resolveElement !== 'function') {
          sendResponse({ ok: false, error: 'Missing actions or resolveElement' });
          return false;
        }
        const chainFor = (typeof CFS_selectorParity?.selectorChainForAction === 'function')
          ? (act) => CFS_selectorParity.selectorChainForAction(act)
          : (act) => [...(act.selectors || []), ...(act.fallbackSelectors || [])];
        const selsA = chainFor(a);
        const selsB = chainFor(b);
        const setEq = typeof CFS_selectorParity?.orderedNodeSetsEqual === 'function'
          ? CFS_selectorParity.orderedNodeSetsEqual
          : null;
        let setA = [];
        let setB = [];
        if (selsA.length && typeof resolveAllElements === 'function') {
          setA = resolveAllElements(selsA, document);
        } else if (selsA.length) {
          const el = resolveElement(selsA, document);
          if (el) setA = [el];
        }
        if (selsB.length && typeof resolveAllElements === 'function') {
          setB = resolveAllElements(selsB, document);
        } else if (selsB.length) {
          const el = resolveElement(selsB, document);
          if (el) setB = [el];
        }
        const hasA = setA.length > 0;
        const hasB = setB.length > 0;
        let same = false;
        if (hasA && hasB) {
          if (setEq) same = !!setEq(setA, setB);
          else if (setA.length === 1 && setB.length === 1) {
            const x = setA[0];
            const y = setB[0];
            same = x === y || (typeof x.isSameNode === 'function' && x.isSameNode(y));
          }
        }
        sendResponse({
          ok: true,
          same,
          hasA,
          hasB,
          countA: setA.length,
          countB: setB.length,
        });
      } catch (e) {
        sendResponse({ ok: false, error: formatErr(e) });
      }
    } else if (msg.type === 'CFS_ENRICH_PARITY_REFINE') {
      try {
        const action = msg.action;
        const refine = !!msg.refine;
        if (!action || typeof CFS_selectorParity?.parityReportForAction !== 'function') {
          sendResponse({ ok: false, error: 'Missing action or CFS_selectorParity' });
          return false;
        }
        const report = CFS_selectorParity.parityReportForAction(action, document);
        const ser = (r) => ({
          ok: r.ok,
          reason: r.reason,
          recordedExpectation: r.recordedExpectation || null,
          entries: (r.entries || []).map((e) => ({
            index: e.index,
            matchCount: e.matchCount,
            matchesCanonical: e.matchesCanonical,
            overshoot: e.overshoot,
            undershoot: e.undershoot,
          })),
        });
        let outAction = JSON.parse(JSON.stringify(action));
        let finalReport = report;
        let added = 0;
        if (refine && typeof CFS_selectorParity.refineActionWithParityRefinements === 'function') {
          const r = CFS_selectorParity.refineActionWithParityRefinements(action, document);
          outAction = r.action;
          added = r.added;
          finalReport = r.report;
        } else if (refine && typeof CFS_selectorParity.refineActionWithCssPathFallbacks === 'function') {
          const r = CFS_selectorParity.refineActionWithCssPathFallbacks(action, document);
          outAction = r.action;
          added = r.added;
          finalReport = r.report;
        }
        sendResponse({ ok: true, action: outAction, report: ser(finalReport), added });
      } catch (e) {
        sendResponse({ ok: false, error: formatErr(e) });
      }
    } else if (msg.type === 'CAPTURE_AUDIO') {
      const mediaSel = msg.mediaSelectors || msg.selector;
      const mainSel = msg.selectors || msg.selector;
      const toTry = mediaSel && mainSel && mediaSel !== mainSel ? [mediaSel, mainSel] : [mediaSel || mainSel];
      const scopeRoot = msg.scopeRoot;
      const tryCapture = async () => {
        let lastErr = null;
        for (const s of toTry) {
          if (!s?.length) continue;
          try {
            const blob = await captureAudioFromElement(s, msg.durationMs, scopeRoot);
            if (blob) return blob;
          } catch (e) {
            lastErr = e;
          }
        }
        throw lastErr || new Error('No video/audio element found. Try selecting the media element or its play button.');
      };
      tryCapture()
        .then(blob => {
          if (!blob) {
            sendResponse({ ok: false, error: 'No audio captured' });
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            sendResponse({ ok: true, base64: reader.result?.split(',')[1], contentType: blob.type });
          };
          reader.readAsDataURL(blob);
        })
        .catch(e => sendResponse({ ok: false, error: formatErr(e) }));
      return true;
    } else if (msg.type === 'WAIT_FOR_QC_GENERATION_COMPLETE') {
      const cfg = msg.config || {};
      const containerSelectors = cfg.groupContainer?.selectors || cfg.containerSelectors || [];
      const timeoutMs = Math.min(Math.max(cfg.timeoutMs || 120000, 10000), 900000);
      const pollInterval = 1500;
      const start = Date.now();
      /* Veo-style pages: each run creates a new card (e.g. [class*="sc-20145656-2"]) with X% during
       * generation, then video[src] when done. Poll until no container has % text without video. */
      const hasGenerating = (root) => {
        const walk = (el) => {
          if (!el || el.nodeType !== 1) return false;
          if (el.closest('video, audio')) return false;
          const t = (el.textContent || '').trim();
          if (/^\d{1,3}%$/.test(t)) return true;
          if (/\d{1,3}%/.test(t) && t.length < 25 && !el.querySelector('video[src], audio[src]')) return true;
          for (let i = 0; i < el.childNodes.length; i++) {
            if (walk(el.childNodes[i])) return true;
          }
          return false;
        };
        return walk(root);
      };
      const getContainersToCheck = () => {
        if (!containerSelectors?.length) return [document.body];
        const sels = Array.isArray(containerSelectors) ? containerSelectors : (containerSelectors.selectors || containerSelectors);
        if (typeof resolveAllElements === 'function') {
          const els = resolveAllElements(sels, document);
          if (els?.length) return els;
        }
        if (typeof resolveElement === 'function') {
          const el = resolveElement(sels, document);
          if (el) return [el];
        }
        try {
          const first = sels[0];
          const sel = typeof first === 'string' ? first : (first?.value ?? first);
          const el = document.querySelector(sel);
          return el ? [el] : [document.body];
        } catch (_) { return [document.body]; }
      };
      const wait = async () => {
        while (Date.now() - start < timeoutMs) {
          const containers = getContainersToCheck();
          const anyGenerating = containers.some(c => hasGenerating(c));
          if (!anyGenerating) return true;
          await new Promise(r => setTimeout(r, pollInterval));
        }
        return false;
      };
      wait()
        .then(done => sendResponse({ ok: true, ready: !!done }))
        .catch(e => sendResponse({ ok: false, error: formatErr(e) }));
      return true;
    } else if (msg.type === 'GET_VIRTUOSO_ITEM_COUNT') {
      const list = document.querySelector('[data-testid="virtuoso-item-list"]');
      const count = list ? list.querySelectorAll('[data-index]').length : 0;
      sendResponse({ ok: true, count });
      return false;
    } else if (msg.type === 'GET_VIDEO_RENDER_STATUS') {
      /** Detect if a video "rendered" (decoded at least one frame). Flow can show a black box when
       * src fails to load or decode; then videoWidth/videoHeight stay 0 and readyState stays low. */
      const videoRendered = (v) => v && v.videoWidth > 0 && v.videoHeight > 0;
      const scope = msg.scope === 'virtuoso' ? document.querySelector('[data-testid="virtuoso-item-list"]') : (msg.scope || document);
      const root = scope || document;
      const videos = Array.from(root.querySelectorAll('video[src]'));
      const status = videos.map((v) => ({
        rendered: videoRendered(v),
        videoWidth: v.videoWidth || 0,
        videoHeight: v.videoHeight || 0,
        readyState: v.readyState,
        hasError: !!v.error,
      }));
      sendResponse({ ok: true, status, summary: { total: status.length, rendered: status.filter(s => s.rendered).length } });
      return false;
    } else if (msg.type === 'WAIT_FOR_VIRTUOSO_VIDEOS') {
      const timeoutMs = Math.min(Math.max(msg.timeoutMs || 300000, 15000), 600000);
      const pollInterval = 2000;
      const initialDelayMs = 10000;
      const requireRendered = !!msg.requireRendered;
      const start = Date.now();
      const list = document.querySelector('[data-testid="virtuoso-item-list"]');
      if (!list) {
        sendResponse({ ok: true, ready: false });
        return true;
      }
      const initialCount = list.querySelectorAll('[data-index]').length;
      const lastItemVideosRendered = (lastItem) => {
        if (!lastItem) return false;
        const videos = lastItem.querySelectorAll('video[src]');
        for (const v of videos) {
          if (v.videoWidth > 0 && v.videoHeight > 0 && v.readyState >= 2) return true;
          if (v.readyState >= 1) return true;
          if (v.src) return true;
        }
        return false;
      };
      const wait = async () => {
        await new Promise(r => setTimeout(r, initialDelayMs));
        while (Date.now() - start < timeoutMs) {
          const items = list.querySelectorAll('[data-index]');
          // Flow: newest is first (data-index="1" or items[0]); use that for wait checks
          const lastItem = items.length > 0 ? (list.querySelector('[data-index="1"]') || items[0]) : null;
          const countIncreased = items.length > initialCount;
          if (lastItem && (countIncreased || Date.now() - start > initialDelayMs + 60000)) {
            if (qcLastItemHasFailed(lastItem)) return { ready: false, failed: true };
            const hasAnyPercent = /\d{1,3}%/.test(lastItem.textContent || '');
            if (hasAnyPercent) {
              await new Promise(r => setTimeout(r, pollInterval));
              continue;
            }
            const videos = lastItem.querySelectorAll('video[src], audio[src]');
            if (videos.length > 0) {
              if (!requireRendered) return { ready: true, failed: false };
              if (lastItemVideosRendered(lastItem)) return { ready: true, failed: false };
            }
          }
          await new Promise(r => setTimeout(r, pollInterval));
        }
        return { ready: false, failed: false };
      };
      wait()
        .then(r => sendResponse({ ok: true, ready: !!r.ready, failed: !!r.failed }))
        .catch(e => sendResponse({ ok: false, error: formatErr(e) }));
      return true;
    } else if (msg.type === 'GET_QC_INPUTS_OUTPUTS') {
      const handleQc = async () => {
        const cfg = msg.config || {};
        const inputs = cfg.inputs || [];
        const outputs = cfg.outputs || [];
        const row = cfg.row || {};
        const groupContainer = cfg.groupContainer;
        const groupMode = cfg.groupMode ?? 'last';
        const captureAudio = cfg.captureAudio !== false;

        let groups = [];
        if (groupContainer?.selectors?.length && typeof resolveAllElements === 'function') {
          groups = resolveAllElements(groupContainer.selectors, document);
          if (groupMode === 'matchPrompt') {
            /* keep all groups; sidepanel will filter by row.text */
          } else if (groupMode === 'first' && groups.length > 0) groups = [groups[0]];
          else if (groupMode === 'last' && groups.length > 0) groups = [groups[groups.length - 1]];
          else if (groupMode === 'all') { /* keep all */ }
          else if (typeof groupMode === 'number' && groups[groupMode]) groups = [groups[groupMode]];
        }
        if (groups.length === 0) groups = [document];

        const result = [];
        for (const group of groups) {
          const expected = [];
          for (const inp of inputs) {
            if (inp.source === 'variable' && inp.variableKey && row) {
              expected.push(String(row[inp.variableKey] ?? '').trim());
            } else if (inp.source === 'page' && inp.selectors?.length && typeof resolveElement === 'function') {
              const el = resolveElement(inp.selectors, group);
              const text = el ? (el.textContent || el.value || '').trim() : '';
              if (text) expected.push(text);
            }
          }
          const validExpected = expected.filter(Boolean);

          const groupOutputs = [];
          for (const o of outputs) {
            const checkType = o.checkType || 'text';
            if (checkType === 'presence') {
              // Use the resolved group (may be data-index="1", "2", etc. for match-by-prompt).
              // If group has no videos (e.g. div.fMgqiK), expand to its parent [data-index].
              // Only override to most recent when single-group mode (first/0) and we want newest.
              let scopeWithVideos = group && group.querySelector ? group : document;
              const isSingleGroupCheck = groupMode !== 'matchPrompt' && (groups.length <= 1 || (groupMode === 'first' || groupMode === 0));
              const virtuosoList = document.querySelector('[data-testid="virtuoso-item-list"]');
              const mostRecentItem = virtuosoList
                ? (virtuosoList.querySelector('[data-index="1"]') || virtuosoList.querySelector('[data-index]'))
                : null;
              if (isSingleGroupCheck && mostRecentItem) {
                scopeWithVideos = mostRecentItem;
              } else if (scopeWithVideos.querySelectorAll('video[src]').length === 0 && scopeWithVideos.closest) {
                const expanded = scopeWithVideos.closest('[data-index]');
                if (expanded) scopeWithVideos = expanded;
              }
              const toTry = [o.mediaSelectors, o.selectors].filter(Boolean);
              let found = false;
              for (const sel of toTry) {
                if (sel?.length && typeof resolveElement === 'function') {
                  const el = resolveElement(sel, scopeWithVideos);
                  if (el) { found = true; break; }
                }
              }
              if (!found && toTry.length === 0) {
                found = scopeWithVideos.querySelector('video[src], audio[src]') != null;
              }
              groupOutputs.push({ checkType: 'presence', present: found });
              continue;
            }
            if (checkType === 'audio') {
              if (!captureAudio) {
                groupOutputs.push({ checkType: 'audio', base64: null });
                continue;
              }
              const toTry = (o.mediaSelectors?.length ? [o.mediaSelectors, o.selectors] : [o.selectors]).filter(Boolean);
              let captured = false;
              for (const s of toTry) {
                if (!s?.length) continue;
                try {
                  const blob = await captureAudioFromElement(s, 10000, group);
                  if (blob) {
                    const dataUrl = await new Promise((res, rej) => {
                      const reader = new FileReader();
                      reader.onloadend = () => res(reader.result);
                      reader.onerror = rej;
                      reader.readAsDataURL(blob);
                    });
                    groupOutputs.push({ checkType: 'audio', base64: (dataUrl || '').split(',')[1], contentType: blob.type });
                    captured = true;
                    break;
                  }
                } catch (_) {}
              }
              if (!captured) groupOutputs.push({ checkType: 'audio', base64: null });
            } else {
              const sel = o.selectors;
              let text = '';
              if (sel?.length && typeof resolveElement === 'function') {
                const el = resolveElement(sel, group);
                text = el ? (el.textContent || el.value || '').trim() : '';
              }
              groupOutputs.push({ checkType: 'text', text: text || '' });
            }
          }
          if (groupOutputs.length > 0) result.push({ expected: validExpected, outputs: groupOutputs });
        }
        return result;
      };
      handleQc()
        .then(groups => sendResponse({ ok: true, groups }))
        .catch(e => sendResponse({ ok: false, error: formatErr(e) }));
      return true;
    } else if (msg.type === 'GET_QC_CAPTURE_SINGLE_OUTPUT') {
      const handleSingle = async () => {
        const cfg = msg.config || {};
        const groupIndex = cfg.groupIndex ?? 0;
        const outputIndex = cfg.outputIndex ?? 0;
        const outputs = cfg.outputs || [];
        const groupContainer = cfg.groupContainer;
        const groupMode = cfg.groupMode ?? 'last';

        let groups = [];
        if (groupContainer?.selectors?.length && typeof resolveAllElements === 'function') {
          groups = resolveAllElements(groupContainer.selectors, document);
          if (groupMode === 'first' && groups.length > 0) groups = [groups[0]];
          else if (groupMode === 'last' && groups.length > 0) groups = [groups[groups.length - 1]];
          else if (typeof groupMode === 'number' && groups[groupMode]) groups = [groups[groupMode]];
        }
        if (groups.length === 0) groups = [document];
        const group = groups[groupIndex];
        if (!group) return null;

        const o = outputs[outputIndex];
        if (!o || (o.checkType || 'text') !== 'audio') return null;
        const toTry = (o.mediaSelectors?.length ? [o.mediaSelectors, o.selectors] : [o.selectors]).filter(Boolean);
        for (const s of toTry) {
          if (!s?.length) continue;
          try {
            const blob = await captureAudioFromElement(s, 10000, group);
            if (blob) {
              const dataUrl = await new Promise((res, rej) => {
                const reader = new FileReader();
                reader.onloadend = () => res(reader.result);
                reader.onerror = rej;
                reader.readAsDataURL(blob);
              });
              return { base64: (dataUrl || '').split(',')[1], contentType: blob.type };
            }
          } catch (_) {}
        }
        return null;
      };
      handleSingle()
        .then(r => sendResponse({ ok: !!r, base64: r?.base64, contentType: r?.contentType }))
        .catch(e => sendResponse({ ok: false, error: formatErr(e) }));
      return true;
    } else if (msg.type === 'GET_VIDEO_METADATA') {
      const handleMeta = async () => {
        const cfg = msg.config || {};
        const groupContainer = cfg.groupContainer;
        const groupMode = cfg.groupMode ?? 'last';
        const groupIndex = cfg.groupIndex ?? 0;

        let groups = [];
        if (groupContainer?.selectors?.length && typeof resolveAllElements === 'function') {
          groups = resolveAllElements(groupContainer.selectors, document);
          if (groupMode === 'first' && groups.length > 0) groups = [groups[0]];
          else if (groupMode === 'last' && groups.length > 0) groups = [groups[groups.length - 1]];
          else if (groupMode === 'all') { /* keep all */ }
          else if (typeof groupMode === 'number' && groups[groupMode]) groups = [groups[groupMode]];
        }
        if (groups.length === 0) groups = [document];
        let scope = Array.isArray(groups) ? groups[groupIndex] ?? groups[0] : groups;
        scope = scope || document;
        if (scope !== document) {
          const inScope = scope.querySelectorAll('video[src]');
          if (inScope.length === 0 && scope.closest) {
            const virtuosoItem = scope.closest('[data-index]');
            if (virtuosoItem) scope = virtuosoItem;
          }
        }
        const maxVideos = cfg.maxVideosPerGroup ?? 4;
        const videos = Array.from(scope.querySelectorAll('video[src]')).slice(0, maxVideos);
        const meta = [];
        for (let i = 0; i < videos.length; i++) {
          const v = videos[i];
          const entry = { index: i + 1, width: 0, height: 0, duration: 0, hasSrc: !!v.src };
          if (!v.src) { meta.push(entry); continue; }
          try {
            const w = v.videoWidth || 0, h = v.videoHeight || 0, d = (v.duration && isFinite(v.duration)) ? v.duration : 0;
            if (w && h) {
              entry.width = w;
              entry.height = h;
              entry.duration = d;
              meta.push(entry);
              continue;
            }
            await new Promise((resolve, reject) => {
              const done = () => {
                v.removeEventListener('loadedmetadata', onLoad);
                v.removeEventListener('error', onErr);
                clearTimeout(t);
                resolve();
              };
              const onLoad = () => { entry.width = v.videoWidth || 0; entry.height = v.videoHeight || 0; entry.duration = (v.duration && isFinite(v.duration)) ? v.duration : 0; done(); };
              const onErr = () => done();
              v.addEventListener('loadedmetadata', onLoad);
              v.addEventListener('error', onErr);
              v.load();
              const t = setTimeout(done, 4000);
            });
            if (!entry.width && !entry.height) {
              entry.width = v.videoWidth || 0;
              entry.height = v.videoHeight || 0;
              entry.duration = (v.duration && isFinite(v.duration)) ? v.duration : 0;
            }
          } catch (_) {}
          meta.push(entry);
        }
        return meta;
      };
      handleMeta()
        .then(meta => sendResponse({ ok: true, videos: meta }))
        .catch(e => sendResponse({ ok: false, error: formatErr(e) }));
      return true;
    } else if (msg.type === 'GET_QC_ANALYZE_PAGE') {
      const analyze = () => {
        const media = document.querySelectorAll('video, audio');
        if (media.length === 0) return { groups: [], hint: 'No video/audio elements found.' };
        const byAncestor = new Map();
        for (const el of media) {
          let p = el.parentElement;
          let depth = 0;
          while (p && p !== document.body && depth < 8) {
            const key = p;
            const count = (byAncestor.get(key) || 0) + 1;
            byAncestor.set(key, count);
            p = p.parentElement;
            depth++;
          }
        }
        const candidates = [];
        for (const [el, count] of byAncestor) {
          if (count >= 1 && count <= 8) {
            const children = el.querySelectorAll('video, audio');
            if (children.length === count) candidates.push({ el, count });
          }
        }
        candidates.sort((a, b) => a.count - b.count);
        const groups = candidates.slice(-5).map((c) => ({ videoCount: c.count }));
        return { groups, totalMedia: media.length, hint: groups.length ? `Found ${media.length} media in patterns of ${groups.map((g) => g.videoCount).join(', ')}.` : 'No clear group pattern.' };
      };
      try {
        sendResponse({ ok: true, ...analyze() });
      } catch (e) {
        sendResponse({ ok: false, error: formatErr(e) });
      }
    } else if (msg.type === 'SCROLL_TO_QC_RESULTS') {
      try {
        const list = document.querySelector('[data-testid="virtuoso-item-list"]');
        if (list) {
          const items = list.querySelectorAll('[data-index]');
          let target = null;
          if (msg.rowIndex != null) {
            target = Array.from(items).find((it) => it.getAttribute('data-cfs-row-index') === String(msg.rowIndex));
          }
          if (!target) target = items.length > 0 ? (list.querySelector('[data-index="1"]') || items[0]) : null;
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            sendResponse({ ok: true });
          } else {
            list.scrollIntoView({ behavior: 'smooth', block: 'center' });
            sendResponse({ ok: true });
          }
        } else {
          sendResponse({ ok: false, error: 'Results container not found' });
        }
      } catch (e) {
        sendResponse({ ok: false, error: formatErr(e) });
      }
    } else if (msg.type === 'WAIT_FOR_ROW_GENERATION') {
      const timeoutMs = Math.min(Math.max(msg.timeoutMs || 300000, 30000), 600000);
      const pollInterval = 2000;
      const initialDelayMs = 8000;
      const minVideos = msg.minVideos ?? 1;
      const failedPhrases = msg.failedGenerationPhrases;
      const start = Date.now();
      const list = document.querySelector('[data-testid="virtuoso-item-list"]');
      if (!list) {
        sendResponse({ ok: true, ready: false, failed: false });
        return true;
      }
      const initialCount = msg.initialCount ?? list.querySelectorAll('[data-index]').length;
      const failedGenerationPhrases = Array.isArray(failedPhrases) && failedPhrases.length > 0 ? failedPhrases : QC_FAILED_GEN_PHRASES;
      const lastItemVideosRendered = (item) => {
        if (!item) return 0;
        let n = 0;
        for (const v of item.querySelectorAll('video[src]')) {
          if (v.videoWidth > 0 && v.videoHeight > 0) n++;
          else if (v.readyState >= 1 || v.src) n++;
        }
        return n;
      };
      const lastItemStillGenerating = (item) => {
        if (!item) return false;
        const text = (item.textContent || '').trim();
        return /\d{1,3}%/.test(text);
      };
      const wait = async () => {
        await new Promise(r => setTimeout(r, initialDelayMs));
        while (Date.now() - start < timeoutMs) {
          const items = list.querySelectorAll('[data-index]');
          // Flow: newest is first (data-index="1" or items[0]); use that for wait checks
          const lastItem = items.length > 0 ? (list.querySelector('[data-index="1"]') || items[0]) : null;
          const countIncreased = items.length > initialCount;
          if (lastItem && (countIncreased || Date.now() - start > initialDelayMs + 60000)) {
            if (lastItemStillGenerating(lastItem)) {
              await new Promise(r => setTimeout(r, pollInterval));
              continue;
            }
            if (qcLastItemHasFailed(lastItem, failedGenerationPhrases)) {
              return { ready: true, failed: true };
            }
            const rendered = lastItemVideosRendered(lastItem);
            if (rendered >= minVideos) {
              return { ready: true, failed: false };
            }
          }
          await new Promise(r => setTimeout(r, pollInterval));
        }
        return { ready: false, failed: false };
      };
      wait()
        .then((r) => sendResponse({ ok: true, ready: r.ready, failed: r.failed }))
        .catch((e) => sendResponse({ ok: false, error: formatErr(e) }));
      return true;
    } else if (msg.type === 'ADD_ANCHOR_TO_LAST_RESULT') {
      try {
        const list = document.querySelector('[data-testid="virtuoso-item-list"]');
        if (!list) {
          sendResponse({ ok: false, error: 'List not found' });
          return false;
        }
        const items = list.querySelectorAll('[data-index]');
        // Flow: newest is first (data-index="1" or items[0]); use that for the anchor
        const mostRecent = items.length > 0
          ? (list.querySelector('[data-index="1"]') || items[0])
          : null;
        if (mostRecent && msg.rowIndex != null) {
          mostRecent.setAttribute('data-cfs-row-index', String(msg.rowIndex));
          mostRecent.id = mostRecent.id || 'cfs-result-' + msg.rowIndex;
          sendResponse({ ok: true, id: mostRecent.id });
        } else {
          sendResponse({ ok: true });
        }
      } catch (e) {
        sendResponse({ ok: false, error: formatErr(e) });
      }
      return false;
    } else if (msg.type === 'SCROLL_TO_RESULT') {
      try {
        const list = document.querySelector('[data-testid="virtuoso-item-list"]');
        let el = null;
        if (msg.rowIndex != null) {
          el = document.querySelector(`[data-cfs-row-index="${msg.rowIndex}"]`);
        }
        if (!el && list) {
          const items = list.querySelectorAll('[data-index]');
          el = items.length > 0 ? (list.querySelector('[data-index="1"]') || items[0]) : null;
        }
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: 'Result not found' });
        }
      } catch (e) {
        sendResponse({ ok: false, error: formatErr(e) });
      }
      return false;
    } else if (msg.type === 'EXTRACT_DATA') {
      runExtractData(msg.config || {})
        .then((result) => sendResponse(result))
        .catch((e) => sendResponse({ ok: false, error: formatErr(e) }));
      return true;
    }
  });

  /**
   * Extract a list of rows from the page. Config: listSelector, itemSelector, fields: [{ key, selectors }], maxItems (optional).
   * Returns { ok: true, rows } or { ok: false, error }.
   */
  function runExtractData(config) {
    const cfg = config || {};
    let doc = document;
    if (cfg.rootDoc && cfg.rootDoc.nodeType) {
      doc = cfg.rootDoc;
    } else if (typeof resolveDocumentForAction === 'function') {
      const hasScope =
        (cfg.iframeSelectors && cfg.iframeSelectors.length) ||
        (cfg.iframeFallbackSelectors && cfg.iframeFallbackSelectors.length) ||
        (cfg.shadowHostSelectors && cfg.shadowHostSelectors.length) ||
        (cfg.shadowHostFallbackSelectors && cfg.shadowHostFallbackSelectors.length);
      if (hasScope) {
        try {
          doc = resolveDocumentForAction(cfg, document);
        } catch (_) {
          doc = document;
        }
      }
    }
    const listSelector = cfg.listSelector;
    const itemSelector = cfg.itemSelector || 'li, [data-index], tr, [role="row"], .item, [class*="item"]';
    const fields = Array.isArray(cfg.fields) ? cfg.fields : [];
    const maxItems = typeof cfg.maxItems === 'number' && cfg.maxItems > 0 ? cfg.maxItems : 0;

    let list = null;
    if (typeof listSelector === 'string' && listSelector.trim()) {
      try {
        list = doc.querySelector(listSelector.trim());
      } catch (_) {}
    }
    if (!list && listSelector && typeof resolveElement === 'function') {
      const sels = Array.isArray(listSelector) ? listSelector : [listSelector];
      list = resolveElement(sels, doc);
    }
    if (!list) {
      return Promise.resolve({ ok: false, error: 'List container not found. Set list selector (e.g. table tbody, ul, [data-list]).' });
    }

    let itemEls = [];
    const itemSelStr = typeof itemSelector === 'string' ? itemSelector.trim() : '';
    if (itemSelStr) {
      try {
        itemEls = Array.from(list.querySelectorAll(itemSelStr));
      } catch (_) {}
    }
    if (itemEls.length === 0) {
      itemEls = Array.from(list.children).filter((el) => el.nodeType === 1);
    }
    if (maxItems > 0 && itemEls.length > maxItems) {
      itemEls = itemEls.slice(0, maxItems);
    }
    if (itemEls.length === 0) {
      return Promise.resolve({ ok: true, rows: [] });
    }

    const rows = [];
    for (const item of itemEls) {
      const row = {};
      for (const field of fields) {
        const key = (field.key || '').trim() || 'value';
        const sels = field.selectors || field.selector;
        let text = '';
        if (sels && typeof resolveElement === 'function') {
          const el = resolveElement(Array.isArray(sels) ? sels : [sels], item);
          if (el) text = (el.textContent || el.value || '').trim();
        } else if (typeof sels === 'string' && sels.trim()) {
          try {
            const el = item.querySelector(sels.trim());
            if (el) text = (el.textContent || el.value || '').trim();
          } catch (_) {}
        }
        row[key] = text;
      }
      if (Object.keys(row).length > 0) rows.push(row);
    }
    return Promise.resolve({ ok: true, rows });
  }

  const POLL_INTERVAL_MS = 1000;
  const ELEMENT_TIMEOUT_MS = 60000;
  const OPTIONAL_STEP_TIMEOUT_MS = 3000;
  /** Loader fetches manifest + injects many handler files via background; 3s was too tight on cold SW / large registries. */
  const STEP_HANDLERS_READY_TIMEOUT_MS = 25000;

  /* ── Fallback eligibility: pattern-match error messages ── */
  /* Errors that indicate the API step can't run but the UI path might work. */
  const _FB_ELIGIBLE_PATTERNS = [
    /wallet.*not\s*(configured|found|set)/i,
    /no\s*(solana|bsc|evm)\s*wallet/i,
    /api\s*key\s*(not|missing|invalid|required)/i,
    /unauthorized|token\s*expired|auth.*fail/i,
    /rate\s*limit|too\s*many\s*requests|429/i,
    /network\s*error|econnrefused|fetch\s*fail|503|502|504/i,
    /backend.*unreachable|api.*down|service.*unavailable/i,
    /credits?\s*(exhausted|insufficient|expired|ran\s*out)/i,
    /required\s*field.*empty/i,
    /profile.*not\s*found|no\s*upload.*profile/i,
  ];
  /* Errors that should NOT trigger fallback (would fail in UI too). */
  const _FB_EXCLUDE_PATTERNS = [
    /insufficient\s*(sol|bnb|funds|balance)/i,
    /simulation\s*fail/i,
    /transaction\s*fail/i,
    /slippage/i,
    /tab.*closed|disconnected/i,
  ];
  function _isFallbackEligible(err, action) {
    if (!action?._autoReplaced || !action._fallbackActions?.length) return false;
    const msg = (err?.message || '').toLowerCase();
    if (!msg) return false;
    for (let i = 0; i < _FB_EXCLUDE_PATTERNS.length; i++) {
      if (_FB_EXCLUDE_PATTERNS[i].test(msg)) return false;
    }
    for (let i = 0; i < _FB_ELIGIBLE_PATTERNS.length; i++) {
      if (_FB_ELIGIBLE_PATTERNS[i].test(msg)) return true;
    }
    return false;
  }

  async function executeNext(sendResponse) {
    if (!isPlaying || !currentWorkflow?.actions) {
      sendResponse?.({ ok: true, done: true });
      return;
    }

    try {
      await waitStepHandlersReady(STEP_HANDLERS_READY_TIMEOUT_MS);
    } catch (e) {
      isPlaying = false;
      sendResponse?.({ ok: false, error: formatErr(e), actionIndex, rowFailureAction: 'stop' });
      return;
    }

    while (isPlaying && currentWorkflow?.actions) {
      const actions = currentWorkflow.actions;
      if (actionIndex >= actions.length) {
        isPlaying = false;
        sendResponse?.({ ok: true, done: true, row: currentRow });
        return;
      }

      const action = actions[actionIndex];
      if (!action || !action.type) {
        actionIndex++;
        continue;
      }
      if (action.type === 'mouseover' || action.type === 'mouseenter') action.type = 'hover';

      if (action.type === 'loop') {
        try {
          await executeLoop(action);
          actionIndex++;
          continue;
        } catch (err) {
          const rowFailureAction = (action.onFailure === 'skipRow' ? 'skip' : action.onFailure) || err?.rowFailureAction || 'stop';
          sendResponse?.({ ok: false, error: formatErr(err), actionIndex, rowFailureAction });
          return;
        }
      }

      if (action.type === 'runWorkflow') {
        try {
          const nested = action.nestedWorkflow;
          if (!nested?.actions?.length) throw new Error('Nested workflow not found or empty');
          const nestedRow = applyRowMapping(currentRow || {}, action.rowMapping);
          await runWorkflowActions(nested.actions, nestedRow);
          actionIndex++;
          continue;
        } catch (err) {
          const rowFailureAction = (action.onFailure === 'skipRow' ? 'skip' : action.onFailure) || err?.rowFailureAction || 'stop';
          sendResponse?.({ ok: false, error: formatErr(err), actionIndex, rowFailureAction });
          return;
        }
      }

      if (action.type === 'goToUrl') {
        let url = (action.url && String(action.url).trim()) || getRowValue(currentRow || {}, action.variableKey, 'url');
        if (!url || !String(url).trim()) {
          sendResponse?.({ ok: false, error: 'Go to URL: no URL set. Set URL in step or use a row variable (e.g. variableKey: url).', actionIndex, rowFailureAction: (action.onFailure === 'skipRow' ? 'skip' : action.onFailure) || 'stop' });
          return;
        }
        url = String(url).trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        sendResponse?.({ ok: true, navigate: true, url, nextStepIndex: actionIndex + 1 });
        return;
      }

      if (action.type === 'openTab') {
        let url = (action.url && String(action.url).trim()) || getRowValue(currentRow || {}, action.variableKey, 'url');
        if (!url || !String(url).trim()) {
          sendResponse?.({ ok: false, error: 'Open tab: no URL set. Set URL in step or use a row variable.', actionIndex, rowFailureAction: (action.onFailure === 'skipRow' ? 'skip' : action.onFailure) || 'stop' });
          return;
        }
        url = String(url).trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        if (action.andSwitchToTab) {
          sendResponse?.({ ok: true, openTab: true, url, nextStepIndex: actionIndex + 1, openInNewWindow: !!action.openInNewWindow });
          return;
        }
        const OPEN_TAB_CALLBACK_MS = 15000;
        await new Promise((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            actionIndex++;
            resolve();
          };
          const timer = setTimeout(finish, OPEN_TAB_CALLBACK_MS);
          chrome.runtime.sendMessage({ type: 'PLAYER_OPEN_TAB', url, openInNewWindow: !!action.openInNewWindow }, () => {
            clearTimeout(timer);
            finish();
          });
        });
        continue;
      }

      const nextUploadAction = actions.slice(actionIndex + 1).find(a => a.type === 'upload');
      const nextNonWait = actions.slice(actionIndex + 1).find(a => a.type !== 'wait');
      const stepMeta = (typeof window !== 'undefined' && window.__CFS_stepHandlerMeta) ? window.__CFS_stepHandlerMeta[action.type] : null;
      const needsElement = !!(stepMeta && stepMeta.needsElement === true);
      const isEnsureSelect = action.type === 'ensureSelect';

      try {
        if (action.delay && action.delay > 0) await sleep(action.delay);
        if (isEnsureSelect && (action.checkSelectors?.length || action.openSelectors?.length || action.fallbackSelectors?.length)) {
          const base = action.checkSelectors?.length ? action.checkSelectors : action.openSelectors || [];
          const sels = [...base, ...(action.fallbackSelectors || [])];
          const stepInfo = { stepIndex: actionIndex + 1, type: 'ensureSelect', summary: action.stepLabel || action.expectedText || '', action, rootDoc: scopeDocForAction(action) };
          try {
            await waitForElement(sels, ELEMENT_TIMEOUT_MS, stepInfo);
          } catch (waitErr) {
            if (action.optional) {
              actionIndex++;
              continue;
            }
            throw waitErr;
          }
        } else if (needsElement && (action.selectors?.length || action.fallbackSelectors?.length || action.type === 'type')) {
          const timeout = action.optional ? OPTIONAL_STEP_TIMEOUT_MS : ELEMENT_TIMEOUT_MS;
          const summary = action.stepLabel || action.text || action.displayedValue || action.tagName || action.placeholder || action.name || action.variableKey || '';
          const stepInfo = { stepIndex: actionIndex + 1, type: action.type, summary, action, rootDoc: scopeDocForAction(action) };
          const waitSels = [...(action.selectors || []), ...(action.fallbackSelectors || [])];
          try {
            await waitForElement(waitSels, timeout, stepInfo);
          } catch (waitErr) {
            if (action.optional) {
              actionIndex++;
              continue;
            }
            throw waitErr;
          }
        }
        if (action.type === 'click' && nextNonWait?.type === 'upload' && nextUploadAction && isFilePickerTrigger(action, nextUploadAction)) {
          actionIndex++;
          continue;
        }
        const skipResult = await trySkipByDOMState(action, actions, actionIndex);
        if (skipResult?.skip) {
          actionIndex += skipResult.skipCount || 1;
          continue;
        }
        if (action.runIf && !evaluateRunIfCondition(action.runIf, currentRow || {}, getRowValue)) {
          actionIndex++;
          continue;
        }
        const prevAction = actions[actionIndex - 1];
        const prevMeta = prevAction && (typeof window !== 'undefined' && window.__CFS_stepHandlerMeta) ? window.__CFS_stepHandlerMeta[prevAction.type] : null;
        if (prevMeta && prevMeta.closeUIAfterRun && prevAction.selectors?.length && typeof resolveElement === 'function') {
          const fileEl = resolveElement(prevAction.selectors, document);
          if (fileEl?.type === 'file') await tryCloseUploadUI(fileEl, { onlyUploadScope: true });
        }
        const nextAction = actions[actionIndex + 1];
        await executeAction(action, { nextAction, prevAction });
        await saveVariableIfNeeded(action);
        await waitForStability(action, { nextAction });
        await waitForProceedCondition(action);
        if (action.type === 'screenCapture' && action.saveAsVariable && currentRow) {
          try {
            const stopRes = await new Promise(function(resolve) {
              chrome.runtime.sendMessage({ type: 'STOP_SCREEN_CAPTURE' }, function(r) {
                if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
                else resolve(r || { ok: false });
              });
            });
            if (stopRes && stopRes.ok && stopRes.dataUrl) {
              currentRow[action.saveAsVariable] = stopRes.dataUrl;
            }
          } catch (_) {}
        }
        actionIndex++;
        continue;
      } catch (err) {
        if (err?.message === STOPPED_MSG) {
          isPlaying = false;
          sendResponse?.({ ok: true, done: true, stopped: true });
          return;
        }
        if (action.optional) {
          actionIndex++;
          continue;
        }

        /* ── Fallback: try recorded steps if API step failed with eligible error ── */
        const _fbEligible = err?.fallbackEligible || _isFallbackEligible(err, action);
        if (_fbEligible && action._fallbackActions?.length && action.fallbackMode !== 'never') {
          const fallbackUrl = action._fallbackStartUrl || '';
          const currentUrl = window.location.href || '';
          const sameOrigin = fallbackUrl && currentUrl && (new URL(fallbackUrl).origin === new URL(currentUrl).origin);

          if (fallbackUrl && !sameOrigin) {
            /* Need to navigate to the fallback URL first — signal sidepanel */
            sendResponse?.({
              ok: true,
              navigate: true,
              url: fallbackUrl,
              nextStepIndex: actionIndex,
              _useFallback: true,
              _fallbackActions: action._fallbackActions,
              _fallbackError: formatErr(err),
            });
            return;
          }

          /* Already on the right page (or same origin) — run fallback inline */
          try {
            await runWorkflowActions(action._fallbackActions, currentRow || {});
            actionIndex++;
            continue;
          } catch (fallbackErr) {
            /* Fallback also failed — report both errors */
            const rowFailureAction = (action.onFailure === 'skipRow' ? 'skip' : action.onFailure) || 'stop';
            sendResponse?.({
              ok: false,
              error: formatErr(err) + ' — fallback also failed: ' + formatErr(fallbackErr),
              actionIndex,
              rowFailureAction,
              _fallbackAttempted: true,
            });
            return;
          }
        }

        const recovered = await tryRecoverByReplayingPriorSteps(actions, actionIndex, err);
        if (recovered) {
          continue;
        }
        const retried = await retryAction(action, err);
        if (retried) {
          await waitForStability(action);
          actionIndex++;
          continue;
        }
        const rowFailureAction = (action.onFailure === 'skipRow' ? 'skip' : action.onFailure) || err?.rowFailureAction || 'stop';
        sendResponse?.({ ok: false, error: formatErr(err), actionIndex, rowFailureAction });
        return;
      }
    }

    /* Loop exited without inner return: playback stopped or workflow cleared (e.g. PLAYER_STOP). */
    sendResponse?.({ ok: true, done: true, stopped: true });
  }

  /**
   * When a step fails because an element isn't found (e.g. wait until visible),
   * the DOM may not be ready because a prior dropdown/ensureSelect was skipped.
   * Replay those prior steps to ensure the DOM is in the expected state, then retry.
   */
  async function tryRecoverByReplayingPriorSteps(actions, idx, err) {
    const msg = (err?.message || '').toLowerCase();
    if (!msg.includes('not found') && !msg.includes('element visible')) return false;
    if (!actions || idx <= 0) return false;

    const toReplay = [];
    for (let i = Math.max(0, idx - 2); i < idx; i++) {
      const a = actions[i];
      if (!a) continue;
      const isEnsureSelect = a.type === 'ensureSelect';
      const isDropdownClick = a.type === 'click' && a._dropdownSequence;
      const isSelect = a.type === 'select';
      if (isEnsureSelect || isDropdownClick || isSelect) {
        toReplay.push({ action: a, index: i });
        if (isDropdownClick && i + 1 < idx) {
          const next = actions[i + 1];
          if (next?.type === 'click' && !toReplay.some(t => t.index === i + 1)) {
            toReplay.push({ action: next, index: i + 1 });
          }
        }
      }
    }
    toReplay.sort((a, b) => a.index - b.index);
    if (toReplay.length === 0) return false;

    for (let i = 0; i < toReplay.length; i++) {
      const { action: prior, index } = toReplay[i];
      const nextPrior = actions[index + 1];
      try {
        await executeAction(prior, { nextAction: nextPrior });
        await waitForStability(prior);
        await sleep(400);
      } catch (_) {
        return false;
      }
    }
    return true;
  }

  async function trySkipByDOMState(action, actions, idx) {
    const doc = document;
    const row = currentRow || {};

    if (action.type === 'select' && (action.selectors?.length || action.fallbackSelectors?.length) && typeof resolveElement === 'function') {
      const sels = [...(action.selectors || []), ...(action.fallbackSelectors || [])];
      const el = resolveElement(sels, doc);
      if (el?.tagName?.toLowerCase() === 'select') {
        const target = getRowValue(row, action.variableKey, action.name, 'selectValue');
        if (!target) return null;
        const targetNorm = String(target).trim().toLowerCase();
        const currentVal = (el.value || '').trim();
        const opt = el.options[el.selectedIndex];
        const currentText = opt ? (opt.textContent || opt.value || '').trim() : currentVal;
        const currentNorm = (currentText || currentVal || '').toLowerCase();
        if (!targetNorm) return null;
        if (currentVal.toLowerCase() === targetNorm || currentNorm.includes(targetNorm) || targetNorm.includes(currentNorm)) {
          return { skip: true, skipCount: 1 };
        }
      }
    }

    if (action.type === 'click' && (action.selectors?.length || action.fallbackSelectors?.length) && typeof resolveElement === 'function') {
      const sels = [...(action.selectors || []), ...(action.fallbackSelectors || [])];
      const el = resolveElement(sels, doc);
      if (!el || !isElementVisible(el)) return null;

      const currentText = (el.textContent || el.innerText || el.value || '').replace(/\s+/g, ' ').trim().toLowerCase();

      if (action.skipIfText) {
        const skipNorm = String(action.skipIfText || '').trim().toLowerCase();
        if (skipNorm && currentText.includes(skipNorm)) return { skip: true, skipCount: 1 };
      }

      if (action._dropdownSequence) {
        const target = (action._dropdownSequence.optionText || action._dropdownSequence.toValue || '').trim().toLowerCase();
        if (target && currentText.includes(target)) return { skip: true, skipCount: 2 };
      }

      const nextAction = actions[idx + 1];
      if (nextAction?.type === 'click' && nextAction.type !== 'upload') {
        const nextText = (nextAction.text || nextAction.displayedValue || '').trim().toLowerCase();
        if (nextText && nextText.length >= 3 && currentText.includes(nextText)) {
          return { skip: true, skipCount: 2 };
        }
      }
    }

    if (action.type === 'type' && (action.selectors?.length || action.fallbackSelectors?.length) && typeof resolveElement === 'function') {
      const sels = [...(action.selectors || []), ...(action.fallbackSelectors || [])];
      const el = resolveElement(sels, doc);
      if (el) {
        const target = String(getRowValue(row, action.variableKey, action.placeholder, action.name, 'value')).trim();
        /* Only skip when the row actually supplies the value. Using recordedValue here skipped typing
           when the DOM still matched the recording but the user had set a different row column. */
        if (!target) return null;
        const current = (el.value || el.textContent || '').trim();
        if (current === target) return { skip: true, skipCount: 1 };
      }
    }

    return null;
  }

  const KNOWN_TYPE_IDS = ['PINHOLE_TEXT_AREA_ELEMENT_ID'];
  function findTypeTargetByAttrs(doc, action) {
    for (const knownId of KNOWN_TYPE_IDS) {
      const el = doc.getElementById(knownId);
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable) && isElementVisible(el)) return el;
    }
    const placeholder = (action.placeholder || '').trim();
    const name = (action.name || '').trim();
    const ariaLabel = (action.ariaLabel || '').trim();
    const id = (action.id || '').trim();
    const inputs = doc.querySelectorAll('input:not([type="file"]):not([type="hidden"]), textarea, [contenteditable="true"]');
    const tryMatch = (el) => {
      if (!isElementVisible(el)) return false;
      if (id && (el.id || '').toLowerCase() === id.toLowerCase()) return true;
      if (placeholder && (el.placeholder || '').toLowerCase().includes(placeholder.toLowerCase())) return true;
      if (name && (el.name || el.getAttribute('name') || '').toLowerCase() === name.toLowerCase()) return true;
      if (ariaLabel && (el.getAttribute('aria-label') || '').toLowerCase().includes(ariaLabel.toLowerCase())) return true;
      return false;
    };
    for (const el of inputs) {
      if (tryMatch(el)) return el;
    }
    if (id) {
      const byId = doc.getElementById(id);
      if (byId && (byId.tagName === 'TEXTAREA' || byId.tagName === 'INPUT' || byId.isContentEditable) && isElementVisible(byId)) return byId;
    }
    const row = currentRow || {};
    const valueKey = action.variableKey || action.placeholder || action.name;
    if (valueKey || action.recordedValue != null) {
      let hint = valueKey ? String(getRowValue(row, valueKey, 'value')).trim().slice(0, 30) : '';
      if (hint.length < 3 && action.recordedValue != null) {
        hint = String(action.recordedValue).trim().slice(0, 30);
      }
      if (hint.length >= 3) {
        for (const el of inputs) {
          if (!isElementVisible(el)) continue;
          const pl = (el.placeholder || '').toLowerCase();
          const al = (el.getAttribute('aria-label') || '').toLowerCase();
          const nm = (el.name || '').toLowerCase();
          if (pl.includes(hint.toLowerCase()) || al.includes(hint.toLowerCase()) || nm.includes(hint.toLowerCase())) return el;
        }
      }
    }
    const modalScopes = doc.querySelectorAll('[role="dialog"], [role="alertdialog"], [data-state="open"], .modal, .dialog, [data-radix-popper-content-wrapper]');
    for (const scope of modalScopes) {
      if (!scope || !isElementVisible(scope)) continue;
      const modalInputs = scope.querySelectorAll('input:not([type="file"]):not([type="hidden"]), textarea, [contenteditable="true"]');
      for (const el of modalInputs) {
        if (tryMatch(el)) return el;
      }
      if (placeholder || name || ariaLabel) {
        for (const el of modalInputs) {
          if (!isElementVisible(el)) continue;
          const pl = (el.placeholder || '').toLowerCase();
          const al = (el.getAttribute('aria-label') || '').toLowerCase();
          const nm = (el.name || '').toLowerCase();
          const search = (placeholder || name || ariaLabel || '').toLowerCase().slice(0, 20);
          if (search && (pl.includes(search) || al.includes(search) || nm.includes(search))) return el;
        }
      }
    }
    const promptWords = ['generate', 'video', 'prompt', 'text and frames', 'describe', 'enter', 'create', 'what do you want'];
    for (const el of doc.querySelectorAll('textarea, [contenteditable="true"]')) {
      if (!isElementVisible(el)) continue;
      const pl = (el.placeholder || '').toLowerCase();
      if (promptWords.some(w => pl.includes(w))) return el;
    }
    const firstTextarea = Array.from(doc.querySelectorAll('textarea')).find(t => isElementVisible(t));
    return firstTextarea || null;
  }

  function isExternalNavLink(el) {
    if (!el || (el.tagName || '').toLowerCase() !== 'a') return false;
    const href = (el.getAttribute('href') || '').trim().toLowerCase();
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;
    try {
      const origin = (window.location.origin || '').toLowerCase();
      if (href.includes('discord') || href.includes('discord.gg')) return true;
      if (href.startsWith('http') && origin && !href.startsWith(origin.replace(/\/$/, ''))) return true;
    } catch (_) {}
    return false;
  }

  function findClickableByText(doc, text) {
    if (!text || String(text).trim().length < 3) return null;
    const key = String(text).replace(/\s+/g, ' ').trim().toLowerCase();
    const search = key.includes('upload') ? 'upload' : (key.includes('.jpg') || key.includes('.png') ? '.jpg' : key.slice(0, 25));
    const clickables = doc.querySelectorAll('button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"], label');
    return Array.from(clickables).find(el => {
      if (el.type === 'file') return false;
      if (isExternalNavLink(el)) return false;
      if (!isElementVisible(el)) return false;
      const t = (el.textContent || el.innerText || el.value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!t) return false;
      if (t.includes(key) || key.includes(t)) return true;
      if (search === 'upload' && (t.includes('upload') || t.includes('.jpg') || t.includes('.png'))) return true;
      if (search === '.jpg' && (t.includes('.jpg') || t.includes('.png') || t.includes('upload'))) return true;
      return t.includes(search);
    }) || null;
  }

  const STOPPED_MSG = 'Playback stopped by user';
  function assertPlaying() {
    if (!isPlaying) throw new Error(STOPPED_MSG);
  }

  async function waitForGenerationComplete(cfg, timeoutMs, stepInfo = {}) {
    const doc = (cfg && cfg.rootDoc && cfg.rootDoc.nodeType) ? cfg.rootDoc : document;
    const start = Date.now();
    const { stepIndex, type, summary } = stepInfo;
    const stepLabel = stepIndex ? `Step ${stepIndex} (${type}${summary ? ': ' + String(summary).slice(0, 30) : ''})` : 'Generation';
    const containerSelectors = cfg.containerSelectors || cfg.waitForSelectors || [];
    const videoSelector = cfg.videoSelector || 'video[src]';
    const cardIndex = cfg.cardIndex ?? 'last';
    const pollInterval = 800;

    const defaultSearchRoot = () => {
      if (doc.nodeType === 9) return doc.body;
      if (doc.nodeType === 11) return doc;
      return document.body;
    };

    const getContainer = () => {
      const fallback = defaultSearchRoot();
      const sels = containerSelectors || [];
      if (sels.length === 0) return fallback;
      const first = sels[0];
      if (typeof first === 'string') {
        try {
          const el = doc.querySelector(first);
          return el || fallback;
        } catch (_) {
          return fallback;
        }
      }
      if (typeof resolveElement === 'function') {
        const el = resolveElement(sels, doc);
        return el || fallback;
      }
      return fallback;
    };

    const checkComplete = () => {
      const container = getContainer();
      if (!container) return null;
      const videos = container.querySelectorAll(videoSelector);
      if (videos.length === 0) return false;
      const children = Array.from(container.children).filter(c => c.nodeType === 1);
      const fallbackRoot = defaultSearchRoot();
      const useAny = cardIndex === 'any' || container === fallbackRoot || (doc.nodeType === 9 && container === doc.body);
      if (children.length === 0 || useAny) return videos[0] || false;
      let target = null;
      if (cardIndex === 'last') target = children[children.length - 1];
      else if (cardIndex === 'first') target = children[0];
      else if (typeof cardIndex === 'number' && children[cardIndex]) target = children[cardIndex];
      else target = children[children.length - 1];
      const video = target?.querySelector(videoSelector);
      return video || false;
    };

    while (Date.now() - start < timeoutMs) {
      assertPlaying();
      const result = checkComplete();
      if (result) return result;
      await sleep(pollInterval);
    }
    throw new Error(`${stepLabel} not complete after ${timeoutMs / 1000}s (waiting for ${videoSelector} in container)`);
  }

  async function waitForElement(selectors, timeoutMs, stepInfo = {}) {
    const doc = stepInfo.rootDoc && stepInfo.rootDoc.nodeType ? stepInfo.rootDoc : document;
    const start = Date.now();
    const { stepIndex, type, summary, action } = stepInfo;
    const stepLabel = stepIndex ? `Step ${stepIndex} (${type}${summary ? ': ' + String(summary).slice(0, 30) : ''})` : 'Element';
    const clickFallbackTexts = [...(action?.fallbackTexts || []), ...(summary ? [summary] : []), ...(action?.ariaLabel ? [action.ariaLabel] : [])].filter(Boolean);
    let triedAddClick = false;
    const isWaitingForFileInput = () => {
      for (const s of selectors || []) {
        const v = s?.value ?? s;
        if (typeof v === 'string' && /file|input\[type|input\./i.test(v)) return true;
        if (typeof v === 'object' && (v?.tag === 'input' || /file/i.test(String(v.type || v)))) return true;
      }
      return false;
    };
    while (Date.now() - start < timeoutMs) {
      assertPlaying();
      if (!triedAddClick && isWaitingForFileInput() && Date.now() - start > 1500) {
        const isVideoOrCard = (el) => el.closest('video, [data-index], [class*="card"], [class*="video"], [class*="thumbnail"], [class*="grid-item"], [class*="virtuoso"]');
        const addOrPlusBtn = Array.from(doc.querySelectorAll('button, [role="button"]')).find(el => {
          if (!isElementVisible(el)) return false;
          if (isVideoOrCard(el)) return false;
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
          const aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
          const tLower = t.toLowerCase();
          if (t === '+' || t === 'Add' || t === 'add' || tLower === 'add') return true;
          if (aria === 'add' && t.length <= 10) return true;
          if (t.startsWith('+ ') && t.length <= 5) return true;
          return false;
        });
        if (addOrPlusBtn) {
          triedAddClick = true;
          performClick(addOrPlusBtn.closest('button, [role="button"]') || addOrPlusBtn);
          await sleep(800);
        } else if (Date.now() - start > 4500) {
          triedAddClick = true;
        }
      }
      let candidates = typeof resolveAllCandidates === 'function'
        ? resolveAllCandidates(selectors, doc)
        : (typeof resolveElement === 'function' ? [{ element: resolveElement(selectors, doc) }] : []).filter(c => c?.element);
      if (candidates.length === 0 && type === 'click' && clickFallbackTexts.length) {
        for (const text of clickFallbackTexts) {
          const fallback = findClickableByText(doc, text);
          if (fallback) {
            candidates = [{ element: fallback, selector: null }];
            break;
          }
        }
      }
      if (candidates.length === 0 && type === 'ensureSelect' && summary) {
        const key = String(summary).replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 35);
        if (key.length >= 2) {
          const triggers = doc.querySelectorAll('[role="combobox"], button, select');
          const fallback = Array.from(triggers).find(el => {
            if (!isElementVisible(el)) return false;
            const t = (el.textContent || el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase();
            if (!t) return false;
            return t.includes(key) || key.includes(t) || (key.length >= 4 && t.includes(key.slice(0, -1)));
          });
          if (fallback) candidates = [{ element: fallback, selector: null }];
        }
      }
      if (candidates.length === 0 && type === 'type' && summary) {
        const inputs = doc.querySelectorAll('input:not([type="file"]):not([type="hidden"]), textarea, [contenteditable="true"]');
        const key = String(summary).trim().toLowerCase().slice(0, 30);
        if (key.length >= 2) {
          const fallback = Array.from(inputs).find(el => {
            if (!el.offsetParent && el.tagName !== 'TEXTAREA') return false;
            const pl = (el.placeholder || '').toLowerCase();
            const al = (el.getAttribute('aria-label') || '').toLowerCase();
            return pl.includes(key) || al.includes(key) || key.includes(pl) || key.includes(al);
          });
          if (fallback) candidates = [{ element: fallback, selector: null }];
        }
      }
      if (candidates.length > 1) {
        candidates.sort((a, b) => {
          const va = a.element && isElementVisible(a.element) ? 1 : 0;
          const vb = b.element && isElementVisible(b.element) ? 1 : 0;
          return vb - va;
        });
      }
      for (const { element: el } of candidates) {
        if (!el) continue;
        if (el.type === 'file' || isElementVisible(el)) return el;
        try {
          el.scrollIntoView({ block: 'center', behavior: 'auto' });
          await sleep(300);
          if (isElementVisible(el)) return el;
        } catch (_) {}
      }
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error(`${stepLabel} not found after ${timeoutMs / 1000}s (polling every ${POLL_INTERVAL_MS / 1000}s)`);
  }

  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findUploadLabel(fileInput) {
    if (!fileInput || fileInput.type !== 'file') return null;
    let el = fileInput.parentElement;
    for (let i = 0; i < 12 && el; i++) {
      const t = (el.textContent || '').trim();
      if (/upload/i.test(t) && (/\.png|\.jpg|\.webp|\.heic|\.avif/i.test(t) || t.length < 80)) return el;
      el = el.parentElement;
    }
    return fileInput.closest('label') || null;
  }

  function showUploadingOverlay(container) {
    if (!container) return null;
    try {
      const rect = container.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return null;
      const overlay = document.createElement('div');
      overlay.setAttribute('data-ai-uploading', '1');
      overlay.textContent = 'Uploading…';
      overlay.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.95);color:#333;font-size:14px;z-index:9999;pointer-events:none;';
      const prevPos = container.style.position;
      if (!prevPos || prevPos === 'static') container.style.position = 'relative';
      container.appendChild(overlay);
      return {
        el: overlay,
        restore: () => { if (!prevPos || prevPos === 'static') container.style.position = prevPos || ''; },
      };
    } catch (_) { return null; }
  }

  function isFilePickerTrigger(clickAction, uploadAction) {
    const doc = document;
    const clickSels = [...(clickAction.selectors || []), ...(clickAction.fallbackSelectors || [])];
    const uploadSels = [...(uploadAction.selectors || []), ...(uploadAction.fallbackSelectors || [])];
    const clickEl = clickSels.length && typeof resolveElement === 'function' ? resolveElement(clickSels, doc) : null;
    const fileInput = uploadSels.length && typeof resolveElement === 'function' ? resolveElement(uploadSels, doc) : null;
    if (!clickEl || !fileInput || fileInput.type !== 'file') return false;
    if (clickEl === fileInput) return true;
    const id = fileInput.id;
    if (id && clickEl.tagName?.toLowerCase() === 'label' && clickEl.getAttribute('for') === id) return true;
    if (clickEl.contains(fileInput)) return true;
    if (clickEl.parentElement?.contains(fileInput)) return true;
    const form = fileInput.closest('form');
    if (form && form.contains(clickEl)) return true;
    let p = clickEl.parentElement;
    for (let i = 0; i < 5 && p; i++) {
      if (p.contains(fileInput)) return true;
      p = p.parentElement;
    }
    p = fileInput.parentElement;
    for (let i = 0; i < 5 && p; i++) {
      if (p.contains(clickEl)) return true;
      p = p.parentElement;
    }
    return false;
  }

  function looksLikeUploadTrigger(action) {
    const t = ((action.text || '') + (action.tagName || '')).toLowerCase();
    const uploadWords = ['upload', 'choose', 'browse', 'file', 'add file', 'select file', 'attach', 'drop'];
    return uploadWords.some(w => t.includes(w));
  }

  const UPLOAD_DONE_WORDS = ['done', 'confirm', 'apply', 'ok', 'use this', 'insert', 'save', 'add', 'upload', 'crop'];
  const UPLOAD_OPEN_PICKER_WORDS = ['choose file', 'browse', 'select file', 'pick file', 'add file', 'upload'];
  const UPLOAD_CANCEL_WORDS = ['cancel', 'close', 'dismiss'];
  function tryClickUploadConfirm(fileInput, opts = {}) {
    const onlyUploadScope = opts.onlyUploadScope;
    const scopes = [];
    let el = fileInput;
    for (let i = 0; i < 15 && el; i++) {
      const d = el.closest('[role="dialog"], [role="alertdialog"], [data-state], .modal, .dialog, [data-modal], [data-dialog], [data-radix-popper-content-wrapper]');
      if (d && !scopes.includes(d)) scopes.push(d);
      el = el.parentElement;
    }
    scopes.push(fileInput.closest('form') || document.body);
    if (!onlyUploadScope) {
      for (const d of document.querySelectorAll('[role="dialog"], [role="alertdialog"], [data-state="open"], .modal, .dialog, [data-modal], [data-dialog], [data-radix-popper-content-wrapper]')) {
        if (d && isElementVisible(d) && !scopes.includes(d)) scopes.push(d);
      }
    }
    const seen = new Set();
    const candidates = [];
    for (const scope of scopes) {
      if (!scope || seen.has(scope)) continue;
      seen.add(scope);
      for (const btn of scope.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a[role="button"]')) {
        if (!isElementVisible(btn) || btn.disabled) continue;
        const text = (btn.textContent || btn.value || btn.getAttribute('aria-label') || '').trim().toLowerCase();
        if (UPLOAD_CANCEL_WORDS.some(w => text === w || text.startsWith(w + ' ') || text.endsWith(' ' + w))) continue;
        if (UPLOAD_OPEN_PICKER_WORDS.some(w => text.includes(w))) continue;
        if (UPLOAD_DONE_WORDS.some(w => text.includes(w))) {
          const isPrimary = /primary|submit|confirm|cta/i.test(btn.className + ' ' + (btn.getAttribute('data-variant') || ''));
          candidates.push({ btn, isPrimary });
        }
      }
    }
    candidates.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
    for (const { btn } of candidates) {
      try {
        performClick(btn);
        return true;
      } catch (_) {}
    }
    return false;
  }
  async function tryCloseUploadUI(fileInput, opts = {}) {
    const onlyUploadScope = opts.onlyUploadScope;
    const confirmOpts = onlyUploadScope ? { onlyUploadScope: true } : {};
    const delays = [0, 100, 250, 500, 1000, 1500, 2000];
    if (onlyUploadScope) {
      await sleep(400);
      try {
        fileInput.blur();
        document.body.focus();
      } catch (_) {}
      await sleep(100);
      const popper = fileInput.closest('[data-radix-popper-content-wrapper]');
      const dialog = document.querySelector('[role="dialog"]');
      const clickTarget = dialog && isElementVisible(dialog) && (!popper || !popper.contains(dialog)) ? dialog : document.body;
      try {
        const rect = clickTarget.getBoundingClientRect();
        const x = rect.left + Math.min(50, rect.width / 2);
        const y = rect.top + Math.min(50, rect.height / 2);
        clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 }));
        clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 }));
        clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 }));
      } catch (_) {}
      await sleep(150);
      for (let i = 0; i < 3; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        await sleep(150);
      }
    }
    for (const delay of delays) {
      await sleep(delay);
      if (tryClickUploadConfirm(fileInput, confirmOpts)) {
        await sleep(150);
        return true;
      }
    }
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
      await sleep(100);
    } catch (_) {}
    for (const delay of [0, 200, 500]) {
      await sleep(delay);
      if (tryClickUploadConfirm(fileInput, confirmOpts)) return true;
    }
    return false;
  }

  function applyRowMapping(row, mapping) {
    if (!mapping || !Object.keys(mapping).length) return { ...row };
    const result = { ...row };
    for (const [nestedKey, parentKey] of Object.entries(mapping)) {
      result[nestedKey] = row[parentKey];
    }
    return result;
  }

  async function runWorkflowActions(actions, row) {
    const prevRow = currentRow;
    currentRow = row;
    try {
      for (let i = 0; i < actions.length; i++) {
        const a = actions[i];
        if (a.type === 'loop') {
          await executeLoop(a);
        } else if (a.type === 'runWorkflow') {
          const nested = a.nestedWorkflow;
          if (!nested?.actions?.length) throw new Error('Nested workflow not found');
          const nestedRow = applyRowMapping(currentRow || {}, a.rowMapping);
          await runWorkflowActions(nested.actions, nestedRow);
        } else {
          if (a.delay && a.delay > 0) await sleep(a.delay);
          if (a.type === 'ensureSelect' && (a.checkSelectors?.length || a.openSelectors?.length || a.fallbackSelectors?.length)) {
            const base = a.checkSelectors?.length ? a.checkSelectors : a.openSelectors || [];
            const sels = [...base, ...(a.fallbackSelectors || [])];
            const stepInfo = { stepIndex: i + 1, type: 'ensureSelect', summary: a.expectedText || '', action: a, rootDoc: scopeDocForAction(a) };
            try {
              await waitForElement(sels, a.optional ? OPTIONAL_STEP_TIMEOUT_MS : ELEMENT_TIMEOUT_MS, stepInfo);
            } catch (waitErr) {
              if (a.optional) continue;
              throw waitErr;
            }
          } else if ((window.__CFS_stepHandlerMeta && window.__CFS_stepHandlerMeta[a.type]?.needsElement) && (a.selectors?.length || a.fallbackSelectors?.length)) {
            const sels = [...(a.selectors || []), ...(a.fallbackSelectors || [])];
            const stepInfo = { stepIndex: i + 1, type: a.type, summary: a.stepLabel || a.text || a.tagName || '', action: a, rootDoc: scopeDocForAction(a) };
            try {
              await waitForElement(sels, a.optional ? OPTIONAL_STEP_TIMEOUT_MS : ELEMENT_TIMEOUT_MS, stepInfo);
            } catch (waitErr) {
              if (a.optional) continue;
              throw waitErr;
            }
          }
          const skipResult = await trySkipByDOMState(a, actions, i);
          if (skipResult?.skip) {
            i += (skipResult.skipCount || 1) - 1;
            continue;
          }
          if (a.runIf && !evaluateRunIfCondition(a.runIf, currentRow || {}, getRowValue)) continue;
          await executeAction(a);
          await waitForStability(a);
        }
      }
    } finally {
      currentRow = prevRow;
    }
  }

  async function executeLoop(loopAction) {
    if (loopAction.delay && loopAction.delay > 0) await sleep(loopAction.delay);
    const steps = loopAction.steps || [];
    const waitBeforeNext = loopAction.waitBeforeNext || { type: 'time', minMs: 500, maxMs: 1500 };
    const listVariable = (loopAction.listVariable || '').trim();
    const itemVariable = (loopAction.itemVariable || 'item').trim() || 'item';
    const indexVariable = (loopAction.indexVariable || 'itemIndex').trim() || 'itemIndex';

    let iterations;
    if (listVariable) {
      const row = currentRow || {};
      const raw = row[listVariable];
      if (raw == null) {
        iterations = [];
      } else if (Array.isArray(raw)) {
        iterations = raw;
      } else if (typeof raw === 'string' && raw.trim()) {
        try {
          const parsed = JSON.parse(raw);
          iterations = Array.isArray(parsed) ? parsed : [raw];
        } catch (_) {
          iterations = [raw];
        }
      } else {
        iterations = [raw];
      }
    } else {
      const count = Math.max(1, loopAction.count || 1);
      iterations = Array.from({ length: count }, (_, i) => i);
    }

    for (let i = 0; i < iterations.length; i++) {
      assertPlaying();
      const rowBase = currentRow && typeof currentRow === 'object' ? { ...currentRow } : {};
      if (listVariable) {
        rowBase[itemVariable] = iterations[i];
        rowBase[indexVariable] = i;
      }
      for (let j = 0; j < steps.length; j++) {
        const step = steps[j];
        const nextStep = steps[j + 1];
        if (step.type === 'click' && nextStep?.type === 'upload') continue;
        if (step.type === 'runWorkflow') {
          const nested = step.nestedWorkflow;
          if (nested?.actions?.length) {
            const nestedRow = applyRowMapping(rowBase, step.rowMapping);
            await runWorkflowActions(nested.actions, nestedRow);
          }
        } else {
          const prevRow = currentRow;
          currentRow = rowBase;
          try {
            const skipResult = await trySkipByDOMState(step, steps, j);
            if (skipResult?.skip) {
              j += (skipResult.skipCount || 1) - 1;
            } else if (step.runIf && !evaluateRunIfCondition(step.runIf, currentRow || {}, getRowValue)) {
              /* skip */
            } else {
              await executeAction(step);
            }
            await waitForStability(step);
          } finally {
            currentRow = prevRow;
          }
        }
      }
      if (i < iterations.length - 1) {
        if (waitBeforeNext.type === 'element' && waitBeforeNext.selectors?.length) {
          await waitForElement(waitBeforeNext.selectors, waitBeforeNext.timeoutMs || 10000);
        } else {
          const minMs = waitBeforeNext.minMs ?? 500;
          const maxMs = waitBeforeNext.maxMs ?? 1500;
          const lo = Math.min(minMs, maxMs);
          const hi = Math.max(minMs, maxMs);
          const ms = Math.floor(lo + Math.random() * (hi - lo + 1));
          await sleep(ms);
        }
      }
    }
  }

  function findMediaElement(el) {
    if (!el) return null;
    if (el instanceof HTMLMediaElement) return el;
    const found = el.closest('video, audio') || el.querySelector('video, audio');
    if (found) return found;
    let parent = el.parentElement;
    for (let i = 0; i < 8 && parent; i++) {
      const v = parent.querySelector('video, audio');
      if (v) return v;
      parent = parent.parentElement;
    }
    return null;
  }

  async function captureAudioFromElement(selector, durationMs, root) {
    const doc = root || document;
    let el = null;
    if (selector && typeof resolveElement === 'function') {
      const arr = Array.isArray(selector) ? selector : [selector];
      el = resolveElement(arr, doc);
    } else if (typeof selector === 'string') {
      el = doc.querySelector(selector);
    }
    const mediaEl = findMediaElement(el);
    if (!mediaEl) return null;
    if (mediaEl.paused) {
      if (el && el !== mediaEl) {
        try { performClick(el); } catch (_) {}
        await new Promise(r => setTimeout(r, 600));
      }
      if (mediaEl.paused) {
        try { await mediaEl.play().catch(() => {}); } catch (_) {}
        await new Promise(r => setTimeout(r, 800));
      }
    }
    let stream;
    try {
      stream = (mediaEl.captureStream && mediaEl.captureStream()) || (mediaEl.mozCaptureStream && mediaEl.mozCaptureStream());
    } catch (e) {
      const msg = (e?.message || '').toLowerCase();
      if (msg.includes('cross-origin') || msg.includes('crossorigin')) {
        throw new Error('Cross-origin media. Use the Tab audio button to capture via the picker.');
      }
      throw e;
    }
    if (!stream) return null;
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.start();
    const duration = Math.min(Math.max(durationMs || 5000, 1000), 60000);
    await new Promise(r => setTimeout(r, duration));
    recorder.stop();
    await new Promise(r => { recorder.onstop = r; });
    if (chunks.length === 0) return null;
    return new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
  }

  async function executeEnsureSelect(action) {
    const baseDoc = document;
    const doc = typeof resolveDocumentForAction === 'function'
      ? resolveDocumentForAction(action, baseDoc)
      : baseDoc;
    const docForKeyboard = doc.nodeType === 9 ? doc : (doc.ownerDocument || document);
    const checkBase = action.checkSelectors?.length ? action.checkSelectors : action.openSelectors || [];
    const openBase = action.openSelectors?.length ? action.openSelectors : action.checkSelectors || [];
    const checkSels = [...checkBase, ...(action.fallbackSelectors || [])];
    const openSels = [...openBase, ...(action.fallbackSelectors || [])];
    const expectedText = String(action.expectedText || '').trim().toLowerCase();
    const optionText = String(action.optionText || action.expectedText || '').trim();
    const optionTexts = Array.isArray(action.optionTexts) ? action.optionTexts : [];
    const optionSels = action.optionSelectors || [];

    if (!expectedText && !optionText && optionTexts.length === 0) throw new Error('ensureSelect requires expectedText, optionText, or optionTexts');

    let checkEl = null;
    if (checkSels?.length && typeof resolveElement === 'function') {
      checkEl = resolveElement(checkSels, doc);
    }
    if (!checkEl && openSels?.length && typeof resolveElement === 'function') {
      checkEl = resolveElement(openSels, doc);
    }
    if (!checkEl && expectedText) {
      const key = expectedText.slice(0, 35);
      if (key.length >= 2) {
        const creationArea = doc.getElementById('PINHOLE_TEXT_AREA_ELEMENT_ID')?.closest('div') || doc.querySelector('[data-slate-editor="true"]')?.closest('div');
        const triggers = Array.from(doc.querySelectorAll('[role="combobox"], button, select'));
        const matches = (list) => list.find(el => {
          if (!isElementVisible(el)) return false;
          const t = (el.textContent || el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase();
          return t && (t.includes(key) || key.includes(t) || (key.length >= 4 && t.includes(key.slice(0, -1))));
        });
        if (creationArea) {
          const inArea = triggers.filter(el => creationArea.contains(el));
          checkEl = matches(inArea) || matches(triggers);
        } else {
          checkEl = matches(triggers);
        }
      }
    }
    if (!checkEl) throw new Error('ensureSelect: check/open element not found');

    const currentText = (checkEl.textContent || checkEl.innerText || checkEl.value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (optionTexts.length === 0 && expectedText && currentText.includes(expectedText)) return;

    let openEl = checkEl;
    if (openSels?.length && openSels !== checkSels && typeof resolveElement === 'function') {
      const o = resolveElement(openSels, doc);
      if (o) openEl = o;
    }
    assertPlaying();
    const comboboxBtn = openEl.closest('button, a, [role="button"], [role="combobox"]') || openEl;
    comboboxBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(200);
    try {
      comboboxBtn.click();
    } catch (_) {
      performClick(comboboxBtn);
    }
    await sleep(800);

    const optionSelectorsStr = '[role="option"], [role="menuitem"], [role="tab"], [data-radix-select-item], [data-radix-collection-item], button, li, [role="listbox"] *, [role="menu"] *, .dropdown-item, [data-option], [data-value], [data-radix-select-viewport] *, [data-radix-select-content] *, [cmdk-item], [data-highlighted]';
    const getDropdownScope = () => {
      const controlsId = comboboxBtn.getAttribute('aria-controls');
      if (controlsId) {
        const panel = doc.getElementById(controlsId);
        if (panel) return panel;
      }
      const radixContent = doc.querySelector('[data-radix-select-content], [data-radix-popper-content-wrapper], [data-radix-menu-content], [role="listbox"], [role="menu"]');
      return radixContent || doc;
    };
    const findOption = (key) => {
      const k = key.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 50);
      const scope = getDropdownScope();
      const excludeCombobox = (el) => el !== comboboxBtn && !comboboxBtn.contains(el);
      const candidates = Array.from(scope.querySelectorAll(optionSelectorsStr));
      return candidates.find(el => {
        if (!excludeCombobox(el)) return false;
        if (!isElementVisible(el)) return false;
        const t = (el.textContent || el.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
        return t.includes(k) || k.includes(t) || (k.length >= 4 && t.includes(k.slice(0, -2)));
      });
    };

    if (optionTexts.length > 0) {
      const clickDelayMs = Math.max(0, parseInt(action.optionTextsClickDelayMs, 10)) || 250;
      const closeKey = action.optionTextsCloseKey === '' ? '' : (action.optionTextsCloseKey || 'Escape').trim();
      let closeKeyCount = Math.max(0, parseInt(action.optionTextsCloseKeyCount, 10));
      if (closeKey && (isNaN(closeKeyCount) || closeKeyCount < 1)) closeKeyCount = 2;
      const afterCloseDelayMs = Math.max(0, parseInt(action.optionTextsAfterCloseDelayMs, 10)) || 300;
      const keyCodeByKey = { Escape: 27, Enter: 13 };

      for (const text of optionTexts) {
        let optionEl = null;
        for (let attempt = 0; attempt < 10 && !optionEl; attempt++) {
          if (attempt > 0) await sleep(200);
          optionEl = findOption(text);
        }
        if (!optionEl) throw new Error(`ensureSelect: option "${text}" not found in menu (optionTexts)`);
        const clickTarget = optionEl.closest('button, a, [role="button"], [role="option"], [role="menuitem"], [role="tab"], [data-radix-select-item], [data-radix-collection-item]') || optionEl;
        if (isExternalNavLink(clickTarget)) throw new Error(`ensureSelect: would open external link, skipping "${text}"`);
        clickTarget.scrollIntoView({ block: 'nearest' });
        await sleep(100);
        try {
          clickTarget.click();
        } catch (_) {
          performClick(clickTarget);
        }
        await sleep(clickDelayMs);
      }
      if (closeKey && closeKeyCount > 0) {
        const keyCode = keyCodeByKey[closeKey] || 0;
        try {
          for (let i = 0; i < closeKeyCount; i++) {
            docForKeyboard.dispatchEvent(new KeyboardEvent('keydown', { key: closeKey, keyCode, bubbles: true }));
            await sleep(100);
          }
        } catch (_) {}
      }
      await sleep(afterCloseDelayMs);
      return;
    }

    let optionEl = null;
    const maxOptionWaitAttempts = 14;
    for (let attempt = 0; attempt < maxOptionWaitAttempts && !optionEl; attempt++) {
      if (attempt > 0) await sleep(250);
      if (optionSels?.length && typeof resolveElement === 'function') {
        optionEl = resolveElement(optionSels, doc);
      }
      if (!optionEl && optionText) {
        const candidates = [optionText];
        const labelPart = optionText.replace(/^[a-z0-9_]+(?=[A-Z\s])/i, '').trim();
        if (labelPart && labelPart !== optionText && labelPart.length >= 2) candidates.push(labelPart);
        for (const key of candidates) {
          optionEl = findOption(key);
          if (optionEl) break;
        }
        if (!optionEl) optionEl = findClickableByText(doc, optionText);
        if (!optionEl) {
          const k = optionText.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 50);
          const menuScopes = doc.querySelectorAll('[role="listbox"], [role="menu"], [data-radix-select-content], [data-radix-select-viewport], [role="presentation"]');
          for (const scope of menuScopes) {
            if (!scope.contains(comboboxBtn) && isElementVisible(scope)) {
              const opts = scope.querySelectorAll('[role="option"], [role="menuitem"], [role="tab"], [data-radix-select-item], div, span');
              optionEl = Array.from(opts).find(el => {
                if (el === comboboxBtn || comboboxBtn.contains(el)) return false;
                const t = (el.textContent || el.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
                return t.length >= 3 && (t.includes(k) || k.includes(t));
              });
              if (optionEl) break;
            }
          }
        }
      }
    }
    if (!optionEl) throw new Error(`ensureSelect: option "${optionText}" not found`);
    const clickTarget = optionEl.closest('button, a, [role="button"], [role="option"], [role="menuitem"], [data-radix-select-item], [data-radix-collection-item]') || optionEl;
    if (isExternalNavLink(clickTarget)) throw new Error(`ensureSelect: would open external link (e.g. Discord), skipping`);
    clickTarget.scrollIntoView({ block: 'nearest' });
    await sleep(100);
    try {
      clickTarget.click();
    } catch (_) {
      performClick(clickTarget);
    }
    await sleep(600);
  }

  async function retryAction(action, err) {
    if (action?.type === 'upload') return false;
    const isNotFound = err?.message?.includes('not found') || err?.message?.includes('Element not found') || err?.message?.includes('failed');
    if (!isNotFound) return false;
    const retrySels = [...(action.selectors || []), ...(action.fallbackSelectors || [])];
    for (let attempt = 0; attempt < 2; attempt++) {
      await sleep(POLL_INTERVAL_MS * (attempt + 1));
      try {
        if (retrySels.length) await waitForElement(retrySels, 15000, { action, rootDoc: scopeDocForAction(action) });
        await executeAction(action);
        return true;
      } catch (_) {}
    }
    return false;
  }

  /** Returns a clickable element after crop/save (image in grid) for use by click step handler. */
  function findClickableImageAfterCropSave(doc, prevAction) {
    const prevWasCropOrSave = prevAction?.type === 'click' && /crop|save/i.test((prevAction.text || prevAction.displayedValue || '').trim());
    if (!prevWasCropOrSave) return null;
    const imgContainers = doc.querySelectorAll('[data-index] img, .virtuoso-grid-item img, [class*="grid"] img, [class*="card"] img, [class*="item"] img');
    const clickable = Array.from(imgContainers).find(el => {
      if (!isElementVisible(el)) return false;
      const parent = el.closest('button, a, [role="button"], [onclick], [data-index]');
      return parent && isElementVisible(parent);
    });
    if (!clickable) return null;
    const target = clickable.closest('button, a, [role="button"], [onclick]') || clickable.parentElement;
    return target && isElementVisible(target) ? target : null;
  }

  /**
   * Resolve element using action.selectors + action.fallbackSelectors so step handlers
   * get fallback chain without merging manually. Use this in new step types to keep error correction consistent.
   */
  function resolveElementForAction(action, doc = document) {
    if (!action || typeof resolveElement !== 'function') return null;
    const sels = [...(action.selectors || []), ...(action.fallbackSelectors || [])];
    return sels.length ? resolveElement(sels, doc) : null;
  }

  /**
   * Resolve all elements using action.selectors + action.fallbackSelectors.
   */
  function resolveAllElementsForAction(action, doc = document) {
    if (!action || typeof resolveAllElements !== 'function') return [];
    const sels = [...(action.selectors || []), ...(action.fallbackSelectors || [])];
    return sels.length ? resolveAllElements(sels, doc) : [];
  }

  /**
   * Resolve all candidates (element + selector) using action.selectors + action.fallbackSelectors.
   */
  function resolveAllCandidatesForAction(action, doc = document) {
    if (!action || typeof resolveAllCandidates !== 'function') return [];
    const sels = [...(action.selectors || []), ...(action.fallbackSelectors || [])];
    return sels.length ? resolveAllCandidates(sels, doc) : [];
  }

  /**
   * Narrow automation to a same-origin iframe and/or one open shadow root (in that order).
   * Optional on any action: `iframeSelectors`, `shadowHostSelectors` (same entry shape as other selector lists).
   */
  function resolveDocumentForAction(action, baseDoc) {
    const root = baseDoc && baseDoc.nodeType ? baseDoc : document;
    if (!action || typeof resolveElement !== 'function') return root;
    let doc = root;
    const iframeSels = [...(action.iframeSelectors || []), ...(action.iframeFallbackSelectors || [])];
    if (iframeSels.length) {
      const iframeEl = resolveElement(iframeSels, doc);
      if (!iframeEl || String(iframeEl.tagName || '').toLowerCase() !== 'iframe') {
        throw new Error('iframeSelectors did not resolve to an iframe element');
      }
      const cd = iframeEl.contentDocument;
      if (!cd) {
        throw new Error('Cannot access iframe document (cross-origin or not loaded)');
      }
      doc = cd;
    }
    const shadowSels = [...(action.shadowHostSelectors || []), ...(action.shadowHostFallbackSelectors || [])];
    if (shadowSels.length) {
      const host = resolveElement(shadowSels, doc);
      if (!host) throw new Error('shadowHostSelectors did not resolve to an element');
      const sr = host.shadowRoot;
      if (!sr) throw new Error('Element has no open shadow root');
      doc = sr;
    }
    return doc;
  }

  /**
   * Like resolveElementForAction but always resolves under `doc` (e.g. after resolveDocumentForAction).
   * Does not read iframe/shadow fields — use resolveDocumentForAction first.
   */
  function resolveElementForActionInDocument(action, doc = document) {
    if (!action || typeof resolveElement !== 'function') return null;
    const sels = [...(action.selectors || []), ...(action.fallbackSelectors || [])];
    return sels.length ? resolveElement(sels, doc) : null;
  }

  /** Document or ShadowRoot for wait/resolve when action sets iframe or shadow scope. */
  function scopeDocForAction(action) {
    if (!action) return document;
    const hasScope =
      (action.iframeSelectors && action.iframeSelectors.length) ||
      (action.iframeFallbackSelectors && action.iframeFallbackSelectors.length) ||
      (action.shadowHostSelectors && action.shadowHostSelectors.length) ||
      (action.shadowHostFallbackSelectors && action.shadowHostFallbackSelectors.length);
    if (!hasScope) return document;
    try {
      return resolveDocumentForAction(action, document);
    } catch (_) {
      return document;
    }
  }

  /**
   * Step handlers are loaded from per-step JS files (steps/{id}/handler.js) at init.
   * Element steps (click, type, select, upload, download) receive ctx with helpers
   * and implement their own resolution + execution. See docs/STEP_PLUGINS.md.
   */
  function getStepContext() {
    return {
      resolveElement: typeof resolveElement === 'function' ? resolveElement : null,
      resolveAllElements: typeof resolveAllElements === 'function' ? resolveAllElements : null,
      resolveElementForAction,
      resolveElementForActionInDocument,
      resolveDocumentForAction,
      scopeDocForAction,
      resolveAllElementsForAction,
      resolveAllCandidatesForAction,
      resolveAllCandidates: typeof resolveAllCandidates === 'function' ? resolveAllCandidates : null,
      isElementVisible,
      isExternalNavLink,
      findClickableByText,
      findClickableImageAfterCropSave,
      findTypeTargetByAttrs,
      isFilePickerTrigger,
      looksLikeUploadTrigger,
      KNOWN_TYPE_IDS,
      performClick,
      yieldToReact,
      typeIntoElement,
      setNativeInputValue,
      setNativeSelectValue,
      dispatchInputEvent,
      findUploadLabel,
      showUploadingOverlay,
      fetchFileFromUrl,
      tryCloseUploadUI,
      sleep,
      assertPlaying,
      getRowValue,
      currentRow: currentRow || {},
      currentRowIndex,
      currentWorkflow: currentWorkflow || null,
      personalInfo: (currentWorkflow && Array.isArray(currentWorkflow.personalInfo)) ? currentWorkflow.personalInfo : [],
      document,
      actionIndex,
      nextAction: undefined,
      prevAction: undefined,
      waitForElement,
      waitForGenerationComplete,
      runExtractData,
      executeEnsureSelect,
      captureAudioFromElement: typeof captureAudioFromElement === 'function' ? captureAudioFromElement : null,
      sendMessage: (payload) => new Promise((resolve) => {
        /* Auto-inject cryptoWalletId into crypto-related service worker messages */
        const p = (currentCryptoWalletId && payload && typeof payload === 'object' && !payload.walletId)
          ? { ...payload, walletId: currentCryptoWalletId }
          : payload;
        chrome.runtime.sendMessage(p, (res) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(res != null ? res : { ok: false, error: 'No response' });
        });
      }),
      cryptoWalletId: currentCryptoWalletId || '',
    };
  }

  function getStepHandlers() {
    return (typeof window !== 'undefined' && window.__CFS_stepHandlers) ? window.__CFS_stepHandlers : {};
  }

  function waitStepHandlersReady(ms) {
    return new Promise((resolve, reject) => {
      if (window.__CFS_stepHandlersInjectFailed) {
        reject(new Error('Step handler injection failed'));
        return;
      }
      if (window.__CFS_stepHandlersReady) { resolve(); return; }
      const timeoutMs = ms != null ? ms : STEP_HANDLERS_READY_TIMEOUT_MS;
      let pollTimer = null;
      const cleanup = () => {
        clearTimeout(t);
        if (pollTimer != null) clearInterval(pollTimer);
        window.removeEventListener('cfs-step-handlers-ready', onReady);
      };
      const tryResolve = () => {
        if (window.__CFS_stepHandlersInjectFailed) {
          cleanup();
          reject(new Error('Step handler injection failed'));
          return true;
        }
        if (window.__CFS_stepHandlersReady) {
          cleanup();
          resolve();
          return true;
        }
        return false;
      };
      const onTimeout = () => {
        if (tryResolve()) return;
        cleanup();
        reject(new Error('Step handlers did not load in time'));
      };
      const t = setTimeout(onTimeout, timeoutMs);
      const onReady = () => {
        tryResolve();
      };
      window.addEventListener('cfs-step-handlers-ready', onReady);
      pollTimer = setInterval(() => {
        tryResolve();
      }, 100);
    });
  }

  /** Run the registered handler for this step. Handlers must throw on failure so the player can report actionIndex for error correction (scroll to step, Validate/Compare hint). */
  async function executeAction(action, opts = {}) {
    if (!action) throw new Error('No action to execute');
    const stepHandlers = getStepHandlers();
    const { nextAction, prevAction } = opts;
    const doc = document;
    const row = currentRow || {};
    const ctx = getStepContext();
    ctx.nextAction = nextAction;
    ctx.prevAction = prevAction;
    const handler = stepHandlers[action.type];
    if (!handler) {
      throw new Error('Unknown step type: "' + (action.type || '') + '". Check that the step is registered and the workflow uses a valid type.');
    }
    await handler(action, { ...opts, ctx });
  }

  async function saveVariableIfNeeded(action) {
    const varName = action.saveAsVariable;
    if (!varName || !currentRow) return;
    if (action.type === 'type') {
      currentRow[varName] = String(getRowValue(currentRow, action.variableKey, action.placeholder, action.name, 'value'));
    } else if (action.type === 'select') {
      const sels = [...(action.selectors || []), ...(action.fallbackSelectors || [])];
      const el = sels.length && typeof resolveElement === 'function' ? resolveElement(sels, document) : null;
      if (el?.tagName?.toLowerCase() === 'select') currentRow[varName] = el.value || '';
    } else if (action.type === 'click' && action.saveAsVariableSelector) {
      await sleep(500);
      const sel = action.saveAsVariableSelector;
      const arr = Array.isArray(sel) ? sel : [sel];
      const el = typeof resolveElement === 'function' ? resolveElement(arr, document) : null;
      if (el) currentRow[varName] = (el.textContent || el.value || '').trim();
    }
  }

  function getRowValue(row, ...keys) {
    if (!row || typeof row !== 'object') return '';
    for (const k of keys.filter(Boolean)) {
      if (row[k] !== undefined) return row[k];
      const lower = (k || '').toLowerCase();
      const match = Object.keys(row).find(rk => (rk || '').toLowerCase() === lower);
      if (match !== undefined) return row[match];
    }
    return '';
  }

  function evaluateRunIfCondition(runIfRaw, row, getRv) {
    const ric = typeof CFS_runIfCondition !== 'undefined' ? CFS_runIfCondition : null;
    if (ric && typeof ric.evaluate === 'function') return ric.evaluate(runIfRaw, row, getRv);
    const s = String(runIfRaw || '').trim();
    if (!s) return true;
    const key = s.replace(/^\{\{\s*|\s*\}\}$/g, '').trim();
    const val = key ? getRv(row, key) : undefined;
    return !(val === undefined || val === null || val === '' || val === false || val === 0);
  }

  function performClick(el) {
    if (!el || !el.dispatchEvent) return;
    try {
      const rect = el.getBoundingClientRect();
      const opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, button: 0, buttons: 1 };
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
    } catch (_) {}
  }

  async function waitForStability(action, opts = {}) {
    const { nextAction } = opts;
    const waitType = action.waitAfter || 'time';
    const defaultDelay = 300;
    const isCropOrSave = action.type === 'click' && /crop|save|use this|insert|apply/i.test((action.text || action.displayedValue || '').trim());

    switch (waitType) {
      case 'navigation':
        await waitForNavigation();
        break;
      case 'network':
        await waitForNetworkIdle(2000);
        break;
      case 'element':
        await sleep(isCropOrSave ? 5000 : 500);
        break;
      default:
        await sleep(isCropOrSave ? 5000 : defaultDelay);
    }

    if (isCropOrSave && nextAction?.type === 'click' && (nextAction.selectors?.length || nextAction.fallbackSelectors?.length)) {
      const sels = [...(nextAction.selectors || []), ...(nextAction.fallbackSelectors || [])];
      const stepInfo = { type: 'click', summary: nextAction.text || nextAction.displayedValue || 'next step', action: nextAction, rootDoc: scopeDocForAction(nextAction) };
      try {
        await waitForElement(sels, 15000, stepInfo);
      } catch (_) {}
    }
  }

  /** Wait for step proceed condition (element appears, time elapsed, or manual). Used for steps like screen capture that run in background. */
  async function waitForProceedCondition(action) {
    const proceedWhen = action.proceedWhen || 'stepComplete';
    if (proceedWhen === 'stepComplete') return;
    if (proceedWhen === 'time' && action.proceedAfterMs > 0) {
      await sleep(Math.max(1000, action.proceedAfterMs));
      return;
    }
    if (proceedWhen === 'element' && (action.proceedWhenSelectors?.length || action.proceedWhenFallbackSelectors?.length)) {
      const sels = [...(action.proceedWhenSelectors || []), ...(action.proceedWhenFallbackSelectors || [])];
      const timeoutMs = Math.min(Math.max(action.proceedAfterMs || 300000, 5000), 600000);
      const stepInfo = { type: 'proceedWhen', summary: 'element appears', action, rootDoc: scopeDocForAction(action) };
      await waitForElement(sels, timeoutMs, stepInfo);
      return;
    }
    if (proceedWhen === 'manual') {
      const timeoutMs = Math.max(30000, action.proceedAfterMs || 600000);
      await new Promise(function(resolve) {
        const t = setTimeout(resolve, timeoutMs);
        manualProceedResolver = function() {
          clearTimeout(t);
          manualProceedResolver = null;
          resolve();
        };
      });
    }
  }

  async function sleep(ms) {
    const chunk = 150;
    const start = Date.now();
    while (Date.now() - start < ms) {
      assertPlaying();
      const remaining = ms - (Date.now() - start);
      if (remaining <= 0) return;
      await new Promise(r => setTimeout(r, Math.min(chunk, remaining)));
    }
  }

  function yieldToReact() {
    return new Promise(r => {
      requestAnimationFrame(() => setTimeout(r, 50));
    });
  }

  function dispatchInputEvent(el, data) {
    try {
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data }));
    } catch (_) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  async function typeIntoElement(el, value, act) {
    const charLimit = act?.isDropdownLike ? 1200 : 200;
    const delayMs = act?.isDropdownLike ? 22 : 30;
    if (act?.reactCompat && value.length <= charLimit) {
      setNativeInputValue(el, '');
      for (let i = 0; i < value.length; i++) {
        setNativeInputValue(el, value.slice(0, i + 1));
        dispatchInputEvent(el, value[i]);
        if (i < value.length - 1) await sleep(delayMs);
      }
    } else {
      setNativeInputValue(el, '');
      setNativeInputValue(el, value);
      dispatchInputEvent(el, value);
    }
  }

  function setNativeInputValue(el, value) {
    if (el.type === 'file') return;
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
  }

  function setNativeSelectValue(select, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
    if (setter) {
      setter.call(select, value);
    } else {
      select.value = value;
    }
  }

  function waitForNavigation() {
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        window.removeEventListener('load', onNav);
        resolve();
      };
      const onNav = () => done();
      window.addEventListener('load', onNav);
      setTimeout(done, 5000);
    });
  }

  /**
   * Wait until no Performance Resource Timing entries for `idleQuietMs`, or `maxWait` elapses.
   * Uses PerformanceObserver (`resource`); if unavailable, falls back to a fixed delay (legacy behavior).
   * Does not observe WebSockets or all XHR phases—only resource timing the browser exposes—so treat as a best-effort “quiet period” heuristic.
   */
  async function waitForNetworkIdle(timeoutMs) {
    const idleQuietMs = 500;
    const maxWait = Math.min(Math.max(Number(timeoutMs) || 2000, 500), 30000);
    const start = Date.now();
    let lastActivity = Date.now();
    const bump = () => {
      lastActivity = Date.now();
    };

    let obs = null;
    try {
      if (typeof PerformanceObserver !== 'undefined') {
        const o = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          for (let i = 0; i < entries.length; i++) bump();
        });
        obs = o;
        o.observe({ type: 'resource', buffered: true });
      }
    } catch (_) {
      try {
        obs?.disconnect();
      } catch (_) {}
      obs = null;
    }

    if (!obs) {
      await sleep(Math.min(maxWait, 3000));
      return;
    }

    await new Promise((resolve) => {
      const finish = () => {
        try {
          obs.disconnect();
        } catch (_) {}
        resolve();
      };

      const poll = () => {
        if (!isPlaying) {
          finish();
          return;
        }
        const elapsed = Date.now() - start;
        if (elapsed >= maxWait) {
          finish();
          return;
        }
        if (Date.now() - lastActivity >= idleQuietMs) {
          finish();
          return;
        }
        setTimeout(poll, 200);
      };

      setTimeout(poll, Math.min(200, idleQuietMs));
    });
  }

  async function fetchFileFromUrl(url, preferredFilename) {
    try {
      const r = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'FETCH_FILE',
          url,
          filename: preferredFilename,
        }, (res) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (res?.ok) resolve(res);
          else reject(new Error(res?.error || 'Fetch failed'));
        });
      });
      const binary = atob(r.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const name = preferredFilename || r.filename || url.split('/').pop()?.split('?')[0] || 'file';
      return new File([bytes.buffer], name, { type: r.contentType || 'application/octet-stream' });
    } catch (bgErr) {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const blob = await res.blob();
        const name = preferredFilename || url.split('/').pop()?.split('?')[0] || 'file';
        return new File([blob], name, { type: blob.type });
      } catch (fetchErr) {
        const hint = (bgErr?.message || '').includes('403')
          ? ' 403 = server blocked. Try: use a direct image URL (not Google Drive/Dropbox share links), ensure file is public, or host the image on a CORS-enabled server.'
          : '';
        throw new Error(`Could not fetch file. Extension: ${bgErr.message}. Direct: ${fetchErr.message}.${hint}`);
      }
    }
  }
})();
