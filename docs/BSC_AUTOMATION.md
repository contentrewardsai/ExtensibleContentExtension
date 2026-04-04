# BSC / PancakeSwap automation (GitHub-safe)

The extension can run **automated** BNB Smart Chain transactions using a **hot wallet** in **`chrome.storage.local`** (configure under **Settings → BSC / PancakeSwap automation**).

## Workflow steps

- **`bscTransferBnb`** / **`bscTransferBep20`** — thin aliases for **`bscPancake`** operations **`transferNative`** and **`transferErc20`** (same `CFS_BSC_POOL_EXECUTE`); smaller step forms for wallet-centric sends.
- **`bscAggregatorSwap`** — `CFS_BSC_POOL_EXECUTE` with operation **`paraswapSwap`**: ParaSwap price + transaction API on **BSC mainnet (chain 56)** only; multi-DEX route. Fields: **`srcToken`** / **`destToken`** (`native` or WBNB or `0x…`), **`side`** `SELL` (exact in) or `BUY` (exact out), **`amount`**, optional **`slippage`** (ParaSwap units, default 150).
- **`bscSellabilityProbe`** — **`CFS_BSC_SELLABILITY_PROBE`** (**`background/bsc-sellability-probe.js`**): small **WBNB → token → WBNB** round trip via ParaSwap; **`spendBnbWei`** or **`spendUsdApprox`** (CoinGecko BNB/USD); **`approve`** to **ParaSwap Augustus** is allowlisted in **`bsc-evm.js`**, but the probe **skips approve** when **`allowance`** already covers the sell amount (unless **`forceApprove`**). See **steps/bscSellabilityProbe/README.md**.
- **`bscPancake`** — `CFS_BSC_POOL_EXECUTE` → `background/bsc-evm.js` (signing; requires `background/evm-lib.bundle.js` from `npm run build:evm` and **`background/infinity-sdk.bundle.js`** from `npm run build:infinity` before `bsc-evm.js`): native BNB send, ERC20 `transfer`, **WBNB wrap/unwrap** (`deposit` / `withdraw` on pinned WBNB), pinned PancakeSwap **V2** router, **V3** SwapRouter (exact in/out single and multi-hop via packed `v3Path`), **V3** NonfungiblePositionManager (**tick ranges**): mint / increase / decrease / collect / burn; **PancakeSwap Infinity Liquidity Book**: **`permit2Approve`**, **`infiBinAddLiquidity`**, **`infiBinRemoveLiquidity`**, **`infiBinSwapExactInSingle`**, **`infiBinSwapExactOutSingle`**, **`infiBinModifyLiquidities`**, **`infiFarmClaim`** (Merkle API + Distributor); MasterChef. **Approve** spender may be pinned V2 router, **V3 SwapRouter**, **V3 NPM**, MasterChef, **Permit2**, **Infinity Vault**, or **Infinity BinPositionManager**. Infinity **`binPoolManagerAddress`** / **`binPositionManagerAddress`** (optional) match **`bscQuery`**: empty uses pins; if set, must equal the pinned address for that chain. Optional **`saveV3PositionTokenIdVariable`** / **`saveInfiPositionTokenIdVariable`** store minted NFT ids from receipts.
- **`bscQuery`** — `CFS_BSC_QUERY` → same module: **read-only** JSON-RPC using the **saved BSC RPC URL** (no tx, no unlock for encrypted wallets). Operations: `rpcInfo`, **`blockByTag`**, `transactionCount`, **`transactionReceipt`** (poll `bscPancake` tx hashes; optional **`includeLogs: true`** returns **`logs`** for receipt parsing), **`farmPendingCake`** / **`farmUserInfo`** / **`farmPoolInfo`** / **`farmPoolLength`** (pinned MasterChef v1/v2), `automationWalletAddress`, `nativeBalance`, `erc20Balance`, `erc20Metadata`, **`erc20TotalSupply`**, `allowance`, `pairReserves`, **`routerAmountsOut`** / **`routerAmountsIn`** (for **`routerAmountsOut`**, **`amountIn`** may be **`max`** / **`balance`** = **`path[0]`** balance of optional **`holder`**, else automation address), **`v2FactoryGetPair`** (pinned Pancake V2 factory), **`v3PoolState`** / **`v3FactoryGetPool`** / **`v3QuoterExactInputSingle`** / **`v3QuoterExactOutputSingle`** / **`v3QuoterExactInput`** / **`v3QuoterExactOutput`** (V3 exact-input quotes: **`amountIn`** may be **`max`** / **`balance`** for **`tokenIn`** or first **`v3Path`** token), **`v3NpmPosition`** (read Pancake V3 NPM **`positions(tokenId)`** + **`ownerOf`**; **tick-based** concentrated liquidity), **PancakeSwap Infinity Liquidity Book**: **`infiBinPoolId`** (SDK **`getPoolId`**), **`infiDecodeBinParameters`**, **`infiBinPoolKeyFromId`**, **`infiBinSlot0`**, **`infiBinGetBin`**, **`infiBinGetBinsRange`** (max 64 bins), **`infiBinGetPosition`**, **`infiBinNextNonEmptyBin`**, **`infiBinNpmPosition`** (Bin **`positions(tokenId)`** + **`ownerOf`**), **`infiBinQuoteExactInputSingle`** / **`infiBinQuoteExactInput`** (multi-hop exact **in**: **`infiQuoteCurrencyIn`** + **`infiBinPathJson`** + **`infiQuoteExactAmount`** as amount in) / **`infiBinQuoteExactOutput`** (multi-hop exact **out**: same path fields; **`infiQuoteExactAmount`** = desired **out**) / **`infiBinQuoteExactOutputSingle`** (pinned **BinQuoter**; single-pool: pool key + **`infiQuoteExactAmount`** uint128 + **`infiQuoteZeroForOne`**), **`infiFarmCampaignLength`** / **`infiFarmCampaignInfo`** (pinned **CampaignManager** on **BSC mainnet** only — empty pin on Chapel), **`isContract`**. Chain **56** or **97** for Infinity reads; farm campaign queries require mainnet pin. See **steps/bscQuery/README.md**.
- **`bscWatchRefresh`** / **`bscWatchReadActivity`** — Pulse **Following** BSC watch: the service worker polls **BscScan’s public API** (`txlist` plus **`tokentx`** for ERC-20 transfer lines) using a **BscScan API key** (`cfs_bscscan_api_key`). **Following automation** (optional) on **mainnet** classifies **outgoing** txs and mirrors Solana-style sizing (**proportional** / **fixed_token** / **fixed_usd** with CoinGecko USD hints where applicable). Supported **venues** (see **`background/bsc-watch.js`**): **Pancake V2** router swaps (path replay via V2 router); **Pancake V3** SwapRouter **`exactInput` / `exactInputSingle` / `exactOutput` / `exactOutputSingle`** and outer **`multicall`** bundles of those selectors; **MasterChef v1/v2** **`deposit` / `withdraw`** and v1 **`enterStaking` / `leaveStaking`** (**`farm_like`** activity rows; **fixed_usd** not supported for farm automation); **ParaSwap** on BSC (Augustus + **TokenTransferProxy** pinned in **`PARASWAP_BSC_EXECUTORS`** in **`bsc-watch.js`**; extend if Velora deploys new contracts) and **Pancake Infinity BinPositionManager** — for the last two, the worker fetches an **`includeLogs`** **transaction receipt** and infers **sold vs bought** ERC-20 legs (plus **native BNB** **`value`**) against your configured **quote token** (**workflow.followingAutomation.quoteMint**, default **WBNB**). **Following automation execution** uses **`v3SwapExactInput`** / **`v3SwapExactInputSingle`** for V3, **`paraswapSwap`** (fresh ParaSwap price + tx API; **not** calldata replay) for **aggregator** and **infinity** rows, and **`farmDeposit` / `farmWithdraw` / `farmEnterStaking` / `farmLeaveStaking`** for farms. **Chapel** testnet: watch only; automation stays disabled. Policy comes from **`workflow.followingAutomation`** when an always-on workflow is bound via **`selectFollowingAccount`**; **global token blocklist** uses **`cfsFollowingAutomationGlobal.globalTokenBlocklist.evm`**. **Price drift / tx age** use **`watchActivityFilterPriceDrift`** / **`watchActivityFilterTxAge`** in the headless pipeline (`background/following-automation-runner.js`): drift compares **V2 router** quotes, **V3 QuoterV2**, or **ParaSwap `/prices`** for **aggregator** / **infinity** rows. **Never put the API key in workflow JSON.** Automatic BSC polling uses the same **workflow / always-on** gate as Solana (`shared/cfs-always-on-automation.js`); see **docs/FOLLOWING_AUTOMATION_PIPELINE.md** and **docs/SOLANA_AUTOMATION.md**. Activity JSON includes **`venue`**, **`v3Path`** (V3), and **`farmOp` / `farmPid`** (farm).

### Manual multi-step workflows (tab runs)

Use **`bscWatchReadActivity`** → **`runIf`** / filters → **`bscPancake`**, **`bscAggregatorSwap`**, or headless-only drift/age steps as needed. **`bscWatchReadActivity`** exposes **`venue`**, **`v3Path`**, **`farm_like`** fields on recent rows for branching.

### `bscPancake` operations (router = pinned PancakeSwap V2 unless noted)

| Operation | Purpose |
|-----------|---------|
| `transferNative` | Send **native BNB** — **`to`**, **`ethWei`** (positive wei) or **`max`** / **`balance`** = all BNB left after an **estimated gas reserve** (fee from RPC × gas hint × 1.3, floor ~0.0003 BNB); plain `sendTransaction` (not via router) |
| `transferErc20` | ERC20 **`transfer`** — **`token`**, **`to`**, **`amount`** (smallest units, positive) or **`max`** / **`balance`** to send the wallet’s **full** on-chain balance of that token (read at tx time; fee-on-transfer tokens may leave dust or revert) |
| `wrapBnb` | **`deposit()`** on pinned **WBNB** — **`ethWei`** (wei) or **`max`** / **`balance`** after gas reserve; receive WBNB 1:1 for wrapped amount |
| `unwrapWbnb` | **`withdraw(amount)`** on pinned **WBNB** — **`amount`** in WBNB smallest units, or **`max`** / **`balance`** to unwrap the wallet’s full **WBNB** balance |
| `approve` | ERC20 `approve` for router, MasterChef v1/v2, Permit2, Infinity **Vault**, or Infinity **BinPositionManager** — Infinity spenders must match **this chain’s** pins (BSC **56** vs Chapel **97**), not both networks at once |
| `swapExactTokensForTokens` | ERC20 → ERC20 via path; **`amountIn`** may be **`max`** / **`balance`** (sell full **`path[0]`** balance at tx time) |
| `swapTokensForExactTokens` | Exact ERC20 out; **`amountOut`**, **`amountInMax`** (max input willing to pay, or **`max`** = unlimited / `type(uint256).max`); path |
| `swapExactTokensForETH` | ERC20 → native BNB; **`path` must end with WBNB**; **`amountIn`** (or **`max`** / **`balance`** for **`path[0]`**), **`amountOutMin`** (min BNB wei) |
| `swapTokensForExactETH` | Tokens → exact BNB wei out; **`amountOut`** (BNB wei), **`amountInMax`** (or **`max`** for unlimited); path ends WBNB |
| `swapExactETHForTokens` | Native **BNB** → tokens; **`path` must start with WBNB**; **`ethWei`** wei sent, or **`max`** / **`balance`** (after gas reserve) |
| `swapETHForExactTokens` | BNB → exact token out; **`amountOut`**, **`ethWei`** (max BNB in wei, or **`max`** / **`balance`** after reserve); path starts WBNB |
| `swapExactTokensForTokensSupportingFeeOnTransferTokens` | Same inputs as `swapExactTokensForTokens` (including **`amountIn`** **`max`** / **`balance`**); for **fee-on-transfer** / taxed ERC20s along the path |
| `swapExactETHForTokensSupportingFeeOnTransferTokens` | Same as `swapExactETHForTokens` ( **`ethWei`** or **`max`** / **`balance`**, **`amountOutMin`**, path starts WBNB ); fee-on-transfer safe |
| `swapExactTokensForETHSupportingFeeOnTransferTokens` | Same as `swapExactTokensForETH` ( **`amountIn`** or **`max`** / **`balance`**, **`amountOutMin`**, path ends WBNB ); fee-on-transfer safe |
| `addLiquidity` | Two ERC20s — **`amountADesired`** / **`amountBDesired`** each may be **`max`** / **`balance`** (full wallet balance of **`tokenA`** / **`tokenB`** at tx time); mins stay explicit uint256 |
| `addLiquidityETH` | **`token`** + BNB; **`amountADesired`** may be **`max`** / **`balance`** (full **`token`** balance); **`amountAMin`**, **`amountBMin`** (BNB min), **`ethWei`** (wei or **`max`** / **`balance`** after gas reserve) |
| `removeLiquidity` | Two ERC20s — **`liquidity`** LP amount or **`max`** / **`balance`** (full **V2 LP** balance for that pair via pinned factory `getPair`) |
| `removeLiquidityETH` | **`token`**, **`liquidity`** (or **`max`** / **`balance`** for full **token–WBNB** V2 LP), **`amountAMin`** (token min), **`amountBMin`** (BNB min) |
| `farmDeposit` / `farmWithdraw` / `farmHarvest` | MasterChef v2 (default) — **`pid`**; **`amount`** for deposit/withdraw is LP wei, or **`max`** / **`balance`** (deposit = full **LP in wallet** for that pool’s token; withdraw = full **staked** amount in that pool); harvest = `deposit(pid,0)` |
| `farmEnterStaking` / `farmLeaveStaking` | Legacy MasterChef **v1** only — **`amount`** may be **`max`** / **`balance`**: enter = full wallet balance of **pool 0 stake token** (CAKE on mainnet v1); leave = full **`userInfo(0)`** staked amount |
| `permit2Approve` | **Permit2** `approve` — **`token`**, **`permit2Spender`** (pinned **BinPositionManager**), **`permit2Amount`** (uint160), **`permit2Expiration`** (uint48) |
| `infiBinAddLiquidity` | **Infinity** add bins — **`tokenA`**, **`tokenB`**, **`infinityFee`**, **`binStep`**, optional hooks JSON; optional **`binPoolManagerAddress`** (pin when empty); **`infiPoolInitialized`**, **`infiLiquidityShape`** (Spot/Curve/BidAsk), **`infiActiveIdDesired`**, **`infiIdSlippage`**, **`infiLowerBinId`**, **`infiUpperBinId`**, **`infiAmount0`**, **`infiAmount1`**, **`infiAmount0Max`**, **`infiAmount1Max`**, **`infiDeadline`** (unix sec); optional **`ethWei`** for native currency0 pools; SDK builds calldata for **BinPositionManager** |
| `infiBinRemoveLiquidity` | **Infinity** remove — same pool key fields as add (including optional **`binPoolManagerAddress`**); **`infiAmount0Min`**, **`infiAmount1Min`**, **`infiRemoveBinIds`** (comma uint24), **`infiRemoveShares`** (comma uint256), **`infiDeadline`** |
| `infiBinModifyLiquidities` | **Advanced:** **`infiPayload`** (inner bytes for `modifyLiquidities`), **`infiDeadline`**; optional **`ethWei`** |
| `infiBinSwapExactInSingle` | **Infinity Bin** single-pool exact-in swap — same pool key fields as add (including optional **`binPoolManagerAddress`**); **`infiSwapZeroForOne`**, **`infiSwapAmountIn`**, **`infiSwapAmountOutMin`** (uint128; **`0`** = no minimum), **`infiDeadline`**; optional **`infiModifyHookData`**. ERC20 input requires **Permit2** allowance to **BinPositionManager**; if **input currency** is native (**`currency0`** when **`infiSwapZeroForOne`**), the tx **`value`** is **`infiSwapAmountIn`** wei. |
| `infiBinSwapExactIn` | **Infinity Bin** multi-hop exact-in — **`infiSwapCurrencyIn`** (starting token; native = zero address), **`infiBinPathJson`** (JSON array of hops, each **`intermediateCurrency`**, **`infinityFee`**, **`binStep`**, optional **`infinityHooks`**, **`infinityHooksRegistrationJson`**, **`hookData`**), **`infiSwapAmountIn`**, **`infiSwapAmountOutMin`**, **`infiDeadline`**; optional **`binPoolManagerAddress`** / **`binPositionManagerAddress`** (pins when empty). **Permit2** for ERC20 in; native **in** sets **`value`** = **`infiSwapAmountIn`**. Pair with **`bscQuery`** **`infiBinQuoteExactInput`**. |
| `infiBinSwapExactOut` | **Infinity Bin** multi-hop exact-out — same **`infiSwapCurrencyIn`** + **`infiBinPathJson`** as exact-in (route **in** → **out**); **`infiSwapAmountOut`**, **`infiSwapAmountInMax`**, **`infiDeadline`**. Native **input**: **`value`** = **`infiSwapAmountInMax`**. Pair with **`bscQuery`** **`infiBinQuoteExactOutput`**. |
| `infiBinSwapExactOutSingle` | **Infinity Bin** single-pool exact-out swap — same pool key as add (including optional **`binPoolManagerAddress`**) + **`infiSwapZeroForOne`**; **`infiSwapAmountOut`** (uint128), **`infiSwapAmountInMax`** (uint128 cap on input; use **`340282366920938463463374607431768211455`** for max uint128), **`infiDeadline`**; optional **`infiModifyHookData`**. Native **input**: tx **`value`** = **`infiSwapAmountInMax`** wei (worst-case spend cap). Pair with **`bscQuery`** **`infiBinQuoteExactOutputSingle`** to size **`infiSwapAmountInMax`**. |
| `infiFarmClaim` | **Infinity farm CAKE** — optional **`infiFarmClaimTs`** (unix sec for API URL); fetches proofs then **`claim`** on pinned **Distributor** (optional **`distributorAddress`** must match that pin when set). Optional **`infiFarmClaimSkipIfNoRewards`**: if true, success with **`skipped: true`** (no transaction) when there is nothing to claim instead of throwing. Optional **`saveInfiFarmClaimOutcomeVariable`**: JSON snapshot of skip vs submitted (**`txHash`** / **`explorerUrl`**) for workflow branching. |

**Multi-hop `infiBinPathJson` (shape):** JSON array (1–8 hops). Each hop is an object with **`intermediateCurrency`** (next token `0x…` along the route), **`infinityFee`** (uint24 string), **`binStep`** (1–100 string). Optional per hop: **`infinityHooks`**, **`infinityHooksRegistrationJson`** (JSON object string), **`hookData`** (hex). **`infiSwapCurrencyIn`** / **`infiQuoteCurrencyIn`** is the **first** token; the last hop’s **`intermediateCurrency`** is the **final** token. Example two-hop (USDT → WBNB illustrative only — verify pools exist before use):

```json
[
  {
    "intermediateCurrency": "0x55d398326f99059fF775485246999027B3197955",
    "infinityFee": "3000",
    "binStep": "10"
  },
  {
    "intermediateCurrency": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    "infinityFee": "500",
    "binStep": "1"
  }
]
```

Local shape check (no RPC): **`npm run test:infi-bin-path-json`**. See **`steps/bscQuery/README.md`** for query vs execute field names.

**WBNB** on BSC mainnet: `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` (also in `docs/BSC_PANCAKE_ADDRESSES.md`).

**`gasLimit` (optional)** on `CFS_BSC_POOL_EXECUTE` / **`bscPancake`**: decimal string; **21000** … **1800000**. If omitted, the extension uses **1800000** (same previous default). Lower caps reduce the buffer for complex router swaps — set explicitly only when you know the op fits. **`ethWei`** **`max`** / **`balance`** gas reserve uses `min(your gasLimit, internal hint)` so a smaller cap tightens the reserved BNB estimate.

Amounts are **uint256 strings** in the token’s smallest units unless noted. For **`transferErc20`**, **`unwrapWbnb`**, **`farmDeposit`**, **`farmWithdraw`**, **`farmEnterStaking`**, **`farmLeaveStaking`**, **`removeLiquidity`**, and **`removeLiquidityETH`**, the relevant **`amount`** / **`liquidity`** field may be **`max`** or **`balance`** (case-insensitive) to use an on-chain snapshot as described in the table above. For **exact-input** router swaps (`swapExactTokensForTokens`, `swapExactTokensForETH`, and the **SupportingFeeOnTransfer** token-input variants), **`amountIn`** may be **`max`** / **`balance`** = full wallet balance of **`path[0]`** (the sold token). For **exact-output** swaps (`swapTokensForExactTokens`, `swapTokensForExactETH`), **`amountInMax`** may be **`max`** (only this keyword) to set the router’s maximum input to **`type(uint256).max`** — use with care. For **`transferNative`**, **`wrapBnb`**, **`swapExactETHForTokens`**, **`swapETHForExactTokens`**, **`swapExactETHForTokensSupportingFeeOnTransferTokens`**, and **`addLiquidityETH`**, **`ethWei`** is normally **wei** (1 BNB = 1e18 wei), or **`max`** / **`balance`** to send **`nativeBalance − reserve`**, where **reserve** ≈ `getFeeData().gasPrice (or maxFeePerGas) × operation-specific gas units × 1.3`, with a small floor so low-RPC-price estimates do not under-reserve. Heavily loaded networks or EIP-1559 quirks can still cause “out of gas” or underpayment if the wallet is nearly empty — leave headroom or use an explicit **`ethWei`**. For **`addLiquidity`** and **`addLiquidityETH`**, **`amountADesired`** (and **`amountBDesired`** on **`addLiquidity`**) may be **`max`** / **`balance`** like **`transferErc20`** for the corresponding token; the router still enforces **`amount*Min`** — set mins to **0** only if you accept any slippage.

## Maintenance: ParaSwap / Velora executors (quarterly)

Following copy and **`bscAggregatorSwap`** / sellability flows depend on **pinned ParaSwap-related contract addresses** on BSC. If Velora/ParaSwap deploys new **TokenTransferProxy** or **Augustus** executors, update:

- **`PARASWAP_BSC_EXECUTORS`** in **`background/bsc-watch.js`** (classification + receipt parsing).
- Matching allowlists / spender pins in **`background/bsc-evm.js`** and **docs/BSC_PANCAKE_ADDRESSES.md** as applicable.

Review at least **quarterly** or when copy/swap steps fail with unknown `to` on aggregator routes. See **docs/CRYPTO_VENDOR_API_DRIFT.md** for an issue template.

## Do not commit

- Private keys, mnemonics, or filled `config/bsc-wallet.local.json`
- Workflow JSON that embeds secrets (only public addresses and amount variables)

## Storage

See **`docs/BSC_WALLET_STORAGE.md`** for `chrome.storage.local` / session keys, encryption, and legacy migration from **`cfs_bsc_wallet_v1`**.

**BscScan API key (`cfs_bscscan_api_key`):** optional; used only for **Following → BSC watch** (BscScan `txlist`). Obtain a free key at [https://bscscan.com/apis](https://bscscan.com/apis). Same browser profile as other BSC settings.

**Password-encrypted wallet:** signing uses the same session unlock model as Solana automation. After extension reload or **Lock**, open **Settings → BSC / PancakeSwap** and **Unlock wallet** before `CFS_BSC_POOL_EXECUTE` can submit transactions.

## Build / CI

- `npm run build:evm` — regenerates `background/evm-lib.bundle.js` after `npm install`.
- `npm run build:infinity` — regenerates `background/infinity-sdk.bundle.js` (`@pancakeswap/infinity-sdk` + chains id); commit the output.
- `npm run test:evm-bundle` — checks the bundle exists and looks valid.
- `npm run test:infinity-bundle` — checks the Infinity bundle exists and sets `CFS_INFINITY_SDK`.
- `npm run test:bsc-infinity-wired` — asserts Infinity **bscQuery** / **bscPancake** strings, manifest host permission, and bundle path wiring.
- `npm run test:bsc-watch-wired` — asserts `background/service-worker.js` imports `bsc-watch.js` and registers the BSC watch alarm + message handlers (fast guard; does not launch a browser).
- `npm run test:crypto-manifest-hosts` / `npm run test:crypto-observability-wired` — manifest substring guard + observability import order (see **docs/HOST_PERMISSIONS_CRYPTO.md**, **docs/CRYPTO_OBSERVABILITY.md**).

After npm dependency bumps that affect bundles, follow **docs/CRYPTO_BUNDLE_UPGRADE_RUNBOOK.md**.

**Infinity farm CAKE** claims depend on Pancake’s **HTTPS API** (`infinity.pancakeswap.com`); the extension manifest includes **`https://infinity.pancakeswap.com/*`** host permission.

## Risk

Same as any in-extension hot wallet: compromised profile or malicious workflow JSON can move funds. Use a **dedicated low-balance wallet** and **offline backup** of the key or mnemonic.
