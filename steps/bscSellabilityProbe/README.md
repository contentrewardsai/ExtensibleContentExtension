# BSC sellability probe

Small **WBNB → token → WBNB** round trip on **BSC mainnet (chain 56)** via **ParaSwap** (same stack as **`bscAggregatorSwap`**). Uses the BSC automation wallet.

## Flow

1. Read ERC-20 balance before buy.
2. **ParaSwap** swap WBNB → token (`side: SELL`, amount = spend in wei).
3. Poll balance until the bought amount appears.
4. **`allowance`** (read-only via **`CFS_BSC_QUERY`**) for automation wallet → **ParaSwap Augustus**; if it is **≥** the token amount received from the buy, **skip** the approve tx. Otherwise **`approve`** (allowlisted in **`background/bsc-evm.js`**). **`forceApprove: true`** on the message always runs approve.
5. **ParaSwap** swap token → WBNB for the received raw amount.

On success, the background result may include **`approveSkipped: true`** when step 4 did not send a transaction.

## Configuration

- **token** — BEP-20 contract address.
- **spendBnbWei** — If set, wei spent on the buy; **overrides** USD sizing.
- **spendUsdApprox** — If `spendBnbWei` is empty, wei is derived from CoinGecko **BNB/USD** (default `1`).

## Background message

- **`CFS_BSC_SELLABILITY_PROBE`** — **`background/bsc-sellability-probe.js`**.

## Tests

**`steps/bscSellabilityProbe/step-tests.js`** — payload shape; `npm run build:step-tests && npm run test:unit`.

## Limitations

Not a honeypot oracle. Fee-on-transfer tokens can skew balance deltas. Third-party APIs and RPCs may rate-limit.
