# BSC PancakeSwap / pool (`bscPancake`)

Automated **BNB Smart Chain** transactions via a **hot wallet** configured in **Extension Settings → BSC / PancakeSwap automation**.

## References

- **Operations, WBNB path rules, `ethWei`:** [docs/BSC_AUTOMATION.md](../../docs/BSC_AUTOMATION.md)
- **Storage key and backup expectations:** [docs/BSC_WALLET_STORAGE.md](../../docs/BSC_WALLET_STORAGE.md)
- **Pinned router / MasterChef addresses:** [docs/BSC_PANCAKE_ADDRESSES.md](../../docs/BSC_PANCAKE_ADDRESSES.md)

## Background

- Message: **`CFS_BSC_POOL_EXECUTE`** (validated in `background/service-worker.js`). Optional **`gasLimit`** (21000–1800000 wei units of gas); default **1800000**.
- Implementation: **`background/bsc-evm.js`** (ethers from **`background/evm-lib.bundle.js`** — run **`npm run build:evm`** after dependency changes). **PancakeSwap Infinity** encoding uses **`background/infinity-sdk.bundle.js`** — run **`npm run build:infinity`**; the service worker loads it before **`bsc-evm.js`**.

### PancakeSwap Infinity (Liquidity Book — bins)

Pinned **Vault**, **BinPoolManager**, **BinPositionManager**, **BinQuoter**, **Distributor**, **CampaignManager**, **Permit2**: **`docs/BSC_PANCAKE_ADDRESSES.md`**. Typical flow: ERC20 **`approve`** to **Permit2**, then **`permit2Approve`** with **spender** = pinned **BinPositionManager**, then **`infiBinAddLiquidity`**. **Farm CAKE** uses **`infiFarmClaim`** (HTTP to `infinity.pancakeswap.com` + on-chain **`claim`**). Multi-hop swaps: **`infiBinPathJson`** + **`infiSwapCurrencyIn`** — examples and shape rules in **`steps/bscQuery/README.md`** (Multi-hop Infinity) and **`docs/BSC_AUTOMATION.md`**.

| Operation | Summary |
|-----------|---------|
| **`permit2Approve`** | **`token`**, **`permit2Spender`** (Bin PM), **`permit2Amount`** (uint160), **`permit2Expiration`** (uint48) |
| **`infiBinAddLiquidity`** | Pool key via **`tokenA`**, **`tokenB`**, **`infinityFee`**, **`binStep`** + **`infi*`** shape/amount/deadline fields; optional **`ethWei`** for native **currency0** |
| **`infiBinRemoveLiquidity`** | Same pool key fields; **`infiRemoveBinIds`** / **`infiRemoveShares`** (parallel comma lists); mins + deadline |
| **`infiBinModifyLiquidities`** | Raw **`infiPayload`** bytes + **`infiDeadline`** (advanced) |
| **`infiBinSwapExactInSingle`** | Pool key fields + **`infiSwapAmountIn`**, **`infiSwapAmountOutMin`**, **`infiSwapZeroForOne`**, **`infiDeadline`**; optional **`infiModifyHookData`**. Use **`bscQuery`** **`infiBinQuoteExactInputSingle`** to size **`infiSwapAmountOutMin`**. Native input (**`currency0`** when swapping **zeroForOne**): tx **`value`** = **`infiSwapAmountIn`**. |
| **`infiBinSwapExactIn`** | **`infiSwapCurrencyIn`**, **`infiBinPathJson`** (same hop shape as **`bscQuery`** **`infiBinQuoteExactInput`**), **`infiSwapAmountIn`**, **`infiSwapAmountOutMin`**, **`infiDeadline`**. Use **`infiBinQuoteExactInput`** to size **`infiSwapAmountOutMin`**. Native **in**: **`value`** = **`infiSwapAmountIn`**. |
| **`infiBinSwapExactOut`** | Same **`infiSwapCurrencyIn`** + **`infiBinPathJson`** as **`infiBinSwapExactIn`**; **`infiSwapAmountOut`**, **`infiSwapAmountInMax`**, **`infiDeadline`**. Use **`infiBinQuoteExactOutput`** to size **`infiSwapAmountInMax`**. Native **in**: **`value`** = **`infiSwapAmountInMax`**. |
| **`infiBinSwapExactOutSingle`** | Pool key + **`infiSwapAmountOut`**, **`infiSwapAmountInMax`**, **`infiSwapZeroForOne`**, **`infiDeadline`**; optional **`infiModifyHookData`**. Use **`bscQuery`** **`infiBinQuoteExactOutputSingle`** to set **`infiSwapAmountInMax`** ≥ quoted **`amountIn`**. Native input: **`value`** = **`infiSwapAmountInMax`**. |
| **`infiFarmClaim`** | Optional **`infiFarmClaimTs`**; otherwise current unix time in API path. Optional **`distributorAddress`**: must match pinned **Farming Distributor** if set (default: pin). Optional **`infiFarmClaimSkipIfNoRewards`**: when enabled, returns **`ok: true`** with **`skipped: true`** and **`skipReason`** (no **`txHash`**) if the API has no rewards or no parseable claim rows — useful for scheduled workflows. Optional **`saveInfiFarmClaimOutcomeVariable`**: when set, writes a JSON string to the row for **`infiFarmClaim` only** — either **`{ "skipped": true, "skipReason": "…" }`** or **`{ "skipped": false, "txHash": "…", "explorerUrl": "…" }`** (for **`runIf`** / later steps). |

**`saveInfiPositionTokenIdVariable`** on **`infiBinAddLiquidity`** stores the new Bin position NFT id from the receipt when emitted.

### PancakeSwap V3 (concentrated liquidity — ticks, not bins)

Pinned **SwapRouter** and **NonfungiblePositionManager** on BSC: **`docs/BSC_PANCAKE_ADDRESSES.md`**. **`approve`** may target the pinned V3 SwapRouter or NPM (or V2 router / MasterChef / Permit2 / Infinity **Vault** / Infinity **BinPositionManager** — the last two must match **the wallet’s current chain** pins, BSC **56** or Chapel **97**).

| Operation | Summary |
|-----------|---------|
| **`v3SwapExactInputSingle`** | **`tokenIn`**, **`tokenOut`**, **`v3Fee`**, **`amountIn`** (or **max** / **balance**), **`amountOutMin`**, optional **`sqrtPriceLimitX96`** |
| **`v3SwapExactOutputSingle`** | **`tokenIn`**, **`tokenOut`**, **`v3Fee`**, **`amountOut`**, **`amountInMax`** (**max** = unlimited like V2), optional sqrt limit |
| **`v3SwapExactInput`** | **`v3Path`** (`token,fee,token,...`), **`amountIn`**, **`amountOutMin`** |
| **`v3SwapExactOutput`** | **`v3Path`** (forward order; encoded reversed internally), **`amountOut`**, **`amountInMax`** |
| **`v3PositionMint`** | **`tokenA`**, **`tokenB`**, **`v3Fee`**, **`tickLower`**, **`tickUpper`**, **`amountADesired`** / **`amountBDesired`** (**max** / **balance** OK), **`amountAMin`** / **`amountBMin`** — tokens are sorted to pool **token0/token1** internally |
| **`v3PositionIncreaseLiquidity`** | **`v3PositionTokenId`**; amounts **`v3Amount0Desired`** / **`v3Amount1Desired`** refer to the position’s **token0** / **token1** (from chain); **max** / **balance** OK; **`v3Amount0Min`**, **`v3Amount1Min`** |
| **`v3PositionDecreaseLiquidity`** | **`v3PositionTokenId`**, **`v3Liquidity`** (uint128 or **max** / **balance** = full tracked liquidity), **`v3Amount0Min`**, **`v3Amount1Min`** — then run **`v3PositionCollect`** |
| **`v3PositionCollect`** | **`v3PositionTokenId`**; optional **`v3Amount0Max`** / **`v3Amount1Max`** (default max uint128) |
| **`v3PositionBurn`** | **`v3PositionTokenId`** — only after liquidity is zero and owed tokens collected |

Optional overrides **`swapRouterV3Address`** / **`positionManagerAddress`** must match the pinned addresses. **`v3PositionMint`** can set **`saveV3PositionTokenIdVariable`** to store the new NFT id parsed from the tx receipt (and **`saveTxHashVariable`** / **`saveExplorerUrlVariable`** accept `{{column}}` names like other steps).

Simple **`transferNative`** (BNB) and **`wrapBnb`**: **`ethWei`** may be **`max`** / **`balance`** (all native BNB after an RPC-based gas reserve). **`transferErc20`** ( **`amount`** `max` / `balance` = sweep that token), **WBNB** **`unwrapWbnb`** ( **`max`** / `balance` = unwrap all WBNB), and **farm** **`farmDeposit`** / **`farmWithdraw`** ( **`max`** / **`balance`**: deposit all LP in wallet for that pool, or withdraw full staked LP) use the wallet or MasterChef directly (no router for wrap/unwrap). Payable-router ops (**`swapExactETHForTokens`**, **`swapETHForExactTokens`**, fee-on-transfer BNB swap, **`addLiquidityETH`**) support the same **`ethWei`** `max` / `balance` semantics. **`addLiquidity`** / **`addLiquidityETH`**: **`amountADesired`** (and **`amountBDesired`** for two-token add) may be **`max`** / **`balance`** for that leg’s ERC20 balance. **`removeLiquidity`** / **`removeLiquidityETH`**: **`liquidity`** `max` / `balance` = full V2 LP for that pair (factory `getPair`). Legacy **`farmEnterStaking`** / **`farmLeaveStaking`** (MC v1): **`amount`** `max` / `balance` = stake all of pool 0 token from wallet, or unstake full **`userInfo(0)`** balance. **Exact-input** swaps: **`amountIn`** may be **`max`** / **`balance`** = full **`path[0]`** balance. **Exact-output** swaps: **`amountInMax`** may be **`max`** for unlimited cap (`type(uint256).max`). Supported router ops include **exact-out** token swaps (`swapTokensForExactTokens` with **`amountOut`** + **`amountInMax`**) and **token → BNB** swaps where the path **ends with WBNB** (`swapExactTokensForETH`, `swapTokensForExactETH`). For **taxed / fee-on-transfer** tokens, use the **`SupportingFeeOnTransferTokens`** swap variants (token↔token and token↔BNB). See **BSC_AUTOMATION.md** for the full matrix.

## Password-protected wallet

If you use **Encrypt on import** or **Encrypt existing plaintext wallet** in Settings, the signing key lives in **`chrome.storage.session`** only after you click **Unlock wallet**. Reloading the extension or using **Lock** clears that session — run **Unlock** again before workflow steps that send transactions.

## Row variables

Optional **`saveTxHashVariable`** and **`saveExplorerUrlVariable`** write the transaction hash and BscScan URL to the current row.
