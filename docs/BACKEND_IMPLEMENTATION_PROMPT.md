# Backend Implementation Prompt for extensiblecontent.com

Use this document as a Cursor prompt to implement the extension backend APIs. The Extensible Content Chrome extension uses **Whop** for auth and expects these endpoints on `https://www.extensiblecontent.com`.

---

## Authentication

All extension API requests include `Authorization: Bearer <whop_access_token>`. The backend must:

1. **Validate the Whop token** – Verify the JWT with Whop's public keys or your Whop webhook/session store.
2. **Resolve user** – Extract `user_id` (Whop member ID) from the token. Create or find a local `users` record keyed by `whop_user_id`.
3. **Scope all data** – All extension data (projects, workflows, following, social profiles, etc.) must be scoped to the authenticated user.

---

## Database Schema

### 1. `users` table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Internal user ID |
| whop_user_id | String (unique) | Whop member ID from token |
| email | String | User email (from Whop user object) |
| has_upgraded | Boolean | Pro status; default false |
| default_project_id | String? | FK to projects; nullable |
| created_at | Timestamp | |
| updated_at | Timestamp | |

### 2. `projects` table

| Column | Type | Description |
|--------|------|-------------|
| id | String (PK) | e.g. `proj_1234567890` |
| user_id | UUID (FK) | References users.id |
| name | String | Project name |
| industry_ids | JSON/Array | e.g. `["ind_1", "ind_2"]` |
| platform_ids | JSON/Array | |
| monetization_ids | JSON/Array | |
| created_at | Timestamp | |
| updated_at | Timestamp | |

### 3. `workflows` table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| user_id | UUID (FK) | |
| name | String | |
| workflow | JSON | Full workflow object (opaque for narration — see **Step narration in workflow JSON** below) |
| private | Boolean | default true |
| published | Boolean | default false |
| version | Integer | |
| initial_version | String? | |
| added_by | JSON/Array | |
| created_at | Timestamp | |
| updated_at | Timestamp | |

### 4. `following` table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| user_id | UUID (FK) | |
| name | String | |
| birthday | String? | |
| accounts | JSON | Array of `{handle, url, platform_id}` |
| wallets | JSON? | Optional array of Following **on-chain wallets** (`chain`, `address`, `network`, watch / automation sizing fields, `slippage_bps`, etc.) for Pulse sync — extension is **file/local-first** today; add when API should round-trip **`wallets[]`** with profiles (see **following/README.md**). **Do not** persist removed fields **`price_drift_max_percent`** / legacy drift object — **price drift** and **tx max age** are workflow-only (**`watchActivityFilterPriceDrift`**, **`watchActivityFilterTxAge`**); there is no per-wallet or global API field for them anymore. |
| emails | JSON | Array of `{email}` |
| phones | JSON | Array of `{phone_number}` |
| addresses | JSON | Array of `{address, address_2, city, state, zip, country}` |
| notes | JSON | Array of `{note, access, scheduled}` |
| created_at | Timestamp | |
| updated_at | Timestamp | |

### 5. `sidebars` table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| user_id | UUID (FK) | |
| window_id | String | Chrome `windows.Window.id` + `_sidepanel`, e.g. `42_sidepanel` (stable for that browser window; **not** the active tab id) |
| sidebar_name | String | e.g. "Office PC" |
| active_project_id | String? | FK to projects |
| last_seen_at | Timestamp | Updated on register/patch |
| created_at | Timestamp | |
| updated_at | Timestamp | |

### 6. `social_profiles` table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| user_id | UUID (FK) | |
| name | String | Profile name |
| user | String | Username/handle |
| access_url | String? | |
| created_at | Timestamp | |
| updated_at | Timestamp | |

### 7. `user_settings` table (optional – for upload-post key, etc.)

| Column | Type | Description |
|--------|------|-------------|
| user_id | UUID (FK) | |
| upload_post_api_key | String? | Encrypted |
| upload_post_profile_user | String? | |
| created_at | Timestamp | |
| updated_at | Timestamp | |

### 8. Knowledge Q&A (`knowledge_questions`, `knowledge_answers`)

The extension calls `POST /api/extension/knowledge/answers` with `question_id`, optional `workflow_id`, optional `text`, and optional **`for_review: true`** (boolean). The handler must persist rows Supabase can read/write without schema-cache errors.

**`knowledge_answers` — required columns for the current extension + Next route contract**

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| question_id | UUID (FK) | |
| user_id | UUID (FK) | Submitter |
| workflow_id | String? | Extension workflow id when answer is a workflow link |
| answer_text | Text? | When text-only answer |
| status | String | e.g. `pending`, `approved` — use **`pending`** for moderator review queue |
| workflow_kb_check_bypass | Boolean | **Required** if your API returns this field on `for_review` success. Set **`true`** when the row was created with `for_review: true` (catalog eligibility was bypassed for review). Default **`false`**. |
| submission_kind | String? | e.g. **`workflow_pending_catalog`** when `for_review` path used; extension shows “submitted for review” |
| created_at | Timestamp | |
| updated_at | Timestamp | |

**Troubleshooting — Supabase error:** `Could not find the 'workflow_kb_check_bypass' column of 'knowledge_answers' in the schema cache`

Your route (or `.select()`) references `workflow_kb_check_bypass` but the table was created before that column existed. Apply a migration, then refresh the schema cache (or wait for Supabase to pick it up):

```sql
ALTER TABLE knowledge_answers
  ADD COLUMN IF NOT EXISTS workflow_kb_check_bypass BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE knowledge_answers
  ADD COLUMN IF NOT EXISTS submission_kind TEXT;
```

Ensure **`GET /api/extension/knowledge/qa`** only returns **approved** answers (and eligible workflows) unless you intentionally add a “my submissions” view.

---

## API Endpoints

Base path: `/api/extension`. All require `Authorization: Bearer <token>` unless noted.

### Auth & User

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| GET | `/has-upgraded` | Pro status | `{ has_upgraded: true \| false }` |
| GET | `/user/default-project` | Default project ID | `{ default_project_id: string \| null }` |
| PATCH | `/user/default-project` | Set default project | `{ default_project_id: string \| null }` |

### Reference Data (no auth)

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| GET | `/industries` | Industry options | `{ industries: [{ id, name }] }` |
| GET | `/platforms` | Platform options | `{ platforms: [{ id, name, slug }] }` |
| GET | `/monetization` | Monetization options | `{ monetization: [{ id, name, slug }] }` |

### Projects

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| GET | `/projects` | List user's projects | `{ projects: [...] }` or array |
| GET | `/projects/:id` | Get one project | `{ id, name, industry_ids, platform_ids, monetization_ids }` |
| POST | `/projects` | Create project | `{ id, name, ... }` |
| PATCH | `/projects/:id` | Update project | `{ id, name, ... }` |
| DELETE | `/projects/:id` | Delete project | 204 |

### Workflows

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| GET | `/workflows` | List user's workflows | `{ workflows: [...] }` or array |
| GET | `/workflows/catalog` | Domain-scoped list for auto-enrich (published + optional mine); query: `hostname`, `origin`, `scope`, `limit`, `offset` | `{ workflows: [...], has_more?, next_offset? }` |
| GET | `/workflows/:id` | Get one workflow | `{ id, name, workflow, ... }` |
| POST | `/workflows` | Create workflow | `{ id, name, workflow, ... }` |
| PATCH | `/workflows/:id` | Update workflow | `{ id, name, workflow, ... }` |
| DELETE | `/workflows/:id` | Soft delete (archived) | 204 |
| POST | `/workflow-step-media` | Multipart: `file`, `workflow_id`, `step_index`, `block_id`, `kind` (`video` \| `audio`). User must own workflow or be in `added_by`. Upload to Supabase Storage bucket `workflow-data`. | `{ url: string }` public CDN URL |

### Step narration in workflow JSON

The extension stores **per-step narration** inside `workflow.analyzed.actions[i].comment`:

- **Primary shape:** `comment.items` — ordered array of blocks: `{ id, type, text? }` or `{ id, type, url, alt? }` with `type` in `text` \| `image` \| `link` \| `video` \| `audio`.
- **Optional:** `comment.mediaOrder: ['items']` when using only `items`.
- **Legacy** workflows may still have `comment.text`, `comment.images`, `comment.urls`, `comment.video`, `comment.audio`; do not strip these on read if present.

**Implementation rule:** Treat the `workflow` column as JSON and persist what the client sends on `POST`/`PATCH`. If you validate or prune keys, **allowlist** `analyzed`, `actions`, `comment`, `items`, and common comment fields so narrations are not dropped. No separate REST resource is required for narration.

### `POST /workflow-step-media` implementation checklist

1. **Auth** — Bearer Whop token; resolve user; require same access as updating the workflow (row owner or listed in `added_by`).
2. **Multipart fields** — `file` (required, non-empty), `workflow_id`, `step_index`, `block_id`, `kind` (`video` or `audio` only). Reject unknown `kind` with 400.
3. **Workflow** — Load workflow by id; ensure not archived/deleted; `workflow_id` matches extension id format (e.g. `wf_…`).
4. **Storage** — Upload with service role to Supabase bucket **`workflow-data`**. Suggested path segment pattern: `{user_id}/{workflow_id}/step-{step_index}/{kind}/{sanitized_block_id}/{uuid}.webm` (sanitize `block_id` for path safety).
5. **Response** — `200` + JSON `{ url: string }` (public HTTPS URL). **Public read** on the object (or signed URL policy) so the extension and walkthrough tooltips can load media without extra auth.
6. **Limits** — Enforce **~4,500,000 bytes** max body (align with extension `WORKFLOW_STEP_MEDIA_MAX_BYTES`); return **413** or **400** with a clear message if exceeded.
7. **Errors** — `401` invalid token; `403` no access to workflow; `404` workflow not found; `413` payload too large.

**`GET /workflows/catalog` implementation notes:**

- Require auth; only return workflows the user is allowed to see (e.g. `published = true` for other users’ rows, plus the caller’s own workflows if `scope` includes mine).
- Filter by `hostname` or `origin` using `workflow.urlPattern.origin` and/or `workflow.runs[0].url` (parse hostname). Subdomain rules may match the extension’s behavior (e.g. `*.example.com` patterns in `urlPattern`).
- Return **404** if the route is not deployed yet (extension falls back to local-only corpus).

### Following

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| GET | `/following` | List user's following | `{ following: [...] }` or array |
| GET | `/following/:id` | Get one | `{ id, name, accounts, ... }` |
| POST | `/following` | Create | `{ id, name, ... }` |
| PATCH | `/following/:id` | Update | `{ id, name, ... }` |
| DELETE | `/following/:id` | Soft delete | 204 |

### Sidebars

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| GET | `/sidebars` | List user's sidebars | `{ sidebars: [...] }` or array |
| POST | `/sidebars/register` | Register/upsert sidebar | `{ id, window_id, sidebar_name, active_project_id }` |
| PATCH | `/sidebars/:id` | Update name/project | 204 or updated object |
| POST | `/sidebars/disconnect` | Disconnect sidebar | 204 |

**Register body:** `{ window_id, sidebar_name, active_project_id? }`

**`window_id` semantics:** The extension sends `${chrome.windows.Window.id}_sidepanel` (string). Upsert on **`(user_id, window_id)`** so reopening the side panel or switching tabs updates **`last_seen_at`** and returns the same **`id`**. Do not key on active tab id.

**Stale rows:** Older clients may have stored `windowId_tabId` values; run a periodic job (or one-off migration) to **delete or hide** rows whose `last_seen_at` is older than a chosen threshold (e.g. 30–90 days), or offer **`DELETE /sidebars/:id`** so clients can remove ghosts after you add a control.

### Social Profiles

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| GET | `/social-profiles` | List user's connected profiles | `{ profiles: [...] }` |
| POST | `/social-profiles` | Add or remove profile | `{ ok: true }` or error |

**POST body:** `{ name?, user?, id?, access_url? }`

### Upload-Post Key

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| GET | `/upload-post-key` | Get user's Upload-Post API key | `{ upload_post_api_key?, upload_post_profile_user? }` |

### Knowledge Q&A (extension)

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| GET | `/knowledge/qa` | Site-scoped approved Q&A for embed/search | Items with `question`, `answer`, `workflow` shapes (see `extension/api.js` `getKnowledgeQa`) |
| POST | `/knowledge/questions` | Create question (pending/site hint) | `{ question }` |
| POST | `/knowledge/answers` | Link workflow and/or text to question. Body: `question_id`, optional `workflow_id`, optional `text`, optional **`for_review`** (boolean, strictly `true` when sent). **`for_review` requires `workflow_id`.** Ineligible workflow without `for_review` → **400** with catalog message; with `for_review` and owner allowed → row **`status: pending`**, set **`workflow_kb_check_bypass: true`**, **`submission_kind: workflow_pending_catalog`** on success JSON. **409** duplicate `(question_id, workflow_id)`. **404** `{ error: "Workflow not found" }` when user cannot propose that workflow. |
| POST | `/knowledge/votes` | Vote on answer | Per `extension/api.js` |

Success body for `for_review` path (example fields the extension parses): `answer` (or nested shape), top-level **`submission_kind`**, **`workflow_kb_check_bypass`**, **`status`** (`pending`).

---

## CORS

Allow requests from `chrome-extension://*` origin. The extension sends requests from `chrome-extension://<extension-id>`.

---

## Cursor Prompt (copy-paste)

```
Implement the Extensible Content extension backend APIs on extensiblecontent.com.

Context:
- Auth: Whop Bearer token. Validate token, resolve user by whop_user_id, scope all data to user.
- See docs/BACKEND_IMPLEMENTATION_PROMPT.md in this repo for full spec.

Tasks:
1. Add database tables: users, projects, workflows, following, sidebars, social_profiles, user_settings, **knowledge_questions / knowledge_answers** (with **`workflow_kb_check_bypass`** and **`submission_kind`** on answers if using `for_review`; see §8).
2. Implement API routes under /api/extension/ for: has-upgraded, user/default-project, industries, platforms, monetization, projects, workflows (including **workflows/catalog** for domain-scoped published listings), **workflow-step-media** (multipart narration upload to Supabase `workflow-data`), following, sidebars, social-profiles, upload-post-key, **knowledge/qa**, **knowledge/questions**, **knowledge/answers**, **knowledge/votes**.
3. Persist workflow JSON **without stripping** `analyzed.actions[].comment` / `comment.items` (step narration blocks). See **Step narration in workflow JSON** in this doc.
4. Ensure CORS allows chrome-extension:// origin.
5. Map Whop user from token to local user; create user on first request if not exists.
```

---

## Extension API Reference

For method signatures and expected shapes, see **docs/BACKEND.md** and **extension/api.js**.
