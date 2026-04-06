# Jupiter Flashloan (Borrow → Swap → Repay)

Execute a **zero-fee flashloan** via Jupiter Lend. Borrows an asset, executes a Jupiter swap (arbitrage or collateral swap), then repays — all atomically in one transaction. If repayment fails, the entire transaction reverts. Uses the `@jup-ag/lend/flashloan` SDK pattern. Requires Solana automation wallet.

## Configuration

| Field | Description |
|-------|-------------|
| **borrowMint** | SPL mint to borrow. |
| **borrowAmountRaw** | Amount to borrow (raw, smallest units). |
| **swapInputMint** / **swapOutputMint** | Swap leg mints. |
| **slippageBps** | Slippage tolerance for the swap. |
| **cluster** / **rpcUrl** | Network. |

## Row variables

**saveSignatureVariable**, **saveExplorerUrlVariable**, **saveProfitVariable** — from successful flashloan execution.

## Background

- **`CFS_JUPITER_FLASHLOAN`** — `background/solana-swap.js`
- Lend program: `jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9`

## Testing

**steps/jupiterFlashloan/step-tests.js** — payload shape, borrow/repay invariants. `npm run build:step-tests && npm run test:unit`
