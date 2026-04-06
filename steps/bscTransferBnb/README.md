# BSC transfer BNB

Send native **BNB** from the BSC automation wallet. `ethWei` is in wei (1 BNB = 1e18), or `max`/`balance` (sends balance minus gas reserve). Settings → BSC / PancakeSwap; unlock encrypted wallets once per session.

## Configuration

| Field | Description |
|-------|-------------|
| **to** | Recipient address. |
| **ethWei** | Amount in wei, or `max`/`balance`. |
| **deadline** | Optional transaction deadline (seconds). |
| **waitConfirmations** | Confirmations to wait. |
| **gasLimit** | Optional gas limit override. |

## Background

- **`CFS_BSC_POOL_EXECUTE`** with `operation: 'transferNative'` — `background/bsc-pool.js`

## Testing

**steps/bscTransferBnb/step-tests.js** — buildPayload shape, templates, edge cases. `npm run build:step-tests && npm run test:unit`
