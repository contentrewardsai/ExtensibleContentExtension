# Jupiter Prediction — Trade (Buy/Sell/Close/Claim)

Trade on Jupiter Prediction Markets. Buy YES/NO contracts on real-world events (crypto, sports, politics). Create orders, sell positions, close all positions, or claim winning payouts. Returns base64 Solana transaction to sign and submit. Requires Solana automation wallet.

## Configuration

| Field | Description |
|-------|-------------|
| **operation** | `buy`, `sell`, `closeAll`, or `claim`. |
| **marketId** | Prediction market ID. |
| **outcome** | `YES` or `NO`. |
| **amountRaw** | Amount in micro USD. |
| **limitPrice** | Optional limit price. |
| **cluster** / **rpcUrl** | Network. |

## Row variables

**saveSignatureVariable**, **saveExplorerUrlVariable** — from successful trade.

## Background

- **`CFS_JUPITER_PREDICTION_TRADE`** — `background/solana-swap.js`
- Base URL: `https://api.jup.ag/prediction/v1`
- Requires `x-api-key` (Settings → Solana).

## Testing

**steps/jupiterPredictionTrade/step-tests.js** — operation validation, outcome normalization. `npm run build:step-tests && npm run test:unit`
