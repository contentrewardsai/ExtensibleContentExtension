# Generator E2E Test Coverage Analysis

This document lists **every testable feature, button, and behavior** in the `generator/` module and compares **what is currently covered** by Playwright E2E tests versus **what is missing**.

---

## How generator E2E tests run

- **Playwright (recommended):** `npm run test:e2e` runs `npx playwright test`, which executes all specs in `test/e2e/`, including **`generator.spec.mjs`**.
- **Puppeteer script:** `npm run test:e2e:puppeteer` runs `scripts/run-e2e-puppeteer.mjs`, which does **not** open or test the generator UI; it only runs unit tests, programmatic API, playback workflows (click/type/select/extract/send-endpoint/hover/key/wait/goToUrl/delayBeforeNextRun), and paste workflow.

So **generator-specific E2E coverage** is entirely in **`test/e2e/generator.spec.mjs`**, using the shared extension fixture (extension loaded, generator at `chrome-extension://.../generator/index.html`).

---

## 1. Generator UI (index.html + generator-interface.js)

| Feature / element | Description | Currently tested? | Notes |
|------------------|-------------|-------------------|--------|
| **Template dropdown** (`#pluginSelect`) | Choose template from `generator/templates/manifest.json` (ad-apple-notes, ad-facebook, ad-twitter, blank-canvas) | ❌ No | Tests inject a template via `loadImportedShotstackTemplate()`; they never select from the dropdown. |
| **Plugin description** (`#pluginDescription`) | Shows extension description when a template is selected | ❌ No | Not asserted. |
| **Variables panel** (`#variablesPanel`) | Renders input fields from `extension.inputSchema`; changing values triggers `syncPreview()` | ❌ No | No test types into variable inputs or checks preview update. |
| **Import JSON when no template** (`#importJsonWhenNoTemplate`) | Button visible when no template selected; opens file picker to load ShotStack JSON | ❌ No | Not tested. |
| **Editor elements wrap** (`#editorElementsWrap`) | Contains Add content, Layers, Properties panels; shown when unified editor or ad-card editor is active | ✅ Indirectly | Visible when editor is created; not explicitly asserted. |
| **Import ShotStack JSON** (`#importShotstackJsonBtn`) | With template selected, import a ShotStack JSON file | ❌ No | File picker flow not tested. |
| **Export ShotStack JSON** (`#exportShotstackJsonBtn`) | Export current template as JSON (download) | ✅ Partially | Export **content** is tested (getShotstackTemplate(), clip count, tracks); **button click and download** are not. |
| **Bulk create** (`#bulkCreateBtn`) | Prompt for N, then "Generating 1 of N…" | ❌ No | Uses `window.prompt`; not tested. |
| **From workflow** (`#createFromWorkflowBtn`) | Injects `window.__CFS_workflowStepData` into variable values and syncs preview | ❌ No | Not tested. |
| **From scheduled** (`#createFromScheduledBtn`) | Injects `window.__CFS_scheduledWorkflowData` | ❌ No | Not tested. |
| **Save as new template** (`#saveAsTemplateBtn`) | Prompts for ID/name/version, downloads template.json | ❌ No | Prompts and download not tested. |
| **Save to project folder** (`#saveToProjectFolderBtn`) | Sends `SAVE_TEMPLATE_TO_PROJECT` to extension; requires project folder | ❌ No | Requires chrome.runtime and project folder. |
| **Export as PNG** (`#exportImageBtn`) | Toolbar button for image output type | ❌ No | Click and download not tested; only canvas.toDataURL / captureFrameAt in isolation. |
| **Copy text** (`#exportTextBtn`) | For text output type | ❌ No | Not tested. |
| **Export video** (`#exportVideoBtn`) | For video output type | ❌ No | Availability of `renderTimelineToVideoBlob` is tested; button click and export flow are not. |
| **Download audio** (`#exportAudioBtn`) | For audio output type | ❌ No | `exportAudio` on editor is checked; toolbar click not tested. |
| **Export book** (`#exportBookBtn`) | For book output type | ❌ No | Not tested. |
| **Export error banner** (`#exportErrorBanner`) | Copy / Retry / Dismiss when export fails | ❌ No | Not tested. |
| **Preview container vs placeholder** | Placeholder "Select a generator…" when no template; preview when template loaded | ✅ Indirectly | Tests assume template already loaded. |
| **Open sidebar panel** (`#openSidepanelLink`) | When generator is embedded (e.g. in extension) | ❌ No | Not tested. |

---

## 2. Template selection and loading

| Feature | Description | Currently tested? | Notes |
|---------|-------------|-------------------|--------|
| **Template list from manifest** | On load, dropdown populated from `generator/templates/manifest.json` | ❌ No | Tests bypass this by injecting a template. |
| **Select template from dropdown** | Change `#pluginSelect` and verify template loads (preview, variables, editor) | ❌ No | Missing. |
| **Select "— Choose template —"** | Clear selection; preview clears, variables clear, Import JSON when no template shown | ❌ No | Not tested. |
| **Failed template** | Template that fails to load shows error message in preview area | ❌ No | Not tested. |
| **Ad-card templates** (ad-apple-notes, ad-facebook, ad-twitter) | Show ad-card editor: layers (name, handle, text, profile image), property panel; no timeline | ❌ No | No test selects ad-apple-notes or ad-facebook. |
| **Blank canvas template** | Empty canvas; Add text / Add shape / etc. | ❌ No | No test selects blank-canvas. |

---

## 3. Unified editor (unified-editor.js)

| Feature | Description | Currently tested? | Notes |
|---------|-------------|-------------------|--------|
| **Canvas dimensions** | Match template `output.size` | ✅ Yes | e.g. 1080×1920 for New Arrivals. |
| **All clips imported as canvas objects** | Track count and object count | ✅ Yes | ≥13 objects. |
| **Text clips** | Font, size, color, wrap, merge substitution (e.g. BRAND_NAME, Shop new arrivals) | ✅ Yes | Multiple assertions. |
| **Background rects** | Empty text with background; asset.height; position | ✅ Yes | Gold/white/full bg rects. |
| **Position/offset** | positionFromClip; center + offset x/y | ✅ Yes | BRAND_NAME, Shop text, gold bg, etc. |
| **Clip timing** | cfsStart, cfsLength, length:"end" | ✅ Yes | Timing and visibility tests. |
| **Transitions/effects** | cfsTransition, cfsEffect; fade, slideDown, slideUp, zoomOutSlow | ✅ Yes | Metadata and visibility at seek times. |
| **Timeline visibility** | seekToTime(t); objects visible/hidden by start+length | ✅ Yes | t=0, 2, 3, 4, 5.5, 7, 10, 13.5, 15.5; boundaries; seek forward/back. |
| **Export ShotStack JSON** | getShotstackTemplate(); tracks, clips, audio, fonts, output | ✅ Yes | Structure and round-trip. |
| **Frame capture** | toDataURL('png'); captureFrameAt(canvas, time) | ✅ Yes | Valid PNG; different at t=0 vs t=4/5. |
| **Video clips** | src not blob after round-trip; start times | ✅ Yes | URLs and timing. |
| **Merge variables** | merge array and {{ }} in clips survive export | ✅ Yes | BRAND_NAME merge. |
| **Layers panel** | All objects appear as layer items; audio layers | ✅ Yes | Count and labels. |
| **Add Audio Track** | Button adds track and layer entry | ✅ Yes | Add audio button click. |
| **Soundtrack / toolbar buttons** | Text not clipped; all toolbar buttons visible | ✅ Yes | Soundtrack and all timeline toolbar buttons. |
| **Add text** | addText(); new text object on canvas and in layers | ✅ Yes | addText() then assert object + layer. |
| **Add shape** | addShape(); new shape on canvas and in layers | ✅ Yes | addShape() then assert. |
| **Delete object** | Remove from canvas (and layers) | ✅ Yes | add shape, remove, assert count. |
| **Undo** | Ctrl+Z restores deleted object | ✅ Yes | Undo after delete. |
| **Redo** | Ctrl+Shift+Z re-applies deletion | ✅ Yes | Redo after undo. |
| **Import SVG** | importSvg exists; "Import SVG" button present | ✅ Yes | API and button. |
| **exportAudio** | Editor has exportAudio | ✅ Yes | Function presence. |
| **Zoom** | Default zoom "fit"; canvas fit to window; no scrollbars when fit | ✅ Yes | zoom value, wrap overflow, frame size. |
| **Preview container height** | Fills viewport | ✅ Yes | fillsViewport. |
| **PixiJS / video export** | PIXI loaded; renderTimelineToVideoBlob; MediaRecorder | ✅ Yes | Availability. |
| **renderTimelineToAudioBlob** | Template engine has function | ✅ Yes | Availability. |
| **Audio clip fadeOut** | In exported template | ✅ Yes | effect contains fade. |
| **Opacity 0.5** | Clip opacity in template | ✅ Yes | halfOpacity clip. |
| **Layer order** | ShotStack track order → Fabric z-order | ✅ Yes | img < goldBg < shop < brand. |
| **Zoom dropdown** | Change zoom (50%, 100%, etc.) | ❌ No | Only default "fit" asserted. |
| **Dimensions dropdown** | Output size / preset change | ❌ No | Not tested. |
| **Add image** | File picker; image on canvas | ❌ No | Not tested. |
| **Timeline play/pause** | Playback control | ❌ No | Not tested. |
| **Property panel edits** | Change font size, color, URL, volume, etc. and see canvas update | ❌ No | Not tested. |
| **Copy/paste objects** | Duplicate object via copy/paste | ❌ No | Not tested. |

---

## 4. Run generator step (workflow integration)

| Feature | Description | Currently tested? | Notes |
|---------|-------------|-------------------|--------|
| **Run generator step** | Side panel: add Run generator step, set plugin + inputMap + saveAsVariable; run workflow; get image/video/text | ❌ No | Manual E2E checklist only (run-generator, run-generator-video). Not in generator.spec.mjs or playback workflows. |
| **Save generation to project** | Step saves output to project folder | ✅ In playback config | e2e-test-saveGenerationToProject in e2e-step-config.json (prereqs: fixture, projectFolder); run by `playback.spec.mjs` (Playwright) or `test:e2e:puppeteer` when project folder is set. Not in generator.spec.mjs. |

---

## 5. E2E checklist (manual) vs Playwright

The **manual E2E checklist** in `test-mode-panel.js` (Tests page, opened in a new tab via the Tests button in the side panel) includes generator-related items that are **not** automated in Playwright:

- **run-generator** – Add Run generator step, pick generator, set input map, run.
- **run-generator-video** – Video template; Run generator produces WebM URL.
- **generator-ui** – Open generator tab; dropdown lists templates; select template; unified editor preview.
- **unified-editor** – Toolbar: dimensions, zoom, Undo/Redo, Copy/Paste, Export PNG/Video.
- **save-to-project** – Set project folder, open template, Save to project folder, enter ID/name.
- **bulk-create** – Select template, Bulk create, enter number; "Generating 1 of N…".
- **ad-apple-notes** – Select ad-apple-notes; Run generator produces image.
- **ad-facebook** – Select ad-facebook; Run generator produces image.
- **ad-generator-variants** – Template Style dropdown (twitter/facebook/note); changing style reloads template.
- **book-output-multipage** – Multi-page book; Export book downloads each page.
- **tts-audio** – TTS template; Download audio.

None of these are fully covered by **automated** Playwright tests in `generator.spec.mjs`.

---

## 6. Unit tests (generator-tests.js)

Unit tests in `test/generator-tests.js` cover **pure logic** (position, merge, duration, audio effect mapping, etc.), not UI. They are run from the unit-tests page (and by `test:e2e:puppeteer` as part of the "unit tests" suite). They are **separate** from generator UI E2E coverage.

---

## Summary tables

### Currently tested in Playwright (generator.spec.mjs)

- Load generator page and inject one ShotStack template (New Arrivals).
- Canvas dimensions, clip import, text/rect/video/image clips, positions, timing, transitions/effects.
- Timeline visibility at multiple seek times; boundaries; length:"end".
- Export ShotStack JSON structure; frame capture PNG; merge round-trip; video URLs.
- Layers panel (count, audio layers, Add Audio Track, toolbar text).
- Add text, Add shape; delete object; undo; redo.
- Import SVG and exportAudio availability; zoom fit; PixiJS/video/audio export APIs.
- Position/alignment/opacity/audio effect and various edge cases around the **injected** template.

### Missing in Playwright (generator)

1. **Template dropdown** – Select any template from manifest (ad-apple-notes, ad-facebook, ad-twitter, blank-canvas) and verify load.
2. **Variables panel** – Type in inputs; verify preview sync.
3. **Import JSON** – When no template; with template (file flow hard without mocking).
4. **Export ShotStack JSON** – Button click and download (not just getShotstackTemplate).
5. **Bulk create** – Button and flow (prompt makes it tricky).
6. **From workflow / From scheduled** – Buttons and data injection.
7. **Save as new template / Save to project folder** – Flows (prompts + chrome.runtime).
8. **Export toolbar** – Export as PNG, Copy text, Export video, Download audio, Export book (click and outcome).
9. **Export error banner** – Trigger error; Copy / Retry / Dismiss.
10. **Ad-card templates** – Select ad-apple-notes or ad-facebook; ad-card editor and layers/properties.
11. **Blank canvas** – Select and add content from empty state.
12. **Clear template** – Select "— Choose template —"; preview and variables clear.
13. **Failed template** – Error message in preview.
14. **Unified editor** – Zoom change, dimensions change, Add image, timeline play, property panel edits, copy/paste.
15. **Run generator step** – Full workflow from side panel (add step, run, get output).
16. **Open sidebar panel** – When embedded.

Use this list to add or extend Playwright tests in `test/e2e/generator.spec.mjs` or new specs (e.g. generator-ui.spec.mjs, run-generator.spec.mjs) as needed.
