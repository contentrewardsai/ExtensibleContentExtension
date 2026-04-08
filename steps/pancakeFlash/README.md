# pancakeFlash — PancakeSwap V3 Flash Loan (BSC)

## Overview

Execute an atomic flash loan via PancakeSwap V3's `pool.flash()` on BSC.
The step borrows tokens from a V3 pool, executes swap operations via a
deployed callback contract, then repays the loan — all within a single
transaction. If repayment fails, the entire transaction reverts.

## How It Works

1. **The step sends `CFS_PANCAKE_FLASH`** to the background service worker
2. The background constructs a transaction that calls the deployed CFS flash
   callback contract's `executeFlash()` function
3. The callback contract:
   - Calls `pool.flash()` to borrow tokens
   - In the `pancakeV3FlashCallback`, executes one or two PancakeSwap swaps
   - Repays the pool (borrowed amount + fee)
   - Sends any profit to the automation wallet

## Requirements

- **BSC automation wallet** configured in Settings → Crypto → BSC Wallet
- **Deployed CFS flash callback contract** (see `contracts/CfsFlashReceiver.sol`)
- Sufficient BNB for gas fees
- Pool must have adequate liquidity

## Parameters

| Field | Description |
|---|---|
| `poolAddress` | PancakeSwap V3 pool to flash from |
| `borrowToken0` | Borrow token0 (`true`) or token1 (`false`) |
| `borrowAmount` | Amount to borrow (in smallest units) |
| `swapRouter` | PancakeSwap swap router address (default: V3 router) |
| `swapOutputToken` | Intermediate token for arbitrage |
| `slippageBps` | Slippage tolerance in basis points |
| `callbackContract` | Address of deployed CFS flash receiver |
| `chainId` | BSC Mainnet (56) or Chapel testnet (97) |

## Variable Outputs

- `saveHashVariable` — Transaction hash
- `saveExplorerUrlVariable` — BSCScan link
- `saveProfitVariable` — Estimated profit from the flash operation

## Flash Callback Contract

The callback contract is at `contracts/CfsFlashReceiver.sol`. It must be
compiled and deployed to BSC before using this step. The contract implements
the `IPancakeV3FlashCallback` interface.

See `docs/PANCAKE_FLASH.md` for deployment instructions.
