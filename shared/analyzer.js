/**
 * Analyze multiple recorded runs of the same workflow to find stable patterns.
 * Produces a merged workflow with robust selectors and wait conditions.
 * Uses similarity-based alignment to match actions across runs (not just column index).
 * Fail-safe: handles empty runs, null actions, and edge cases gracefully.
 */

function urlToCaptureContext(url) {
  if (!url || typeof url !== 'string') return undefined;
  try {
    const u = new URL(url);
    if (/^(chrome|about|edge):/i.test(u.protocol)) return undefined;
    const domain = u.hostname || '';
    const page_slug = (u.pathname || '/').replace(/^\/+|\/+$/g, '').replace(/\//g, '_') || 'page';
    if (!domain) return undefined;
    return { domain, page_slug };
  } catch (_) {
    return undefined;
  }
}

function normalStepType(type) {
  if (type === 'mouseover' || type === 'mouseenter') return 'hover';
  return type || '';
}

function countDiscoveryAffinityHits(action, affinitySet) {
  if (!affinitySet || !affinitySet.size || !action) return 0;
  let n = 0;
  const lists = [
    action.selectors,
    action.fallbackSelectors,
    action.checkSelectors,
    action.openSelectors,
    action.optionSelectors,
  ];
  for (const arr of lists) {
    if (!Array.isArray(arr)) continue;
    for (const s of arr) {
      if (s && typeof s.value === 'string') {
        const k = s.value.trim().toLowerCase();
        if (k && affinitySet.has(k)) n++;
      }
    }
  }
  return n;
}

/** Small similarity boost when both actions hit selectors seen in discovery (live tab snapshot or stored hints). */
function makeDiscoveryAffinitySimilarity(affinitySet) {
  const base = typeof actionSimilarity === 'function' ? actionSimilarity : () => 0;
  if (!affinitySet || typeof affinitySet.size !== 'number' || affinitySet.size === 0) return base;
  return function simWithAffinity(a, b) {
    let s = base(a, b);
    if (!a || !b || a.type !== b.type) return s;
    const ha = countDiscoveryAffinityHits(a, affinitySet);
    const hb = countDiscoveryAffinityHits(b, affinitySet);
    if (ha > 0 && hb > 0) s += Math.min(0.15, 0.05 * Math.min(ha, hb));
    return Math.min(1, s);
  };
}

function analyzeRuns(runs, opts) {
  try {
    opts = opts || {};
    if (!runs || runs.length === 0) return null;
    const runActions = runs.map(r => (r?.actions || []).filter(Boolean));
    const runCount = runs.length;
    const hasActions = runActions.some(arr => arr.length > 0);
    if (!hasActions) return null;
    if (runCount === 1 && runActions[0]?.length > 0) return mergeSingleRun(runs[0]);

  const sim = makeDiscoveryAffinitySimilarity(opts.discoveryAffinitySet);
  const aligned = alignRunsBySimilarity(runActions, sim);
  const usedByRun = runActions.map(() => new Set());
  for (const col of aligned) {
    for (const a of col) {
      if (!a) continue;
      for (let r = 0; r < runActions.length; r++) {
        if (runActions[r].includes(a)) {
          usedByRun[r].add(a);
          break;
        }
      }
    }
  }
  let refIdx = runActions.reduce((best, arr, i) => (arr.length >= (runActions[best]?.length || 0) ? i : best), 0);
  const maxLen = (runActions[refIdx] || []).length;
  for (let i = 0; i < runs.length; i++) {
    if ((runActions[i] || []).length !== maxLen) continue;
    const r = runs[i];
    if (r && (r.mediaCaptureFile || r.webcamCaptureFile)) refIdx = i;
  }
  const refLen = (runActions[refIdx] || []).length;
  const merged = aligned.map(column => {
    const action = mergeActions(column);
    if (!action) return null;
    if (column.length < runCount && action.type !== 'type') {
      action.optional = true;
      action.optionalRuns = column.length;
    }
    action._variation = computeVariationForColumn(column, runActions, runCount);
    return action;
  }).filter(Boolean);
  const orphansToAdd = [];
  for (let r = 0; r < runActions.length; r++) {
    const actions = runActions[r];
    const used = usedByRun[r] || new Set();
    for (let orphanIdx = 0; orphanIdx < actions.length; orphanIdx++) {
      const orphan = actions[orphanIdx];
      if (!orphan || used.has(orphan)) continue;
      if (!orphan.selectors?.length) continue;
      let bestCol = -1, bestScore = ORPHAN_SELECTOR_MERGE_THRESHOLD;
      for (let c = 0; c < merged.length; c++) {
        const m = merged[c];
        if (!m || normalStepType(m.type) !== normalStepType(orphan.type)) continue;
        const score = sim(m, orphan);
        if (score > bestScore) {
          bestScore = score;
          bestCol = c;
        }
      }
      if (bestCol >= 0) {
        merged[bestCol].selectors = mergeSelectors((merged[bestCol].selectors || []).concat(orphan.selectors || []));
        merged[bestCol]._variation = mergeVariation(merged[bestCol]._variation, computeVariationForColumn([orphan], runActions, runCount));
      } else {
        orphansToAdd.push({ action: orphan, runIdx: r, orphanIdx, runLen: actions.length });
      }
    }
  }
  const toInsert = orphansToAdd
    .map(({ action: orphan, orphanIdx, runLen }) => {
      const orphanMerged = mergeActions([orphan]);
      if (!orphanMerged || !orphanMerged.selectors?.length) return null;
      if (orphanMerged.type !== 'type') {
        orphanMerged.optional = true;
        orphanMerged.optionalRuns = 1;
      }
      orphanMerged._variation = computeVariationForColumn([orphan], runActions, runCount);
      const insertAt = findBestInsertPosition(aligned, orphan, sim, orphanIdx, runLen, refLen);
      return { merged: orphanMerged, alignedCol: [orphan], insertAt };
    })
    .filter(Boolean)
    .sort((a, b) => a.insertAt - b.insertAt);
  for (const { merged: orphanMerged, alignedCol, insertAt } of toInsert) {
    const pos = Math.min(insertAt, merged.length);
    merged.splice(pos, 0, orphanMerged);
    aligned.splice(pos, 0, alignedCol);
  }
  const deduped = deduplicateByField(merged);
  augmentMissingFallbackSelectors(deduped);
  const mergedWaits = mergeConsecutiveWaits(deduped);

  const loopAnalysis = detectLoopableWorkflow(runs);
  const ensureStep = detectConditionalDropdowns(runs);
  let actions = mergedWaits;
  if (ensureStep) {
    const filtered = [];
    for (let i = 0; i < mergedWaits.length; i++) {
      const a = mergedWaits[i];
      const prev = mergedWaits[i - 1];
      const next = mergedWaits[i + 1];
      if (a._dropdownSequence && a.type === 'click') {
        if (filtered.length && prev?.type === 'click') {
          const last = filtered[filtered.length - 1];
          const isCombobox = last.selectors?.some(s => (s?.value && typeof s.value === 'object' && s.value.role === 'combobox'));
          if (isCombobox) filtered.pop();
        }
        continue;
      }
      if (next?._dropdownSequence && next.type === 'click' && a.type === 'click') {
        const isComboboxTrigger = a.selectors?.some(s => (s?.value && typeof s.value === 'object' && s.value.role === 'combobox'));
        if (isComboboxTrigger) continue;
      }
      filtered.push(a);
    }
    actions = [ensureStep, ...filtered];
  }

  applyVariationToActions(actions);
  applyExpectedBeforeAfter(actions);

  return {
    actions,
    runCount,
    referenceRunIndex: refIdx,
    urlPattern: inferUrlPattern(runs),
    loopable: loopAnalysis?.loopable ?? false,
    loopAnalysis: loopAnalysis || undefined,
  };
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) console.error('analyzeRuns error:', err);
    return null;
  }
}

/**
 * Compare start and end state across runs to detect if workflow returns to same place (loopable).
 */
function detectLoopableWorkflow(runs) {
  if (!runs || runs.length === 0) return null;

  const urls = runs.map(r => {
    const acts = r.actions || [];
    const last = acts[acts.length - 1];
    const first = acts.find(a => a.url) || acts[0];
    const endUrl = (last?.url || r.url || '').split('?')[0];
    const startUrl = (first?.url || r.url || '').split('?')[0];
    return { startUrl, endUrl };
  }).filter(x => x.endUrl);

  const startStates = runs.map(r => normalizeState(r.startState || []));
  const endStates = runs.map(r => normalizeState(r.endState || []));

  const urlSame = urls.length >= 2
    ? urls.every(u => u.endUrl === urls[0].endUrl)
    : urls.length === 1 && urls[0].startUrl === urls[0].endUrl;
  const stateSimilar = startStates.length > 0 && endStates.length > 0 &&
    statesOverlap(startStates, endStates);

  return {
    loopable: urlSame || stateSimilar,
    urlSame,
    stateSimilar,
    startStateSample: startStates[0]?.slice(0, 3),
    endStateSample: endStates[0]?.slice(0, 3),
  };
}

function normalizeState(dropdowns) {
  return (dropdowns || []).map(d => ({
    v: String(d.displayedValue || '').trim().toLowerCase().slice(0, 80),
  })).filter(d => d.v);
}

function statesOverlap(starts, ends) {
  const startKeys = new Set(starts.flatMap(s => s.map(x => x.v)).filter(Boolean));
  const endKeys = new Set(ends.flatMap(e => e.map(x => x.v)).filter(Boolean));
  let overlap = 0;
  for (const k of startKeys) {
    if (endKeys.has(k)) overlap++;
  }
  return overlap >= Math.min(1, startKeys.size, endKeys.size);
}

/**
 * Compare runs: if some have a dropdown-change sequence at the start and others don't
 * (because the setting was already correct), auto-create an ensureSelect step.
 * Also creates ensureSelect for single run when it has a dropdown sequence.
 */
function detectConditionalDropdowns(runs) {
  if (!runs || runs.length === 0) return null;

  const runsWithDropdown = [];
  const runsWithoutDropdown = [];

  for (const run of runs) {
    const actions = run.actions || [];
    const firstClick = actions.find(a => a.type === 'click');
    const seq = firstClick?._dropdownSequence;
    const startState = run.startState || [];

    if (seq && firstClick) {
      runsWithDropdown.push({
        run,
        firstClick,
        seq,
        startState,
      });
    } else {
      runsWithoutDropdown.push({ run, startState });
    }
  }

  if (runsWithDropdown.length === 0) return null;
  /* Create ensureSelect whenever any run has a dropdown sequence (even if all runs have it). */

  const best = runsWithDropdown[0];
  const { firstClick, seq } = best;
  const expectedText = (seq.optionText || seq.toValue || '').trim();
  if (!expectedText) return null;

  const checkSelectors = firstClick.selectors || [];
  const openSelectors = firstClick.selectors || [];
  const optionSelectors = seq.optionSelectors || [];
  if (!checkSelectors.length && !openSelectors.length) return null;

  const runCount = runs.length;
  const byKey = new Map();
  for (let r = 0; r < runsWithDropdown.length; r++) {
    const rd = runsWithDropdown[r];
    for (const s of [...(rd.firstClick?.selectors || []), ...(rd.seq?.optionSelectors || [])]) {
      const key = `${s.type}:${JSON.stringify(s.value)}`;
      if (!byKey.has(key)) byKey.set(key, { type: s.type, value: s.value, score: s.score, runs: new Set() });
      byKey.get(key).runs.add(r);
    }
  }
  const n = runsWithDropdown.length;
  const ensureStability = Array.from(byKey.values()).map(v => ({
    type: v.type,
    value: v.value,
    score: v.score,
    runCount: v.runs.size,
    stability: n > 0 ? v.runs.size / n : 1,
  }));

  const fallbackSelectors = mergeSelectors(runsWithDropdown.flatMap(rd => rd.firstClick?.fallbackSelectors || []));
  return {
    type: 'ensureSelect',
    expectedText,
    optionText: expectedText,
    checkSelectors: mergeSelectors(checkSelectors),
    openSelectors: mergeSelectors(openSelectors.length ? openSelectors : checkSelectors),
    optionSelectors: optionSelectors.length ? mergeSelectors(optionSelectors) : [],
    fallbackSelectors: fallbackSelectors.length ? fallbackSelectors : undefined,
    optional: false,
    _variation: {
      runCount: n,
      totalRuns: runCount,
      optional: false,
      absentFromRuns: [],
      selectorStability: ensureStability,
      stableSelectors: ensureStability.filter(s => s.stability >= 0.5),
      unstableSelectors: ensureStability.filter(s => s.stability < 0.5),
    },
  };
}

/**
 * Merge consecutive wait actions into one with duration range.
 * When the next action after waits has selectors, add waitForSelectors so we can
 * "wait until element visible" instead of fixed duration.
 */
function mergeClipEpochBounds(group) {
  let clipStart = null;
  let clipEnd = null;
  for (const w of group) {
    if (w._clipStartEpochMs != null && Number.isFinite(w._clipStartEpochMs)) {
      clipStart = clipStart == null ? w._clipStartEpochMs : Math.min(clipStart, w._clipStartEpochMs);
    }
    if (w._clipEndEpochMs != null && Number.isFinite(w._clipEndEpochMs)) {
      clipEnd = clipEnd == null ? w._clipEndEpochMs : Math.max(clipEnd, w._clipEndEpochMs);
    }
  }
  return { clipStart, clipEnd };
}

function mergeConsecutiveWaits(actions) {
  if (!actions?.length) return [];
  const result = [];
  let i = 0;
  while (i < actions.length) {
    const a = actions[i];
    if (a.type !== 'wait') {
      result.push({ ...a });
      i++;
      continue;
    }
    const group = [a];
    let j = i + 1;
    while (j < actions.length && actions[j].type === 'wait') {
      group.push(actions[j]);
      j++;
    }
    const nextAction = actions[j];
    const hasNextWithSelectors = nextAction && ['click', 'type', 'select', 'upload', 'download'].includes(nextAction.type)
      && ((nextAction.selectors?.length) || (nextAction.fallbackSelectors?.length));
    const firstWait = group[0];
    const lastWait = group[group.length - 1];
    const durationMin = group.reduce((sum, w) => sum + (w.durationMin ?? w.duration ?? 0), 0);
    const durationMax = group.reduce((sum, w) => sum + (w.durationMax ?? w.duration ?? 0), 0);
    const merged = {
      ...group[0],
      type: 'wait',
      duration: Math.round((durationMin + durationMax) / 2),
      durationMin,
      durationMax,
      optional: group.some(w => w.optional),
      pageStateBefore: firstWait?.pageStateBefore || mergePageState(group.map(w => w.pageStateBefore).filter(Boolean)),
      pageStateAfter: lastWait?.pageStateAfter || mergePageState(group.map(w => w.pageStateAfter).filter(Boolean)),
    };
    merged._variation = group.reduce((acc, w) => mergeVariation(acc, w._variation), undefined);
    if (hasNextWithSelectors) {
      merged.waitFor = 'element';
      /* Include next action's fallback chain so waits survive primary id churn (e.g. Google q box). */
      merged.waitForSelectors = mergeSelectors([...(nextAction.selectors || []), ...(nextAction.fallbackSelectors || [])]);
    }
    const { clipStart, clipEnd } = mergeClipEpochBounds(group);
    if (clipStart != null) merged._clipStartEpochMs = clipStart;
    if (clipEnd != null) merged._clipEndEpochMs = clipEnd;
    result.push(merged);
    i = j;
  }
  return result;
}

const SIMILARITY_THRESHOLD = 0.15;
const ORPHAN_SELECTOR_MERGE_THRESHOLD = 0.22;

function getRunIndexForAction(action, runActions) {
  for (let r = 0; r < runActions.length; r++) {
    if ((runActions[r] || []).includes(action)) return r;
  }
  return -1;
}

/**
 * Compute selector stability from actionsWithRuns.
 * Shared by analyzer (computeVariationForColumn) and run-variation (selectorStability).
 * @param {Array<{ action, runIdx }>} actionsWithRuns
 * @returns {Array<{ type, value, score, runCount, stability, key?, runs? }>}
 */
function computeSelectorStabilityFromActionsWithRuns(actionsWithRuns) {
  const byKey = new Map();
  for (const { action, runIdx } of actionsWithRuns || []) {
    for (const s of (action?.selectors || [])) {
      const key = `${s.type}:${JSON.stringify(s.value)}`;
      if (!byKey.has(key)) byKey.set(key, { type: s.type, value: s.value, score: s.score, runs: new Set() });
      byKey.get(key).runs.add(runIdx);
    }
  }
  const runCount = new Set((actionsWithRuns || []).map(x => x.runIdx)).size;
  return Array.from(byKey.entries()).map(([k, v]) => ({
    key: k,
    type: v.type,
    value: v.value,
    score: v.score,
    runCount: v.runs.size,
    stability: runCount > 0 ? v.runs.size / runCount : 1,
    runs: Array.from(v.runs),
  })).sort((a, b) => b.stability - a.stability);
}

/**
 * From per-run recorded actions (see recorder `_recordedDom`), derive expected QSA match cardinality
 * and per-run target paths for parity checks later (enrich / selector parity), without requiring the analyze-time DOM.
 */
function buildExpectedMatchFromColumn(column, runActions) {
  const byRun = {};
  const counts = [];
  for (const a of column || []) {
    if (!a) continue;
    const ri = getRunIndexForAction(a, runActions);
    if (ri < 0) continue;
    const d = a._recordedDom;
    if (!d || typeof d.qsaMatchCount !== 'number' || d.qsaMatchCount < 1) continue;
    byRun[ri] = {
      count: d.qsaMatchCount,
      targetCssPath: d.targetCssPath || undefined,
      strategyKey: d.strategyKey || undefined,
    };
    counts.push(d.qsaMatchCount);
  }
  if (counts.length === 0) return undefined;
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const agrees = min === max;
  return {
    cardinality: agrees ? min : null,
    cardinalityAgrees: agrees,
    cardinalityMin: min,
    cardinalityMax: max,
    perRun: byRun,
    runsSampled: counts.length,
    source: 'recordedDom',
  };
}

function buildExpectedMatchFromSingleRecorded(d) {
  if (!d || typeof d.qsaMatchCount !== 'number' || d.qsaMatchCount < 1) return undefined;
  return {
    cardinality: d.qsaMatchCount,
    cardinalityAgrees: true,
    cardinalityMin: d.qsaMatchCount,
    cardinalityMax: d.qsaMatchCount,
    perRun: {
      0: { count: d.qsaMatchCount, targetCssPath: d.targetCssPath, strategyKey: d.strategyKey },
    },
    runsSampled: 1,
    source: 'recordedDom',
  };
}

function mergeExpectedMatch(a, b) {
  if (!a && !b) return undefined;
  if (!a) return b ? { ...b } : undefined;
  if (!b) return { ...a };
  const perRun = { ...(a.perRun || {}), ...(b.perRun || {}) };
  const counts = Object.values(perRun)
    .map(x => (x && typeof x.count === 'number' ? x.count : null))
    .filter(n => n != null && n >= 1);
  if (counts.length === 0) {
    return { ...a, ...b, perRun };
  }
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const agrees = min === max;
  const agreeFlags = (a.cardinalityAgrees !== false) && (b.cardinalityAgrees !== false);
  return {
    cardinality: agrees ? min : null,
    cardinalityAgrees: agreeFlags && agrees,
    cardinalityMin: min,
    cardinalityMax: max,
    perRun,
    source: 'recordedDom',
  };
}

function computeVariationForColumn(column, runActions, runCount) {
  const actionsWithRuns = (column || [])
    .filter(Boolean)
    .map(a => ({ action: a, runIdx: getRunIndexForAction(a, runActions) }))
    .filter(x => x.runIdx >= 0);
  const presentRuns = [...new Set(actionsWithRuns.map(x => x.runIdx))];
  const absentFromRuns = [...Array(runCount).keys()].filter(r => !presentRuns.includes(r));
  const selectorStability = computeSelectorStabilityFromActionsWithRuns(actionsWithRuns);
  const runCountForCol = presentRuns.length;
  const expectedMatch = buildExpectedMatchFromColumn(column, runActions);
  return {
    runCount: runCountForCol,
    totalRuns: runCount,
    optional: runCountForCol < runCount,
    absentFromRuns,
    selectorStability,
    stableSelectors: selectorStability.filter(s => s.stability >= 0.5),
    unstableSelectors: selectorStability.filter(s => s.stability < 0.5),
    ...(expectedMatch ? { expectedMatch } : {}),
  };
}

function mergeVariation(a, b) {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  const totalRuns = Math.max(a.totalRuns || 0, b.totalRuns || 0);
  const absentA = new Set(a.absentFromRuns || []);
  const absentB = new Set(b.absentFromRuns || []);
  const absentFromRuns = [...Array(totalRuns).keys()].filter(r => absentA.has(r) && absentB.has(r));
  const runCount = totalRuns - absentFromRuns.length;
  const byKey = new Map();
  for (const s of [...(a.selectorStability || []), ...(b.selectorStability || [])]) {
    const key = `${s.type}:${JSON.stringify(s.value)}`;
    const existing = byKey.get(key);
    if (!existing || (s.runCount || 0) > (existing.runCount || 0)) {
      byKey.set(key, { ...s });
    }
  }
  const selectorStability = Array.from(byKey.values()).sort((x, y) => (y.stability || 0) - (x.stability || 0));
  const expectedMatch = mergeExpectedMatch(a.expectedMatch, b.expectedMatch);
  const out = {
    runCount,
    totalRuns,
    optional: a.optional || b.optional,
    absentFromRuns,
    selectorStability,
    stableSelectors: selectorStability.filter(s => (s.stability || 0) >= 0.5),
    unstableSelectors: selectorStability.filter(s => (s.stability || 0) < 0.5),
  };
  if (expectedMatch) out.expectedMatch = expectedMatch;
  return out;
}

function alignRunsBySimilarity(runActions, similarityFn) {
  if (!runActions?.length) return [];
  const sim = typeof similarityFn === 'function' ? similarityFn : (typeof actionSimilarity === 'function' ? actionSimilarity : () => 0);
  const refIdx = runActions.reduce((best, arr, i) => (arr.length >= (runActions[best]?.length || 0) ? i : best), 0);
  const refRun = runActions[refIdx];
  const used = runActions.map(actions => new Set());

  const aligned = refRun.map((refAction, col) => {
    used[refIdx].add(refAction);
    const column = [refAction];
    for (let r = 0; r < runActions.length; r++) {
      if (r === refIdx) continue;
      const actions = runActions[r];
      const windowSize = Math.max(8, Math.ceil(actions.length * 0.5));
      const windowStart = Math.max(0, col - windowSize);
      const windowEnd = Math.min(actions.length, col + windowSize + 1);
      let best = null, bestScore = SIMILARITY_THRESHOLD, bestIdx = -1;
      for (let i = windowStart; i < windowEnd; i++) {
        const a = actions[i];
        if (!a || used[r].has(a)) continue;
        let score = sim(refAction, a);
        if (normalStepType(refAction.type) === normalStepType(a.type) && i === col) score += 0.3;
        if (normalStepType(refAction.type) === normalStepType(a.type) && Math.abs(i - col) <= 1) score += 0.15;
        if (score > bestScore) {
          bestScore = score;
          best = a;
          bestIdx = i;
        }
      }
      if (best) {
        used[r].add(best);
        column.push(best);
      }
    }
    return column;
  });

  const refLen = refRun.length;
  for (let r = 0; r < runActions.length; r++) {
    const actions = runActions[r];
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      if (used[r].has(a)) continue;
      const insertAt = findBestInsertPosition(aligned, a, sim, i, actions.length, refLen);
      aligned.splice(insertAt, 0, [a]);
      used[r].add(a);
    }
  }
  return aligned;
}

/** Single-run clip bounds from consecutive action timestamps. */
function attachSequentialClipBounds(actions) {
  if (!actions?.length) return;
  const withTs = actions.filter(b => b && b.timestamp != null);
  const lastTs = withTs.length ? withTs[withTs.length - 1].timestamp : null;
  const tailPadMs = 2000;
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (a.timestamp == null) continue;
    const next = actions[i + 1];
    const endMs = next && next.timestamp != null ? next.timestamp : (lastTs != null ? lastTs + tailPadMs : a.timestamp + 3000);
    a._clipStartEpochMs = a.timestamp;
    a._clipEndEpochMs = endMs;
  }
}

function findBestInsertPosition(aligned, action, sim, orphanIdx, orphanRunLen, refLen) {
  let best = aligned.length, bestScore = 0;
  const posHint = refLen > 0 && orphanRunLen > 0
    ? Math.round((orphanIdx / orphanRunLen) * refLen)
    : aligned.length;
  for (let i = 0; i <= aligned.length; i++) {
    const prev = aligned[i - 1]?.[0];
    const next = aligned[i]?.[0];
    let score = 0;
    if (prev) score += sim(action, prev) * 0.5;
    if (next) score += sim(action, next) * 0.5;
    if (Math.abs(i - posHint) <= 2) score += 0.2;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function deduplicateByField(actions) {
  if (!actions?.length) return [];
  const result = [];
  const seenKeys = new Map();
  const norm = (k) => (k || '').toLowerCase().trim();
  for (const a of actions) {
    const key = a.variableKey || a.placeholder || a.name || a.ariaLabel;
    const n = norm(key);
    if (!n) {
      result.push(a);
      continue;
    }
    const dupIdx = seenKeys.get(n);
    if (dupIdx !== undefined && ['type', 'select'].includes(a.type)) {
      const existing = result[dupIdx];
      if (existing.type === a.type) {
        existing.selectors = mergeSelectors((existing.selectors || []).concat(a.selectors || []));
        existing._variation = mergeVariation(existing._variation, a._variation);
        if (a._clipStartEpochMs != null && Number.isFinite(a._clipStartEpochMs)) {
          existing._clipStartEpochMs = existing._clipStartEpochMs != null && Number.isFinite(existing._clipStartEpochMs)
            ? Math.min(existing._clipStartEpochMs, a._clipStartEpochMs)
            : a._clipStartEpochMs;
        }
        if (a._clipEndEpochMs != null && Number.isFinite(a._clipEndEpochMs)) {
          existing._clipEndEpochMs = existing._clipEndEpochMs != null && Number.isFinite(existing._clipEndEpochMs)
            ? Math.max(existing._clipEndEpochMs, a._clipEndEpochMs)
            : a._clipEndEpochMs;
        }
        if (a.type === 'type') {
          const sa = existing.recordedValue != null ? String(existing.recordedValue).trim() : '';
          const sb = a.recordedValue != null ? String(a.recordedValue).trim() : '';
          if (sb.length > sa.length) existing.recordedValue = a.recordedValue;
          else if (sb && !sa) existing.recordedValue = a.recordedValue;
          if (a.isDropdownLike) existing.isDropdownLike = true;
        }
        continue;
      }
    }
    if (a.type === 'upload') {
      result.push({ ...a });
      continue;
    }
    seenKeys.set(n, result.length);
    result.push({ ...a });
  }
  return result;
}

function mergeActions(actions) {
  if (!actions || !Array.isArray(actions)) return null;
  const valid = actions.filter(Boolean);
  if (valid.length === 0) return null;

  const first = valid[0];
  let stepType = first.type;
  if (stepType === 'mouseover' || stepType === 'mouseenter') stepType = 'hover';
  const merged = {
    type: stepType,
    selectors: mergeSelectors(valid.flatMap(a => a.selectors || [])),
    timestamp: first.timestamp,
    url: first.url,
  };

  if (merged.type === 'hover') {
    merged.tagName = first.tagName;
    merged.text = valid.map(a => a.text).filter(Boolean)[0] || first.text;
    merged.fallbackSelectors = mergeSelectors(valid.flatMap(a => a.fallbackSelectors || []));
    merged.pageStateBefore = mergePageState(valid.map(a => a.pageStateBefore).filter(Boolean));
    merged.pageStateAfter = mergePageState(valid.map(a => a.pageStateAfter).filter(Boolean));
  }

  if (first.type === 'click') {
    merged.tagName = first.tagName;
    merged.text = valid.map(a => a.text).filter(Boolean)[0] || first.text;
    merged.displayedValue = valid.map(a => a.displayedValue).filter(Boolean)[0] || first.displayedValue;
    merged._dropdownSequence = first._dropdownSequence;
    const seq = first._dropdownSequence;
    if (seq?.optionText) merged.skipIfText = seq.optionText;
    merged.ariaLabel = valid.map(a => a.ariaLabel).filter(Boolean)[0] || first.ariaLabel;
    merged.fallbackTexts = mergeFallbackTexts(valid.flatMap(a => a.fallbackTexts || []));
    merged.fallbackSelectors = mergeSelectors(valid.flatMap(a => a.fallbackSelectors || []));
    merged.pageStateBefore = mergePageState(valid.map(a => a.pageStateBefore).filter(Boolean));
    merged.pageStateAfter = mergePageState(valid.map(a => a.pageStateAfter).filter(Boolean));
    if (valid.some((a) => a.submitIntent)) merged.submitIntent = true;
  }

  if (first.type === 'type') {
    merged.placeholder = first.placeholder;
    merged.name = first.name;
    merged.ariaLabel = valid.map(a => a.ariaLabel).filter(Boolean)[0] || first.ariaLabel;
    merged.isFileInput = first.isFileInput;
    merged.variableKey = inferVariableKey(valid);
    const recVals = valid.map(x => x.recordedValue).filter(v => v != null && String(v).trim());
    if (recVals.length) {
      merged.recordedValue = recVals.reduce((best, cur) =>
        (String(cur).trim().length > String(best).trim().length ? cur : best));
    } else if (first.recordedValue != null) {
      merged.recordedValue = first.recordedValue;
    }
    merged.isDropdownLike = valid.some(a => a.isDropdownLike);
    merged.fallbackSelectors = mergeSelectors(valid.flatMap(a => a.fallbackSelectors || []));
    merged.pageStateBefore = mergePageState(valid.map(a => a.pageStateBefore).filter(Boolean));
    merged.pageStateAfter = mergePageState(valid.map(a => a.pageStateAfter).filter(Boolean));
  }

  if (first.type === 'wait') {
    const durations = valid.map(a => a.duration || 0).filter(Boolean);
    merged.duration = durations.length ? Math.max(...durations) : 1000;
    merged.durationMin = durations.length ? Math.min(...durations) : merged.duration;
    merged.durationMax = durations.length ? Math.max(...durations) : merged.duration;
    merged.waitFor = first.waitFor;
    if (first.waitFor === 'generationComplete') {
      merged.waitForSelectors = first.waitForSelectors || first.waitForGenerationComplete?.containerSelectors;
      merged.waitForGenerationComplete = first.waitForGenerationComplete || { containerSelectors: merged.waitForSelectors, cardIndex: 'last' };
    }
  }

  if (first.type === 'ensureSelect') {
    merged.expectedText = first.expectedText;
    merged.optionText = first.optionText || first.expectedText;
    merged.checkSelectors = mergeSelectors(valid.flatMap(a => a.checkSelectors || []));
    merged.openSelectors = mergeSelectors(valid.flatMap(a => a.openSelectors || []));
    merged.optionSelectors = mergeSelectors(valid.flatMap(a => a.optionSelectors || []));
  }

  if (first.type === 'upload') {
    merged.variableKey = first.variableKey || 'fileUrl';
    merged.accept = valid.map(a => a.accept).filter(Boolean)[0] || first.accept;
    merged.fallbackSelectors = mergeSelectors(valid.flatMap(a => a.fallbackSelectors || []));
    merged.pageStateBefore = mergePageState(valid.map(a => a.pageStateBefore).filter(Boolean));
    merged.pageStateAfter = mergePageState(valid.map(a => a.pageStateAfter).filter(Boolean));
  }

  if (first.type === 'select') {
    merged.variableKey = first.variableKey || first.name || 'selectValue';
    merged.ariaLabel = valid.map(a => a.ariaLabel).filter(Boolean)[0] || first.ariaLabel;
    merged.fallbackSelectors = mergeSelectors(valid.flatMap(a => a.fallbackSelectors || []));
    merged.pageStateBefore = mergePageState(valid.map(a => a.pageStateBefore).filter(Boolean));
    merged.pageStateAfter = mergePageState(valid.map(a => a.pageStateAfter).filter(Boolean));
  }

  if (first.type === 'download') {
    merged.variableKey = first.variableKey || 'downloadTarget';
  }

  if (first.type === 'goToUrl') {
    merged.url = first.url;
    merged.urlRecordedFrom = first.urlRecordedFrom;
    merged.selectors = [];
  }

  if (first.type === 'openTab') {
    merged.url = first.url;
    merged.urlRecordedFrom = first.urlRecordedFrom;
    merged.andSwitchToTab = first.andSwitchToTab;
    merged.openInNewWindow = first.openInNewWindow;
    merged.selectors = [];
  }

  if (first.type === 'key') {
    merged.key = first.key;
    merged.count = valid.reduce((sum, a) => sum + Math.max(1, parseInt(a.count, 10) || 1), 0);
    merged.selectors = [];
  }

  if (first.type === 'scroll') {
    merged.mode = first.mode;
    merged.deltaX = Math.round(valid.reduce((s, a) => s + (Number(a.deltaX) || 0), 0));
    merged.deltaY = Math.round(valid.reduce((s, a) => s + (Number(a.deltaY) || 0), 0));
    merged.behavior = first.behavior;
    merged.settleMs = first.settleMs;
    merged.containerSelectors = mergeSelectors(valid.flatMap((a) => a.containerSelectors || []));
    merged.containerFallbackSelectors = mergeSelectors(valid.flatMap((a) => a.containerFallbackSelectors || []));
    merged.pageStateBefore = mergePageState(valid.map((a) => a.pageStateBefore).filter(Boolean));
    merged.pageStateAfter = mergePageState(valid.map((a) => a.pageStateAfter).filter(Boolean));
  }

  if (first.type === 'dragDrop') {
    merged.sourceSelectors = mergeSelectors(valid.flatMap((a) => a.sourceSelectors || []));
    merged.targetSelectors = mergeSelectors(valid.flatMap((a) => a.targetSelectors || []));
    merged.sourceFallbackSelectors = mergeSelectors(valid.flatMap((a) => a.sourceFallbackSelectors || []));
    merged.targetFallbackSelectors = mergeSelectors(valid.flatMap((a) => a.targetFallbackSelectors || []));
    merged.steps = first.steps;
    merged.stepDelayMs = first.stepDelayMs;
    merged.pageStateBefore = mergePageState(valid.map((a) => a.pageStateBefore).filter(Boolean));
    merged.pageStateAfter = mergePageState(valid.map((a) => a.pageStateAfter).filter(Boolean));
  }

  merged.waitAfter = inferWaitAfter(valid);

  const ctx = urlToCaptureContext(merged.url || first.url);
  if (ctx) merged.captureContext = ctx;

  return merged;
}

function mergeSelectors(selectors) {
  const byKey = new Map();
  for (const s of selectors) {
    if (!s?.type) continue;
    try {
      const key = `${s.type}:${JSON.stringify(s.value)}`;
      const existing = byKey.get(key);
      if (!existing || (s.score || 0) > (existing.score || 0)) {
        byKey.set(key, { ...s });
      }
    } catch (_) { /* skip malformed selector */ }
  }
  return Array.from(byKey.values()).sort((a, b) => (b.score || 0) - (a.score || 0));
}

/** When recording omitted fallbackSelectors, add stable name/aria strategies so playback survives id churn. */
function augmentMissingFallbackSelectors(actions) {
  if (!actions?.length) return;
  for (const a of actions) {
    if (!a || (a.fallbackSelectors && a.fallbackSelectors.length)) continue;
    if (a.type !== 'type' && a.type !== 'click' && a.type !== 'hover') continue;
    const extras = [];
    const tag = (a.tagName || '').toLowerCase();
    const tagForName = tag === 'input' || tag === 'textarea' || tag === 'select' ? tag : 'textarea';
    const name = a.name != null ? String(a.name).trim() : '';
    if (name && /^[a-zA-Z0-9_-]+$/.test(name)) {
      extras.push({ type: 'attr', attr: 'name', value: `${tagForName}[name="${name}"]`, score: 8 });
    }
    const al = a.ariaLabel != null ? String(a.ariaLabel).trim().slice(0, 200) : '';
    if (al) {
      const safe = al.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      extras.push({ type: 'attr', attr: 'aria-label', value: `[aria-label="${safe}"]`, score: 8 });
    }
    if (extras.length) a.fallbackSelectors = mergeSelectors(extras);
  }
}

function mergeFallbackTexts(texts) {
  const seen = new Set();
  const out = [];
  for (const t of texts) {
    const s = typeof t === 'string' ? t : String(t || '');
    const k = s.trim().toLowerCase();
    if (k && !seen.has(k) && k.length >= 2 && k.length <= 50) {
      seen.add(k);
      out.push(s.trim());
    }
  }
  return out.slice(0, 8);
}

function mergePageState(states) {
  if (!states?.length) return undefined;
  const first = states[0];
  if (!first?.counts) return first;
  const counts = {};
  for (const s of states) {
    if (!s?.counts) continue;
    for (const [k, v] of Object.entries(s.counts)) {
      counts[k] = Math.max(counts[k] || 0, v);
    }
  }
  return Object.keys(counts).length ? { counts } : undefined;
}

/**
 * Reorder selectors by stability (cross-run) then original score.
 * Stable selectors are tried first during playback for better robustness.
 */
function reorderSelectorsByStability(selectors, selectorStability) {
  if (!selectors?.length) return selectors;
  if (!selectorStability?.length) return selectors;
  const keyFor = (s) => {
    try { return `${s?.type}:${JSON.stringify(s?.value ?? s)}`; } catch (_) { return `${s?.type}:unknown`; }
  };
  const stabMap = new Map();
  for (const s of selectorStability) {
    stabMap.set(keyFor(s), s.stability ?? 0);
  }
  return [...selectors].sort((a, b) => {
    const keyA = keyFor(a);
    const keyB = keyFor(b);
    const stabA = stabMap.get(keyA) ?? -1;
    const stabB = stabMap.get(keyB) ?? -1;
    if (stabB !== stabA) return stabB - stabA;
    return (b.score || 0) - (a.score || 0);
  });
}

/**
 * Set expectedBefore/expectedAfter from adjacent steps for page change validation.
 * expectedBefore: selectors that should be visible before this step (from previous step).
 * expectedAfter: selectors that should appear after this step (from next step).
 */
function applyExpectedBeforeAfter(actions) {
  if (!actions?.length) return;
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    const prev = actions[i - 1];
    const next = actions[i + 1];
    if (prev && (prev.selectors?.length || prev.checkSelectors?.length)) {
      const sels = prev.checkSelectors?.length ? prev.checkSelectors : prev.selectors;
      a.expectedBefore = mergeSelectors((a.expectedBefore || []).concat(sels)).slice(0, 5);
    }
    if (next && (next.selectors?.length || next.checkSelectors?.length)) {
      const sels = next.checkSelectors?.length ? next.checkSelectors : next.selectors;
      a.expectedAfter = mergeSelectors((a.expectedAfter || []).concat(sels)).slice(0, 5);
    }
  }
}

/**
 * Apply variation analysis to actions: reorder selectors by stability
 * so cross-run stable selectors are tried first during playback.
 */
function applyVariationToActions(actions) {
  if (!actions?.length) return;
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    const v = a._variation;
    if (a.selectors?.length && v?.selectorStability?.length) {
      a.selectors = reorderSelectorsByStability(a.selectors, v.selectorStability);
    }
    if (a.type === 'wait' && a.waitForSelectors?.length) {
      const nextV = actions[i + 1]?._variation;
      if (nextV?.selectorStability?.length) {
        a.waitForSelectors = reorderSelectorsByStability(a.waitForSelectors, nextV.selectorStability);
      }
    }
    if (a.type === 'ensureSelect' && v?.selectorStability?.length) {
      if (a.checkSelectors?.length) a.checkSelectors = reorderSelectorsByStability(a.checkSelectors, v.selectorStability);
      if (a.openSelectors?.length) a.openSelectors = reorderSelectorsByStability(a.openSelectors, v.selectorStability);
      if (a.optionSelectors?.length) a.optionSelectors = reorderSelectorsByStability(a.optionSelectors, v.selectorStability);
    }
  }
}

function inferVariableKey(actions) {
  /** Prefer accessible label over short control names (e.g. Google q → "Search"). */
  const keys = actions.map(a => a.ariaLabel || a.placeholder || a.name).filter(Boolean);
  if (keys.length === 0) return 'value';
  const counts = {};
  keys.forEach(k => { counts[k] = (counts[k] || 0) + 1; });
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'value';
  if (best.length > 30) return 'prompt';
  return best;
}

function inferWaitAfter(actions) {
  const waits = actions.map(a => a.waitAfter).filter(Boolean);
  if (waits.length === 0) return null;
  return waits[0];
}

function inferUrlPattern(runs) {
  const urls = runs.flatMap(r => (r.actions || []).map(a => a.url)).filter(Boolean);
  if (urls.length === 0) return null;
  try {
    const origin = new URL(urls[0]).origin;
    return origin ? { origin, pathPattern: '*' } : null;
  } catch (_) {
    return null;
  }
}

function mergeSingleRun(run) {
  if (!run?.actions?.length) return null;
  const runCount = 1;
  const actions = (run.actions || []).filter(Boolean).map(a => {
    const out = { ...a, selectors: a.selectors || [] };
    if (a.type === 'wait' && a.duration) {
      out.durationMin = a.duration;
      out.durationMax = a.duration;
    }
    const ctx = urlToCaptureContext(a.url || run.url);
    if (ctx) out.captureContext = ctx;
    const emSingle = buildExpectedMatchFromSingleRecorded(a._recordedDom);
    out._variation = {
      runCount: 1,
      totalRuns: 1,
      optional: false,
      absentFromRuns: [],
      selectorStability: (a.selectors || []).map(s => ({ ...s, runCount: 1, stability: 1 })),
      stableSelectors: (a.selectors || []).map(s => ({ ...s, runCount: 1, stability: 1 })),
      unstableSelectors: [],
      ...(emSingle ? { expectedMatch: emSingle } : {}),
    };
    return out;
  });
  attachSequentialClipBounds(actions);
  let deduped = deduplicateByField(actions);
  for (let ti = 0; ti < deduped.length; ti++) {
    const a = deduped[ti];
    if (a.type === 'type' && !a.variableKey) {
      a.variableKey = inferVariableKey([a]);
    }
  }
  augmentMissingFallbackSelectors(deduped);
  const mergedWaits = mergeConsecutiveWaits(deduped);
  const ensureStep = detectConditionalDropdowns([run]);
  let finalActions = mergedWaits;
  applyVariationToActions(finalActions);
  if (ensureStep) {
    const filtered = [];
    for (let i = 0; i < mergedWaits.length; i++) {
      const a = mergedWaits[i];
      const prev = mergedWaits[i - 1];
      const next = mergedWaits[i + 1];
      if (a._dropdownSequence && a.type === 'click') {
        if (filtered.length && prev?.type === 'click') {
          const last = filtered[filtered.length - 1];
          const isCombobox = last.selectors?.some(s => (s?.value && typeof s.value === 'object' && s.value.role === 'combobox'));
          if (isCombobox) filtered.pop();
        }
        continue;
      }
      if (next?._dropdownSequence && next.type === 'click' && a.type === 'click') {
        const isComboboxTrigger = a.selectors?.some(s => (s?.value && typeof s.value === 'object' && s.value.role === 'combobox'));
        if (isComboboxTrigger) continue;
      }
      filtered.push(a);
    }
    finalActions = [ensureStep, ...filtered];
  }
  const loopAnalysis = detectLoopableWorkflow([run]);
  let urlPattern = null;
  try {
    if (run.url && run.url.startsWith('http')) urlPattern = { origin: new URL(run.url).origin, pathPattern: '*' };
  } catch (_) {}

  applyExpectedBeforeAfter(finalActions);

  return {
    actions: finalActions,
    runCount: 1,
    referenceRunIndex: 0,
    urlPattern,
    loopable: loopAnalysis?.loopable ?? false,
    loopAnalysis: loopAnalysis || undefined,
  };
}
