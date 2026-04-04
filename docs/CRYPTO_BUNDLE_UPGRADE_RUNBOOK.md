# Runbook: upgrading chain SDK / npm dependencies

Use this checklist when **`package.json`** bumps any package that feeds a **prebuilt browser bundle** under `background/` (ethers, Solana web3, Raydium, Pump, Meteora, Pancake Infinity, etc.). CI expects committed bundles to match **`npm run build:chain-bundles`** output (see `.github/workflows/extension-checks.yml`).

## 1. Bump and install

```bash
npm install
```

## 2. Rebuild bundles (order matters for `build:chain-bundles`)

From repo root:

```bash
npm run build:evm
npm run build:solana
npm run build:pump
npm run build:raydium
npm run build:meteora
npm run build:meteora-cpamm
npm run build:infinity
```

Or one shot:

```bash
npm run build:chain-bundles
```

## 3. Automated checks (run all that apply)

```bash
npm run test:evm-bundle
npm run test:solana
npm run test:infinity-bundle
npm run test:bsc-infinity-wired
npm run test:infi-bin-path-json
npm run validate:steps
npm run test:unit
```

If you touched Apify shared helpers:

```bash
npm run test:apify
```

## 4. Diff and commit bundles

```bash
git diff --stat background/*.bundle.js
```

Commit updated `background/evm-lib.bundle.js`, `solana-lib.bundle.js`, `pump-sdk.bundle.js`, `raydium-sdk.bundle.js`, `meteora-dlmm.bundle.js`, `meteora-cpamm.bundle.js`, `infinity-sdk.bundle.js` when they change.

## 5. Manual smoke (extension)

- Reload the unpacked extension.
- **Settings → Solana automation:** unlock flow, RPC field, Jupiter key (if used).
- **Settings → BSC:** unlock, one read-only **`bscQuery`** or small testnet op if you use Chapel.
- Run one workflow step per affected venue (e.g. **`solanaReadBalances`**, **`raydiumClmmQuoteBaseIn`**, **`bscQuery`** `nativeBalance`) before shipping.

## 6. When builds fail

- **esbuild / alias errors:** check `scripts/*-bundle-entry.js` and peer dependency versions.
- **`patch-bundle-pow-helper`:** still required after esbuild for known bigint helpers; do not skip.
- **Raydium region / availability:** SDK may return `availability` flags; not a bundle bug.

## Related docs

- **docs/SOLANA_AUTOMATION.md** — Solana steps and `npm run build:solana`.
- **docs/BSC_AUTOMATION.md** — `build:evm`, `build:infinity`.
