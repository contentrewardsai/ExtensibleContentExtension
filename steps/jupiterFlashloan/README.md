# Jupiter Flashloan (Borrow → Swap → Repay)

Execute a **zero-fee flashloan** via Jupiter Lend. Borrows an asset, runs Jupiter swap leg(s) from **GET `/swap/v2/build`** (structured instructions, with versioned-tx decompile fallback), then repays — atomically. If repayment fails, the entire transaction reverts.

The default step path is **borrow A → swap A→B → swap B→A → repay A**. The return leg uses the outbound quote’s `outAmount` (`useFullBalance` resolution). **saveProfitVariable** receives `profitEstimate` = expected return amount − borrow amount (quote-based, not on-chain realized PnL).

Requires Solana automation wallet. Lend PDA seeds / discriminators are best-effort; treat mainnet runs as canary until you verify against current Jupiter Lend IDL.

## Configuration

| Field | Description |
|-------|-------------|
| **borrowMint** | SPL mint to borrow. |
| **borrowAmount** | Amount to borrow (raw). |
| **swapOutputMint** | Intermediate mint for the round-trip. |
| **slippageBps** | Slippage for swap legs. |
| **cluster** / **rpcUrl** | Network. |

## Row variables

**saveSignatureVariable**, **saveExplorerUrlVariable**, **saveProfitVariable** (`profitEstimate`).

## Background

- **`CFS_JUPITER_FLASHLOAN`** — `background/solana-swap.js`
- Lend program: `jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9`

## Testing

**steps/jupiterFlashloan/step-tests.js** — payload shape. `npm run build:step-tests && npm run test:unit`
