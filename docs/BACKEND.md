# Backend Integration & API Reference

The Extensible Content extension uses **Whop** for authentication and **extensiblecontent.com** (Supabase-backed) for all backend APIs.

---

## Features

- **Login** – Sign in with Whop at [extensiblecontent.com/extension/login](https://www.extensiblecontent.com/extension/login)
- **Sidebar naming** – Name each sidebar (e.g. "Office PC", "Laptop") for multi-window awareness
- **Projects, workflows, following** – Synced to extensiblecontent.com via ExtensionApi
- **Social profiles** – Connected profiles for Pulse via `/api/extension/social-profiles`
- **Upload-Post API key** – Optional per-user key from `/api/extension/upload-post-key`

---

## Configuration

- **Base URL**: `https://www.extensiblecontent.com` (or `WhopAuthConfig.APP_ORIGIN`)
- **Auth**: Whop access token (Bearer) from background script `GET_TOKEN` message
- **ExtensionApi**: All backend calls go through `extension/api.js` and `extension/sidebars-api.js`

---

## API Endpoints (extensiblecontent.com)

| Feature | Endpoints |
|---------|-----------|
| **Auth** | Whop OAuth; token via `chrome.runtime.sendMessage({ type: 'GET_TOKEN' })` |
| **Sidebars** | `GET/POST/PATCH /api/extension/sidebars`, `/api/extension/sidebars/register` |
| **Projects** | `GET/POST/PATCH/DELETE /api/extension/projects` |
| **Workflows** | `GET/POST/PATCH/DELETE /api/extension/workflows`, `GET /api/extension/workflows/catalog` (published / domain filter; see below) |
| **Workflow step media** | `POST /api/extension/workflow-step-media` (multipart; step narration uploads — see below) |
| **Following** | `GET/POST/PATCH/DELETE /api/extension/following` (optional **`wallets[]`** on profiles — no **`price_drift_max_percent`**; drift/age are workflow-only; see **following/README.md**, **docs/BACKEND_IMPLEMENTATION_PROMPT.md**) |
| **Industries** | `GET /api/extension/industries` (no auth) |
| **Platforms** | `GET /api/extension/platforms` (no auth) |
| **Monetization** | `GET /api/extension/monetization` (no auth) |
| **Social profiles** | `GET/POST /api/extension/social-profiles` |
| **Upload-Post key** | `GET /api/extension/upload-post-key` |
| **Pro status** | `GET /api/extension/has-upgraded` |
| **Default project** | `GET/PATCH /api/extension/user/default-project` |

---

## ExtensionApi (extension/api.js)

The extension uses `ExtensionApi` for all backend calls. Key methods:

- `getToken()`, `isLoggedIn()` – Auth state
- `getProjects()`, `createProject()`, `updateProject()`, `deleteProject()`, `getDefaultProject()`, `updateDefaultProject()`
- `getWorkflows()`, `getWorkflowsCatalog({ hostname?, origin?, scope?, limit?, offset? })`, `getWorkflow()`, `createWorkflow()`, `updateWorkflow()`, `deleteWorkflow()`
- `uploadWorkflowStepMedia(formData)` — `POST /api/extension/workflow-step-media` (Bearer auth, multipart). See **Workflow step media** below.
- `getFollowing()`, `createFollowing()`, `updateFollowing()`, `deleteFollowing()`
- `getIndustries()`, `getPlatforms()`, `getMonetization()` – Options for project form
- `getSocialMediaProfiles()`, `addRemoveSocialMedia()`
- `getUploadPostApiKey()`, `hasUpgraded()`

### Workflow catalog (auto-enrich / discovery)

`GET /api/extension/workflows/catalog` (auth) supports **domain-scoped** listing for published workflows (and optionally the caller’s own rows). Intended for the sidepanel **Suggest fallbacks** flow without replacing `GET /workflows`.

**Query parameters (all optional except at least one filter recommended):**

| Param | Description |
|--------|-------------|
| `hostname` | e.g. `labs.google` — match workflows whose `workflow.urlPattern.origin` or first run URL hostname equals or is a subdomain of this host (same rules as the extension’s `urlMatchesPattern` / origin compare). |
| `origin` | Full origin e.g. `https://labs.google` — alternative to `hostname`. |
| `scope` | `published` (default for catalog: others’ published + caller’s published), `mine` (caller only), `all` (published ∪ mine, deduped). Exact semantics are server-defined; extension uses `published` for the cache. |
| `limit` | Page size (default 40, max server-enforced). |
| `offset` | Pagination offset. |

**Response:** `{ workflows: WorkflowRow[], has_more?: boolean, next_offset?: number | null }` where each `WorkflowRow` matches the shape used by `GET /workflows` (at least `id`, `name`, `published`, `workflow` JSON with `analyzed.actions`, `urlPattern`).

If the route is **not implemented**, return **404**; the extension treats that as an empty catalog and relies on **local** workflows only.

### Step narration (block list in workflow JSON)

There is **no separate API** for step narration text, image URLs, link URLs, or the order of blocks. All of that lives inside the workflow document the extension already syncs:

- Path: `workflow.analyzed.actions[i].comment` (per step).
- **Ordered blocks:** `comment.items` — array of `{ id, type, ... }` where `type` is one of `text`, `image`, `link`, `video`, `audio` (see extension `shared/step-comment.js`).
- **Legacy:** Older workflows may still use `comment.text`, `comment.images`, `comment.urls`, `comment.video`, `comment.audio`, and `comment.mediaOrder`. The extension migrates toward `items` on edit/save.

**Host requirement:** `POST` / `PATCH` `/api/extension/workflows` must persist the **full** `workflow` JSON from the client. Do **not** strip or validate away nested keys under `analyzed.actions[].comment` (treat `workflow` as opaque JSON except for your own size limits). If the server uses a strict schema or allowlist, include `comment.items` and block fields (`text`, `url`, `alt`, etc.).

### Workflow step media (narration uploads)

`POST /api/extension/workflow-step-media` (auth): multipart body with:

| Field | Description |
|--------|-------------|
| `file` | Non-empty audio/video blob (e.g. WebM from MediaRecorder). |
| `workflow_id` | Workflow id (same string the extension uses for `createWorkflow` / `updateWorkflow`, e.g. `wf_…`). |
| `step_index` | Non-negative integer (string or number). |
| `block_id` | Non-empty id for the narration block (sanitized server-side for the storage path). |
| `kind` | `video` or `audio` (sanitized; used in the path). |

The server checks that the workflow exists, is not archived, and the user is owner or in `added_by` (same access model as updating the workflow). It uploads with the Supabase service role to bucket **`workflow-data`** and responds with JSON **`{ "url": "https://…" }`** (public URL suitable for `comment.items[].url`).

Default body size limit is **4,500,000** bytes (Vercel-friendly); the extension exposes `ExtensionApi.WORKFLOW_STEP_MEDIA_MAX_BYTES` and skips the upload for larger blobs, falling back to an inline `data:` URL on save. **Public read** on that bucket/objects is required if narrations must play or load without extra auth.

Before uploading, the sidebar calls **`GET /api/extension/workflows/:id`**; if the server returns **404**, it **`POST /api/extension/workflows`** with the current local workflow (same shape as normal sync) so the row exists, then performs the multipart upload. **409** on create is treated as “already exists” (e.g. race). Other errors skip upload and fall back to embedding media in the workflow JSON.

**Host verification (extensiblecontent.com):**

1. **`POST /api/extension/workflow-step-media`** — Route exists (not 404), returns `{ "url": "https://…" }` on success; **413** or clear error if body exceeds ~4.5MB; auth + same workflow access as `PATCH` workflows (owner or `added_by`); object publicly readable if narrations should play without extra auth.
2. **Workflow persistence** — After `PATCH`, a round-trip `GET` returns `analyzed.actions[].comment.items` unchanged when the client sent them.

**Note:** Multipart `kind` is only **`video`** or **`audio`**. **Image** and **link** blocks use plain URLs in `comment.items` only; they do not use this upload endpoint unless you add a future `kind` (extension would need a matching change).

---

## Sidebars (SidebarsApi)

Sidebars use `extension/sidebars-api.js`:

- `GET /api/extension/sidebars` – List connected sidebars
- `POST /api/extension/sidebars/register` – Register/upsert sidebar
- `PATCH /api/extension/sidebars/:id` – Update sidebar name or project
- `POST /api/extension/sidebars/disconnect` – Disconnect

**`window_id`:** The extension registers with `${ChromeWindowId}_sidepanel` (stable for that browser window, independent of the active tab). The API should upsert on `(user_id, window_id)` and refresh `last_seen_at` on each register. Purge or hide rows that are stale long-term; legacy rows may use older `windowId_tabId` shapes.

---

## Sending data to your own endpoints from workflows

Workflows can send HTTP requests to any URL using the **Send to endpoint** step. Use it to POST/GET/PUT data to your backend or third-party APIs. See **steps/sendToEndpoint/README.md** for full configuration.

To run [Apify](https://apify.com) Actors or saved tasks (sync or async poll, dataset or OUTPUT), use the **Apify Actor / Task** step (or the split steps **apifyRunStart** / **apifyRunWait** / **apifyDatasetItems** → **`APIFY_RUN_START`**, **`APIFY_RUN_WAIT`**, **`APIFY_DATASET_ITEMS`**) and store your API token under extension **Settings → Apify API token** (saves are rejected over **2048** characters). The service worker validates payload size and shape (including **512**-char actor/task id, **2048**-char token, **256**-char `build` tag), optional run query numeric bounds (**`shared/apify-run-query-validation.js`**), surfaces Apify `error.details` when present, adds **Apify Console** run links when a run id appears in failed **sync** / **start run** responses or in async error paths (and **401** hints to Settings), fails async **dataset** mode if the succeeded run has no **default dataset id** (directs users to OUTPUT mode), includes **`consoleUrl`** on async **`run`** metadata, and handles **`APIFY_TEST_TOKEN`** (`GET /v2/users/me`) for Settings **Test token** (field token length checked before save/test). Async default-dataset paging uses **`shared/apify-dataset-response.js`**; sync/start error Console hints use **`shared/apify-extract-run-id.js`**. Run **`npm run test:apify`** for those plus run-query validation. **Stop** during playback sends **`APIFY_RUN_CANCEL`** (tab id from the side panel and/or the content tab) so the service worker aborts in-flight Apify HTTP work for that tab (**`APIFY_RUN`** and the split messages); the remote Apify run may still continue on Apify’s side. See **steps/apifyActorRun/README.md**.

---

## Remote workflow triggers (removed)

Remote workflow triggers via Socket.IO have been removed. Workflows are run locally from the extension. To add remote triggers in the future, consider Supabase Realtime or a polling-based API.

---

## Troubleshooting

- **401 Unauthorized** – Whop token expired or invalid. Reload the extension and login again.
- **404 / 500** – API endpoint may not be implemented on extensiblecontent.com yet. Check the site's API routes.
- **CORS** – Ensure extensiblecontent.com allows requests from the extension origin (`chrome-extension://...`).
