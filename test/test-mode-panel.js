/**
 * Test mode panel: E2E checklist with tickable items, persisted in chrome.storage.
 * Built-in items + optional step-contributed items from steps/{id}/e2e-checklist.json.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'cfs_testChecklist';

  var BUILTIN_CHECKLIST = [
    { section: 'Core flows', id: 'create-workflow', label: 'Create workflow', desc: 'Create New Workflow, add a step (e.g. Click), save. Workflow appears in dropdown.', snippet: null },
    { section: 'Core flows', id: 'record', label: 'Record', desc: 'Start Recording on a site, perform 1–2 actions, Stop. Steps appear in the workflow.', snippet: null },
    { section: 'Core flows', id: 'analyze', label: 'Analyze', desc: 'Analyze Runs → Create Workflow. Selectors merge; workflow updates.', snippet: null },
    { section: 'Core flows', id: 'playback', label: 'Playback', desc: 'Paste one row (e.g. {"text": "hello"}), Run Workflow. Playback runs and completes or fails with a clear step index.', snippet: '{"text": "hello"}' },
    { section: 'Core flows', id: 'delay-before-next', label: 'Delay before next run', desc: 'The last step is always "Delay before next run". Run All Rows: delay between rows from this step.', snippet: null },
    { section: 'Core flows', id: 'run-from-current', label: 'Run from current row', desc: 'With 5 rows, use Prev/Next to select row 3; click Run All Rows. Only rows 3–5 run.', snippet: null },
    { section: 'Core flows', id: 'loop-over-list', label: 'Loop over list', desc: 'Add Loop step, set Loop over list to a row variable. Add nested step that uses {{item}} or {{itemIndex}}.', snippet: null },
    { section: 'Core flows', id: 'run-workflow-nested', label: 'Run workflow (nested)', desc: 'Add Run workflow step, select a child workflow. Run; child workflow runs with current row.', snippet: null },
    { section: 'Core flows', id: 'on-failure', label: 'On failure (per step)', desc: 'In step editor, set On failure to Stop batch / Skip row / Retry row.', snippet: null },
    { section: 'Programmatic API', id: 'set-imported-rows', label: 'SET_IMPORTED_ROWS', desc: 'From devtools: send SET_IMPORTED_ROWS with rows. Open side panel; imported rows should show.', snippet: "chrome.runtime.sendMessage(extensionId, { type: 'SET_IMPORTED_ROWS', rows: [{ a: 1 }] }, r => console.log(r))" },
    { section: 'Programmatic API', id: 'run-workflow-api', label: 'RUN_WORKFLOW', desc: 'Send RUN_WORKFLOW with workflowId, rows, autoStart. Side panel should set workflow and optionally start.', snippet: "{ type: 'RUN_WORKFLOW', workflowId: '<id>', rows: [...], autoStart: 'current' }" },
    { section: 'Steps that call background/offscreen', id: 'extract-data', label: 'Extract data', desc: 'Add extractData step, set list/item selectors, run on a page with a list.', snippet: null },
    { section: 'Steps that call background/offscreen', id: 'llm-step', label: 'LLM step', desc: 'Add LLM step (local LaMini model). Run with a prompt; result saved to row variable. Requires model download (scripts/download-lamini-model.sh).', snippet: null },
    { section: 'Steps that call background/offscreen', id: 'run-generator', label: 'Run generator', desc: 'Add Run generator step, pick a generator, set input map, run.', snippet: null },
    { section: 'Steps that call background/offscreen', id: 'run-generator-video', label: 'Run generator (video)', desc: 'Use a timeline/video template. Run generator step produces WebM URL.', snippet: null },
    { section: 'Steps that call background/offscreen', id: 'generator-ui', label: 'Generator UI (templates)', desc: 'Open generator tab; dropdown lists templates. Select a template; unified editor is default preview.', snippet: null },
    { section: 'Steps that call background/offscreen', id: 'unified-editor', label: 'Unified editor', desc: 'Editor toolbar: dimensions, zoom, Undo/Redo, Copy/Paste, Export PNG/Video.', snippet: null },
    { section: 'Steps that call background/offscreen', id: 'save-to-project', label: 'Save to project folder', desc: 'Set project folder, open template, click Save to project folder, enter ID and name.', snippet: null },
    { section: 'Steps that call background/offscreen', id: 'walkthrough-output', label: 'Walkthrough output', desc: 'Select Walkthrough embed template; paste workflow JSON. Set Output to Walkthrough.', snippet: null },
    
    { section: 'Steps that call background/offscreen', id: 'bulk-create', label: 'Bulk create', desc: 'Select template, click Bulk create, enter number. Generating 1 of N… appears.', snippet: null },
    { section: 'Steps that call background/offscreen', id: 'ad-apple-notes', label: 'Ad Apple Notes', desc: 'Select ad-apple-notes; Run generator step produces image from template.', snippet: null },
    { section: 'Steps that call background/offscreen', id: 'ad-facebook', label: 'Ad Facebook', desc: 'Select ad-facebook; Run generator step produces image from template.', snippet: null },
    { section: 'Steps that call background/offscreen', id: 'book-output-multipage', label: 'Book output (multi-page)', desc: 'Templates with multiple pages: Export book downloads each page image.', snippet: null },
    { section: 'Steps that call background/offscreen', id: 'ad-generator-variants', label: 'Ad-generator style variants', desc: 'Template Style dropdown (twitter / facebook / note). Changing style reloads template.', snippet: null },
    { section: 'Steps that call background/offscreen', id: 'tts-audio', label: 'TTS / audio export', desc: 'TTS template: Download audio. Real audio URL triggers download.', snippet: null },
    { section: 'Steps that call background/offscreen', id: 'screen-capture', label: 'Screen capture', desc: 'Add screen capture step, run. Permission prompt; recording starts.', snippet: null },
    { section: 'Extension & Dev', id: 'tests-button', label: 'Tests button', desc: 'Click Tests (next to Reload Extension). Unit tests page opens with pass/fail and E2E checklist.', snippet: null },
    { section: 'Extension & Dev', id: 'step-validation', label: 'Step validation', desc: 'Run node scripts/validate-step-definitions.cjs; exit 0 if all step.json valid.', snippet: 'node scripts/validate-step-definitions.cjs' },
    { section: 'Steps: Send to endpoint, Type, Select', id: 'send-to-endpoint', label: 'Send to endpoint', desc: 'Add step, set URL or {{url}}, body template with {{var}}. Run; request sent with row values.', snippet: '{"name": "{{name}}", "id": "{{id}}"}' },
    { section: 'Steps: Send to endpoint, Type, Select', id: 'type-step', label: 'Type step', desc: 'Add step, set variableKey. Paste row with value. Run; value typed into target.', snippet: null },
    { section: 'Steps: Send to endpoint, Type, Select', id: 'select-step', label: 'Select step', desc: 'Add step, set variableKey to row column with option value. Run; option selected.', snippet: null },
    { section: 'Edge cases', id: 'import-workflow', label: 'Import workflow', desc: 'Import from file or URL: valid JSON with workflows or single workflow.', snippet: null },
    { section: 'Edge cases', id: 'copy-paste-workflow', label: 'Copy / Paste workflow', desc: 'Copy workflow copies JSON to clipboard; Paste parses and merges.', snippet: null },
    { section: 'Edge cases', id: 'run-workflow-invalid', label: 'RUN_WORKFLOW invalid id', desc: 'Send with workflowId nonexistent; callback receives { ok: false, error: Workflow not found }.', snippet: "chrome.runtime.sendMessage(id, { type: 'RUN_WORKFLOW', workflowId: 'nonexistent' }, r => console.log(r))" },
    { section: 'Edge cases', id: 'reload-extension', label: 'Reload extension', desc: 'Reload at chrome://extensions. Steps list and playback still work.', snippet: null },
    { section: 'Edge cases', id: 'select-on-page', label: 'Select on page', desc: 'In step editor, Select on page for a selector. Click on the page; selector updates.', snippet: null },
    { section: 'Optional', id: 'schedule-run', label: 'Schedule run', desc: 'Schedule a one-time run; it appears in Activity → Upcoming.', snippet: null },
    { section: 'Optional', id: 'quality-check', label: 'Quality check', desc: 'Add QC inputs/outputs, run workflow with Check quality after each run.', snippet: null },
  ];

  /** Load E2E checklist items from steps/{id}/e2e-checklist.json. Returns Promise<Array>. */
  function loadStepChecklistItems() {
    var getUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL.bind(chrome.runtime)
      : null;
    if (!getUrl) return Promise.resolve([]);

    return fetch(getUrl('steps/manifest.json'))
      .then(function (r) { return r.ok ? r.json() : { steps: [] }; })
      .catch(function () { return { steps: [] }; })
      .then(function (manifest) {
        var steps = Array.isArray(manifest.steps) ? manifest.steps : [];
        return Promise.all(steps.map(function (stepId) {
          return fetch(getUrl('steps/' + stepId + '/e2e-checklist.json'))
            .then(function (r) {
              if (!r.ok) return null;
              return r.json().catch(function () { return null; });
            })
            .catch(function () { return null; })
            .then(function (data) {
              if (!data || !Array.isArray(data.items) || data.items.length === 0) return [];
              var section = (data.section != null && data.section !== '')
                ? String(data.section)
                : (stepId.charAt(0).toUpperCase() + stepId.slice(1));
              return data.items.map(function (item) {
                var id = (item.id && String(item.id).indexOf(':') < 0)
                  ? stepId + ':' + item.id
                  : (item.id || stepId + ':item');
                return {
                  section: section,
                  id: id,
                  label: item.label || id,
                  desc: item.desc || '',
                  snippet: item.snippet != null ? item.snippet : null,
                };
              });
            });
        })).then(function (arrays) {
          return arrays.reduce(function (acc, arr) { return acc.concat(arr); }, []);
        });
      });
  }

  function getStorage() {
    return (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local)
      ? chrome.storage.local
      : null;
  }

  function loadChecked() {
    var storage = getStorage();
    if (!storage) return Promise.resolve({});
    return new Promise(function (resolve) {
      storage.get(STORAGE_KEY, function (data) {
        resolve((data && data[STORAGE_KEY]) || {});
      });
    });
  }

  function saveChecked(checked) {
    var storage = getStorage();
    if (!storage) return Promise.resolve();
    return new Promise(function (resolve) {
      storage.set({ cfs_testChecklist: checked }, resolve);
    });
  }

  var currentChecklist = [];

  function renderList(listEl, checked, checklist) {
    if (!listEl) return;
    var list = checklist != null && checklist.length > 0 ? checklist : currentChecklist;
    var lastSection = '';
    var frag = document.createDocumentFragment();

    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (item.section !== lastSection) {
        lastSection = item.section;
        var sec = document.createElement('li');
        sec.className = 'checklist-section';
        sec.textContent = item.section;
        sec.style.listStyle = 'none';
        frag.appendChild(sec);
      }
      var li = document.createElement('li');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'check-' + item.id;
      cb.checked = !!checked[item.id];
      cb.dataset.id = item.id;
      cb.addEventListener('change', function () {
        var id = this.dataset.id;
        checked[id] = this.checked;
        saveChecked(checked);
      });
      var label = document.createElement('label');
      label.htmlFor = cb.id;
      label.appendChild(cb);
      var strong = document.createElement('strong');
      strong.textContent = item.label + ' – ';
      label.appendChild(strong);
      label.appendChild(document.createTextNode(item.desc));
      if (item.snippet) {
        var copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.textContent = 'Copy';
        copyBtn.className = 'btn btn-outline btn-small';
        copyBtn.style.marginLeft = '8px';
        copyBtn.addEventListener('click', function () {
          navigator.clipboard.writeText(item.snippet).then(function () {
            copyBtn.textContent = 'Copied!';
            setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1500);
          });
        });
        label.appendChild(copyBtn);
      }
      li.appendChild(label);
      frag.appendChild(li);
    }
    listEl.innerHTML = '';
    listEl.appendChild(frag);
  }

  function init(panelEl, listEl) {
    if (!panelEl || !listEl) return;
    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear progress';
    clearBtn.className = 'btn';
    clearBtn.style.marginBottom = '12px';
    clearBtn.addEventListener('click', function () {
      saveChecked({}).then(function () {
        renderList(listEl, {}, currentChecklist);
      });
    });
    panelEl.insertBefore(clearBtn, listEl);
    Promise.all([loadChecked(), loadStepChecklistItems()]).then(function (results) {
      var checked = results[0];
      var stepItems = results[1];
      currentChecklist = BUILTIN_CHECKLIST.concat(stepItems);
      renderList(listEl, checked, currentChecklist);
    });
  }

  if (typeof global !== 'undefined') {
    global.CFS_testModePanel = { init: init };
  }
})(typeof window !== 'undefined' ? window : globalThis);
