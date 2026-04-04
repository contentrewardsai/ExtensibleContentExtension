# Checklist: new HTTPS hosts for crypto / Pulse features

Chrome MV3 extensions only `fetch` origins allowed in **`manifest.json`** `host_permissions` (and related extension pages CSP). Adding a venue or API without updating the manifest causes **silent or opaque network failures** in the service worker.

## Before merging code that calls a new origin

1. **`manifest.json`**
   - Add a **`host_permissions`** entry for the full origin pattern you need (e.g. `https://api.example.com/*`).
   - Avoid `<all_urls>` broadening unless product requires it; prefer explicit hosts.

2. **Handler allowlists**
   - Some modules only permit specific hosts (e.g. Aster user-stream WebSocket hosts, offscreen documents). Grep for the URL string and any **`startsWith` / hostname checks** in:
     - `background/service-worker.js`
     - `background/aster-futures.js`
     - `background/bsc-evm.js`, `background/bsc-watch.js`
     - `background/solana-swap.js`, `background/solana-watch.js`
     - `offscreen/*.js`

3. **Documentation**
   - Mention the host in the relevant automation doc (**docs/SOLANA_AUTOMATION.md**, **docs/BSC_AUTOMATION.md**, **docs/INTEGRATIONS.md**).

4. **Optional guard script**
   - CI runs **`npm run test:crypto-manifest-hosts`** (`scripts/verify-crypto-manifest-hosts.cjs`) to keep explicit **`host_permissions`** entries for major chain/crypto APIs. When you add a **new** required origin, extend the **`REQUIRED`** list in that script.
   - For module wiring, add or extend a **`scripts/verify-*-wired.cjs`** assertion (see **`verify-bsc-infinity-wired.cjs`**, **`verify-aster-futures-wired.cjs`**).

5. **Privacy / review**
   - Confirm the endpoint is required for user-visible functionality; document what data is sent (no secrets in URLs).

## Related

- **docs/CRYPTO_VENDOR_API_DRIFT.md** — when vendors move domains or paths.
- **docs/EXTENSION_API_REQUIREMENTS.md** — backend routes (non-chain).
