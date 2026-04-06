# Jupiter Earn (Deposit/Withdraw)

Deposit to or withdraw from **Jupiter Earn** vaults via the Lend API. Earn yield on deposited assets. Supports both deposit and withdraw operations. Requires Solana automation wallet.

## Configuration

| Field | Description |
|-------|-------------|
| **operation** | `deposit` or `withdraw`. |
| **mint** | SPL token mint for the vault. |
| **amountRaw** | Amount in smallest units (integer string; supports `{{vars}}`). |
| **cluster** / **rpcUrl** | Network. |

## Row variables

**saveSignatureVariable**, **saveExplorerUrlVariable** — from successful deposit/withdraw.

## Background

- **`CFS_JUPITER_EARN`** — `background/solana-swap.js`

## Testing

**steps/jupiterEarn/step-tests.js** — operation validation, payload shape. `npm run build:step-tests && npm run test:unit`
