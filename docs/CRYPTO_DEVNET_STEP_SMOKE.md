# Per-step devnet smoke (`devnet-smoke.js`)

Optional **colocated** hooks for “real devnet tx” checks from the side panel, without duplicating the full workflow runner.

## Convention

- **File:** `steps/{stepId}/devnet-smoke.js` (optional).
- **Load order:** After `steps/{stepId}/sidepanel.js` — see **`steps/sidepanel-loader.js`** (extension manifest) and the **`cfs-steps-ready`** branch in **`sidepanel/sidepanel.js`** that loads scripts from a **project folder** (same order: `sidepanel.js` then `devnet-smoke.js`).
- **Registration:** Assign to **`window.__CFS_stepDevnetSmoke[stepId]`** an object with **`run(onDone)`**, where **`onDone({ ok, error?, signature? })`** is called when finished.
- **Safety:** Only **devnet** (or documented fork RPC). Never default to mainnet. Prefer a **confirm** dialog before sending (the side panel already confirms for **`[data-cfs-devnet-test]`** buttons).

## Side panel UI

Steps that support a button should render a control with **`data-cfs-devnet-test="{stepId}"`** (and optional **`data-testid`** for Playwright). Example: **`steps/solanaTransferSol/sidepanel.js`** — **Test on devnet (1 lamport)**.

Click handling is centralized in **`sidepanel/sidepanel.js`** (delegated listener on the steps list).

## Playwright

- **UI path:** Open workflow, add step, click the devnet button (accept confirm). Stable but slower.
- **Message path:** `sendExtensionMessage` with the same payload the handler would send; faster but can **drift** from **`handler.js`** unless you share a **`buildPayload`** helper (see **[CRYPTO_CFS_PAYLOAD_CHECKLIST.md](./CRYPTO_CFS_PAYLOAD_CHECKLIST.md)**).

Shared numeric defaults for message-based E2E may live in **`test/e2e/crypto-step-fixtures.mjs`**.

## Scope

Use only where **devnet** behavior matches production enough to be useful (transfers, wrap/unwrap, simple SPL). For **mainnet-only** venues (many Jupiter/Raydium/Pump/BSC Pancake flows), omit the button or keep it disabled with a short explanation in the step hint.
