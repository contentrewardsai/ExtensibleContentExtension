# Extension API: Connected profiles and account limits

The Chrome extension talks to the app origin (`ExtensionConfig.APP_ORIGIN`) with a Whop Bearer token. These routes support **Connected** profile listing and caps.

## `GET /api/extension/has-upgraded`

Authenticated. Response JSON should include:

- `has_upgraded` (boolean) and/or `pro` (boolean) for legacy clients.
- `num_accounts` (number): current count of connected profiles for the user.
- `max_accounts` (number): same cap as `POST /api/extension/social-profiles`.

If the route is not implemented (**404**), the extension treats limits conservatively: `pro: false`, `num_accounts: 0`, `max_accounts: 0`.

## `GET` / `POST /api/extension/social-profiles`

- **GET**: list connected profiles for the signed-in user.
- **POST**: add or update a profile. Must return **403** when `max_accounts <= 0` or the user is already at the account limit (server is authoritative; the extension only pre-checks).

## Extension helpers (`extension/api.js`)

- `hasUpgraded()` — merges the full JSON body with `ok` and normalized `pro`.
- `canAddConnectedProfile` / `canAddBackendConnectedProfile` — `num_accounts < max_accounts` (both from has-upgraded).
- `addSocialProfileIfAllowed(num_accounts, max_accounts, body)` — backend POST pre-check.
- `appendConnectedProfileIfUnderCap` — legacy 404 path (storage length vs max).

Load order for pages using `ExtensionApi`: `config.js` (or Whop auth config) → `shared/app-origin-guard.js` → `auth-fetch.js` → `workflow-normalize.js` → `dom-utils.js` → `api.js`.
