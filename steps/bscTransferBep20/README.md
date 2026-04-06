# BSC transfer BEP-20

ERC-20 token transfer from the BSC automation wallet. Amount is in smallest units (uint256 string) or `max`/`balance`. Settings → BSC / PancakeSwap; unlock encrypted wallets once per session.

## Configuration

| Field | Description |
|-------|-------------|
| **token** | BEP-20 token contract address. |
| **to** | Recipient address. |
| **amount** | Amount in smallest units, or `max`/`balance`. |
| **deadline** | Optional transaction deadline (seconds). |
| **waitConfirmations** | Confirmations to wait. |
| **gasLimit** | Optional gas limit override. |

## Background

- **`CFS_BSC_POOL_EXECUTE`** with `operation: 'transferErc20'` — `background/bsc-pool.js`

## Testing

**steps/bscTransferBep20/step-tests.js** — buildPayload shape, template resolution. `npm run build:step-tests && npm run test:unit`
