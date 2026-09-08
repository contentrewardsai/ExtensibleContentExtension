# Backend Integration & API Reference

The Extensible Content extension uses **Whop** for authentication and `https://www.extensiblecontent.com` for backend APIs. All calls go through `ExtensionApi` / `SidebarsApi` with a Whop Bearer token (`GET_TOKEN`). Requests use `credentials: 'omit'` so a website cookie session is never mixed with the extension token.

---

## Features

- **Login** – Sign in with Whop at [extensiblecontent.com/extension/login](https://www.extensiblecontent.com/extension/login)
- **Sidebar naming** – Name each sidebar (e.g. "Office PC", "Laptop") for multi-window awareness
- **Projects, workflows, following** – Synced via ExtensionApi
- **Social profiles** – Connected profiles for Pulse via `/api/extension/social-profiles` (listing/sync only; posting is in the Whop app)
- **Library sources** – Signed-in users can browse their own Box / HighLevel / My Files media

---

## Configuration

- **Base URL**: `https://www.extensiblecontent.com` (or `WhopAuthConfig.APP_ORIGIN`)
- **Auth**: Whop access token (Bearer) from `chrome.runtime.sendMessage({ type: 'GET_TOKEN' })` (extension pages only)
- **Clients**: `extension/api.js`, `extension/sidebars-api.js`, `extension/auth-fetch.js`

---

## Routes this extension calls

| Feature | Paths |
|---------|-----------|
| **Auth refresh** | `POST /api/extension/refresh` |
| **Sidebars** | `GET/POST/PATCH /api/extension/sidebars`, `/api/extension/sidebars/register`, `/api/extension/sidebars/disconnect` |
| **Projects** | `GET/POST/PATCH/DELETE /api/extension/projects` |
| **Workflows** | `GET/POST/PATCH/DELETE /api/extension/workflows`, `GET /api/extension/workflows/catalog` |
| **Workflow step media** | `POST /api/extension/workflow-step-media` (multipart; step narration) |
| **Following** | `GET/POST/PATCH/DELETE /api/extension/following` |
| **Pulse viral** | `GET /api/extension/inspiration/discover` (auth; logged-out clients must not call this) |
| **Industries / platforms / monetization** | `GET /api/extension/industries`, `/platforms`, `/monetization` |
| **Social profiles** | `GET/POST /api/extension/social-profiles` |
| **Pro status** | `GET /api/extension/has-upgraded` |
| **Default project** | `GET/PATCH /api/extension/user/default-project` |
| **Knowledge Q&A** | `GET /api/extension/knowledge/qa`, `POST /api/extension/knowledge/questions`, `/answers`, `/votes` |
| **GHL (extension)** | `GET /api/extension/ghl/connections`, `GET /api/extension/ghl/media` |
| **Library (signed-in)** | `/api/box/connections`, `/browse`, `/download-url`, `/upload-token`, `/auth/start`; `/api/ghl/locations/mine`, `/api/ghl/media/*`, `/api/ghl/auth/start`; `/api/whop/shared-ghl-upload-target` |

The client allowlists these paths in `shared/app-origin-guard.js`. Other app routes are not called.

---

## ExtensionApi

Key methods: `getToken()`, `isLoggedIn()`, `getProjects()`, `createProject()`, `updateProject()`, `deleteProject()`, `getDefaultProject()`, `updateDefaultProject()`, `getWorkflows()`, `getWorkflowsCatalog()`, `getWorkflow()`, `createWorkflow()`, `updateWorkflow()`, `deleteWorkflow()`, `uploadWorkflowStepMedia()`, `getFollowing()`, `createFollowing()`, `updateFollowing()`, `deleteFollowing()`, `getInspirationDiscover()`, `getIndustries()`, `getPlatforms()`, `getMonetization()`, `getSocialMediaProfiles()`, `addRemoveSocialMedia()`, `hasUpgraded()`, `getKnowledgeQa()`, `getSourceAccounts()`, `browseSource()`, `uploadToSource()`.

Generic `apiFetch` is not exported. Named methods only.

### Workflow catalog

`GET /api/extension/workflows/catalog` (auth) supports optional `hostname`, `origin`, `scope`, `limit`, `offset`. Response: `{ workflows, has_more?, next_offset? }`. **404** is treated as an empty catalog (local workflows only).

### Step narration

Narration lives in `workflow.analyzed.actions[i].comment` (prefer `comment.items`). `POST` / `PATCH` `/api/extension/workflows` must persist the full `workflow` JSON the client sends.

### Workflow step media

`POST /api/extension/workflow-step-media` (auth): multipart `file`, `workflow_id`, `step_index`, `block_id`, `kind` (`video` or `audio`). Success JSON includes a `url` string. Bodies larger than `ExtensionApi.WORKFLOW_STEP_MEDIA_MAX_BYTES` (4,500,000) fall back to an inline `data:` URL.

---

## Sidebars

`extension/sidebars-api.js`: list, register, patch name/project, disconnect. `window_id` is `${ChromeWindowId}_sidepanel`.

---

## Send to endpoint (workflows)

Workflows can HTTP to **their own** URLs via the Send to endpoint step. That helper does not attach the Whop token. See **steps/sendToEndpoint/README.md**.

---

## Troubleshooting

- **401 Unauthorized** – Whop token expired or invalid. Reload the extension and log in again.
- **404 / 500** – Route missing or server error. The extension degrades to local-only where it can.
