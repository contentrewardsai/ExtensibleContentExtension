# Extension API: Connected profiles and account limits

The Chrome extension talks to the app origin (`ExtensionConfig.APP_ORIGIN`) with a Whop Bearer token. Relevant routes for **Connected** (Upload Post accounts):

## `GET /api/extension/has-upgraded`

Authenticated. Response JSON should include:

- `has_upgraded` (boolean) and/or `pro` (boolean) for legacy clients.
- `num_accounts` (number): current count of `upload_post_accounts` for the user (same basis as the social-profiles cap).
- `max_accounts` (number): same cap as `POST /api/extension/social-profiles` (e.g. from `max_upload_post_accounts` on the user row).

If the route is not implemented (**404**), the extension treats limits conservatively: `pro: false`, `num_accounts: 0`, `max_accounts: 0` (no spare backend slots).

## `GET` / `POST /api/extension/social-profiles`

- **GET**: list connected profiles for the user.
- **POST**: add or update a profile. Must return **403** when `max_accounts <= 0` or the user is already at the account limit (server is authoritative; the extension only pre-checks).

## Backend-first, then local Upload Post key (overflow)

When the user is **signed in** and saves a new Connected profile:

1. If `num_accounts < max_accounts` and `max_accounts > 0`, the extension **POSTs** to `/api/extension/social-profiles` first (pre-check uses **num_accounts**, not merged UI list length).
2. If POST returns **403** (at limit) or there is **no backend slot** (`num_accounts >= max_accounts` or `max_accounts === 0`), the extension may add via **overflow**: **Settings** Upload Post API key (`getLocalApiKey`), **POST** Upload Post `/uploadposts/users` (`createUserProfileWithKey`), then append a row to `connectedProfiles` in `chrome.storage` with `_source: 'local_key_overflow'`.
3. If the backend returns **404** and the user has a local key, the same overflow path is used instead of capped local-only storage.

Upload Post plan limits still apply on their API. Not signed in: Connected add remains “sign in required”; local-key-only listing is unchanged.

## Extension helpers (`extension/api.js`)

- `hasUpgraded()` — merges the full JSON body with `ok` and normalized `pro`.
- `canAddConnectedProfile` / `canAddBackendConnectedProfile` — same function: `num_accounts < max_accounts` (both from has-upgraded; **not** merged list length).
- `addSocialProfileIfAllowed(num_accounts, max_accounts, body)` — backend POST pre-check.
- `appendConnectedProfileIfUnderCap` — legacy 404 path without local key (storage length vs max).
- `appendConnectedProfileOverflow` — append overflow row; dedupes by `_username` / `username` / `name`.

## Upload Post (`shared/upload-post.js`)

- `createUserProfileWithKey(apiKey, username)` — POST `/uploadposts/users` per OpenAPI.

Load order for pages using `ExtensionApi`: `config.js` (or Whop auth config) then `api.js`.
