# Extensible Content

A Chrome extension that records your workflows, analyzes patterns across multiple runs, and automates them via spreadsheet-driven execution. **Works on any website** – from simple forms to complex AI tools – with robust support for common patterns (Radix UI, file uploads with crop, video generation, etc.).

## Features

- **Record workflows**: Perform a task while recording. Record 2–5 runs of the same workflow for better pattern matching.
- **Optional steps**: Steps that appear in some runs but not others (e.g. "I Agree" dialogs) are marked optional and skipped during playback if the element isn't found.
- **Pattern analysis**: The extension finds similarities across runs (IDs, classes, data attributes, ARIA labels, text) to build robust selectors.
- **Spreadsheet-driven automation**: Export a CSV template with columns for each input field. Fill in rows and run the workflow with your data.
- **File handling**: Upload files from URLs (specify in spreadsheet). Download files (click download links or provide URLs).
- **Smart waits**: Automatically inserts wait steps when you pause >1.5s between actions. Waits for interface updates during playback.

## Requirements

**Chrome 116 or later** is required for full functionality (Plan, Library, workflow recording and playback, generators, screen capture, etc.). On Chrome 114–115, the **Pulse** and **Activity** tabs work; other tabs show an upgrade prompt. The extension may not load on Chrome versions below 114.

## Privacy and permissions

The extension **records and automates workflows on sites you use**. Below is how sensitive Chrome permissions relate to that purpose. Use this section as the basis for **Chrome Web Store** “single purpose” and **privacy** copy; keep it in sync when [`manifest.json`](manifest.json) changes.

| Permission / access | Why it exists |
|---------------------|----------------|
| **`host_permissions` including `<all_urls>`** and content scripts on matching pages | Lets the recorder and player run on **whichever sites you choose** for workflows. Work does not run on arbitrary tabs unless you start recording or playback there. |
| **`tabs`**, **`windows`**, **`activeTab`**, **`scripting`** | Opens and targets the correct tab for recording, playback, and step injection. |
| **`clipboardRead`**, **`clipboardWrite`** | Used when a workflow includes clipboard steps, or when you copy/paste in the UI. |
| **`downloads`** | Saves files when a workflow uses download-related steps or exports. |
| **`tabCapture`** | Tab/screen capture for recording and quality-check flows (e.g. tab audio). |
| **`offscreen`** | Background processing (e.g. video/audio combine) without blocking the side panel. |
| **`storage`** | Stores workflows, settings, and **optional user-supplied** keys (e.g. LLM APIs) **locally** in the browser. |
| **`notifications`**, **`alarms`** | User-visible notifications and scheduled background tasks where enabled. |
| **`sidePanel`** | Main UI in Chrome’s side panel. |

Explicit **`host_permissions`** entries also list third-party HTTPS origins used for optional features (integrations, chain APIs, LLMs). Those calls originate from the extension only when the relevant feature or step runs. Maintainers: when adding origins, update the manifest and see **docs/HOST_PERMISSIONS_CRYPTO.md**.

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the Extensible Content project folder
5. Click the extension icon to open the **side panel** (stays open during file pickers, etc.)

**Auth / API base URL:** The side panel and settings load [`config/whop-auth.example.js`](config/whop-auth.example.js) (committed defaults pointing at production). To use a local backend, copy that file to `config/whop-auth.js` (gitignored) and set `APP_ORIGIN` to `http://localhost:3000`. The optional second script overrides the example when present.

**Content script bundle:** If you change the main-frame content script list, edit [`shared/content-script-tab-bundle.js`](shared/content-script-tab-bundle.js) and mirror the same paths in `manifest.json` under `content_scripts[0].js`, then run `npm run check:content-bundle` to verify they match.

## Usage

### 1. Create a workflow

- Click the extension icon
- Enter a name and click **Create New Workflow**

### 2. Record runs

- Select the workflow
- Click **Start Recording**
- Perform your task (click, type, upload files)
- Click **Stop Recording**
- Repeat 2–5 times for better analysis

### 3. Analyze

- Click **Analyze Runs → Create Workflow**
- This merges selectors from all runs for more reliable automation

### 4. Export template

- Select the workflow
- Click **Export CSV Template**
- Open in Excel/Sheets and fill in your data

### 5. Run playback

- Be on the correct page
- Paste one row as JSON, e.g. `{"email": "user@example.com", "name": "John"}`
- Or import a CSV and use a row
- Click **Run Workflow**

## Spreadsheet columns

Columns are derived from your recorded actions:

- **Text inputs**: `placeholder`, `name`, or `aria-label` becomes the column name
- **File uploads**: Use the variable key (e.g. `avatar`, `attachment`) or `fileUrl` – URL of file to upload. Optional: `uploadFilename` or `fileFilename` – custom filename for the uploaded file
- **Downloads**: `downloadTarget` – URL to download; `downloadFilename` – optional filename

### Upload from URL (file input forms)

When the target site uses a **file upload form** (not a URL field), put the image/file URL in your spreadsheet. The extension will:

1. Fetch the file from the URL (via the extension background, which bypasses CORS for most hosts)
2. Create a `File` object and assign it to the file input
3. Trigger the change event so the form sees the upload

Use the variable key from the recorded step, or `fileUrl`. For a custom filename (e.g. `photo.jpg`), add `uploadFilename` or `fileFilename` in the row.

## Gaps addressed

- **Selector robustness**: Multiple strategies (id, data-testid, aria-label, role, class, text, xpath) with fallbacks
- **Timing**: Waits inferred from pauses; configurable wait-after for each action
- **File uploads**: Fetch from URL and inject into file inputs (CORS permitting)
- **Downloads**: Trigger via Chrome downloads API or click the link
- **Variable mapping**: Placeholder/name/aria-label used to map spreadsheet columns to fields

## Limitations

- CORS may block file uploads from some URLs
- Use **Go to URL** and **Open tab** steps for multi-page or cross-tab workflows; recording is per-tab so re-record if the site’s navigation changes.
- Content scripts run after page load; SPA navigation may require re-recording

## Development

Edit files and reload the extension at `chrome://extensions/` to test changes. When adding new step types (or generator templates or workflow folders), set the **project folder** to your extension root (same folder you use for "Load unpacked"), then click **Reload Extension** in the side panel (between username and Sidebar Name)—it rebuilds **steps/manifest.json**, **generator/templates/manifest.json**, and **workflows/manifest.json** from the project folder and reloads. No Node or scripts required.

**Optional:** Run `node scripts/validate-step-definitions.cjs` to validate all `steps/{id}/step.json` files. See **docs/TESTING.md** for unit tests (side panel **Settings** → **Tests**, optional **Open unit tests page**, or `npm run test:unit` headless), E2E checklist, and `npm run test:e2e` (Playwright) / `npm run test:e2e:puppeteer`.

## Advanced Features

- **Partial recordings**: Append new steps to an existing workflow, or insert at a specific step index.
- **Looping**: Wrap a range of steps in a loop with configurable repeat count and wait between iterations.
- **Randomized waits**: Waits use a random duration between min–max (from recording or manual).
- **Batch runs**: Import CSV and run all rows with "Run All Rows"; configurable delay and stop-on-error.
- **Quality check**: Embedded (no external services). Uses Transformers.js for:
  - **Text mode**: Embedding similarity (all-MiniLM-L6-v2) between output and expected text
  - **Audio mode**: Capture from video/audio element → Whisper-tiny transcription → embedding similarity vs expected

## Audio transcript: how it works

### Where the transcript appears

1. Open the extension side panel.
2. Select a workflow.
3. In **Quality Check**, add at least one **input** (element or variable) and one **output**.
4. For each output, set the type to **Audio**.
5. The transcript appears in the **Transcript:** box below the outputs list when you:
   - Click **Preview transcript** (captures from the selected element), or
   - Click **Tab audio** (captures from the whole tab via a picker), or
   - Run a workflow with quality check enabled (transcript shown after the run).

### Step-by-step for Veo / Google Flow (8s looping videos)

1. **Create a workflow** and record your steps (e.g. navigate to Flow, trigger the Veo video).
2. **Analyze** the runs.
3. In **Quality Check**:
   - Click **Add input element** → on the page, click the element that shows the expected text (or use a variable).
   - Click **Add output element** → click the video/audio element (or its play button/container).
4. For the output, set the dropdown to **Audio**.
5. **Preview transcript**:
   - **Preview transcript**: Tries to capture from the element you selected. Works for same-origin media.
   - **Tab audio**: Opens a picker to choose the tab. Use this for cross-origin (e.g. embedded videos, Google Flow). Select the tab with the video and the extension records ~10 seconds.
6. The transcript appears in the **Transcript:** box below.

### Cross-origin (YouTube, embedded videos, Google Flow)

Many video players load media from another domain. Browsers block direct capture from those elements.

**Use the Tab audio button** – it uses `getDisplayMedia`, which shows a picker. Select the tab with the video. The extension records the tab’s audio and transcribes it. This works for:

- Veo videos in Google Flow
- YouTube, Vimeo, etc.
- Any site with cross-origin audio/video

### Expanding to other sites

The same flow works on any site:

1. Add an audio output (element or tab).
2. Use **Preview transcript** for same-origin media.
3. Use **Tab audio** for cross-origin or when element capture fails.
4. The transcript is shown in the Quality Check section and used for quality checks during playback.

## Multi-site support

The extension is designed to work across many websites:

- **Generic patterns**: Recording, analysis, and playback use detection-based logic (ARIA, roles, selectors) rather than site-specific URLs.
- **Common UI libraries**: Radix UI dropdowns, Material icons, styled-components, and similar frameworks are supported.
- **Upload flows**: File inputs, upload-from-URL, and post-upload modals (e.g. "Crop and Save") are handled.
- **AI / video sites**: Auto-discovery and quality check work on Google Flow, Veo, and similar platforms, with sensible defaults for any site that has prompts and video/audio outputs.

## For developers

**Documentation index:** See **docs/PROJECT_STRUCTURE.md** (§ Documentation) for the full index – project-wide docs in **docs/**, feature docs in **generator/docs/** and **steps/** (README + docs per feature).

**Quick links:** **docs/NOTES.md** (policies); **docs/WORKFLOW_SPEC.md** (workflow model); **docs/PROGRAMMATIC_API.md** (SET_IMPORTED_ROWS, RUN_WORKFLOW); **docs/PLATFORM_DEFAULTS.md** (Upload Post platform defaults: settings ↔ `config/platform-defaults.json`); **steps/CONTRACT.md** (step plugin contract, `opts.ctx` API); **docs/REMAINING_IMPLEMENTATION.md** (done/next); **docs/TESTING.md** (§ Manual test checklist).

## Help

This extension was developed by John Cook. For any questions, help, etc, email support@contentrewardsai.com
