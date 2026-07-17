# Extension API: Connected profiles and account limits

> **Extension client:** The Chrome extension still uses **`has-upgraded`** and **`social-profiles`** for Connected profile listing and caps. It **no longer** posts to Upload-Post, uses a local Upload Post API key overflow path, or calls ShotStack/social-post proxy routes. Content creation and posting live in the Whop app. Backend routes below may still serve other clients.

The Chrome extension talks to the app origin (`ExtensionConfig.APP_ORIGIN`) with a Whop Bearer token. Relevant routes for **Connected** (Upload Post accounts on the backend):

## `GET /api/extension/has-upgraded`

Authenticated. Response JSON should include:

- `has_upgraded` (boolean) and/or `pro` (boolean) for legacy clients.
- `num_accounts` (number): current count of `upload_post_accounts` for the user (same basis as the social-profiles cap).
- `max_accounts` (number): same cap as `POST /api/extension/social-profiles` (e.g. from `max_upload_post_accounts` on the user row).

If the route is not implemented (**404**), the extension treats limits conservatively: `pro: false`, `num_accounts: 0`, `max_accounts: 0` (no spare backend slots).

## `GET` / `POST /api/extension/social-profiles`

- **GET**: list connected profiles for the user.
- **POST**: add or update a profile. Must return **403** when `max_accounts <= 0` or the user is already at the account limit (server is authoritative; the extension only pre-checks).

## Extension helpers (`extension/api.js`)

- `hasUpgraded()` — merges the full JSON body with `ok` and normalized `pro`.
- `canAddConnectedProfile` / `canAddBackendConnectedProfile` — same function: `num_accounts < max_accounts` (both from has-upgraded; **not** merged list length).
- `addSocialProfileIfAllowed(num_accounts, max_accounts, body)` — backend POST pre-check.
- `appendConnectedProfileIfUnderCap` — legacy 404 path without local key (storage length vs max).

Load order for pages using `ExtensionApi`: `config.js` (or Whop auth config) → `auth-fetch.js` → `workflow-normalize.js` → `dom-utils.js` → `api.js`.

---

## Removed features (historical)

The built-in **Upload Post** client (`shared/upload-post.js`) and **ShotStack** proxy integration were removed from the extension. Content creation and social posting now live in the Whop app. Backend routes may still exist for other clients; this extension no longer calls them.

### Backend-first, then local Upload Post key (overflow) — removed

When the user was signed in and saved a new Connected profile, the extension could:

1. **POST** to `/api/extension/social-profiles` when `num_accounts < max_accounts`.
2. On **403** or no backend slot, add via **overflow**: Settings Upload Post API key, **POST** Upload Post `/uploadposts/users`, then append to `chrome.storage` with `_source: 'local_key_overflow'`.
3. On backend **404** with a local key, use the same overflow path.

That overflow path and **`getLocalApiKey`** are no longer in the extension client.
