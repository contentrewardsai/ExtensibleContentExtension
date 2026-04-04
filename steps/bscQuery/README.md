# BSC read-only query (`bscQuery`)

Calls **`CFS_BSC_QUERY`** in the background (`background/bsc-evm.js`) using the **RPC URL and chain ID** from **Settings → BSC / PancakeSwap**. Does **not** send transactions and does **not** require unlocking a password-protected wallet.

## Operations

| Operation | Fields | Result JSON (saved to variable) |
|-----------|--------|----------------------------------|
| `automationWalletAddress` | — | `{ address }` |
| `nativeBalance` | optional `address` | `{ address, balanceWei }` |
| `erc20Balance` | `token`, optional `holder` | `{ token, holder, balance }` |
| `allowance` | `token`, `spender`, optional `owner` | `{ token, owner, spender, allowance }` |
| `pairReserves` | `pair` (V2 pair) | `{ pair, token0, token1, reserve0, reserve1, blockTimestampLast }` |
| `routerAmountsOut` | `amountIn` (uint256 or **`max`** / **`balance`** = **`path[0]`** balance), `path`; optional **`holder`** (like `erc20Balance`; else automation wallet); optional `routerAddress` (pinned V2 only) | `{ router, amountIn, amounts[] }`; when resolved from balance, also **`holder`** and **`amountInFromBalance`**: true |
| `routerAmountsIn` | `amountOut`, `path`; optional `routerAddress` | `{ router, amountOut, amounts[] }` |
| `erc20Metadata` | `token` | `{ token, decimals, symbol, name }` — `symbol`/`name` may be empty if the contract is non-standard |
| `erc20TotalSupply` | `token` | `{ token, totalSupply }` — works for any ERC20, including **V2 LP pair** tokens |
| `blockByTag` | optional **`blockTag`** (default `latest`) | `{ blockTag, number, hash, timestamp, gasLimit, baseFeePerGas }` — `eth_getBlockByNumber`; empty strings if the field is missing (e.g. pending block) |
| `rpcInfo` | — | `{ chainId, latestBlock, gasPrice, maxFeePerGas, maxPriorityFeePerGas }` — fee fields may be empty strings if the RPC omits them |
| `transactionCount` | optional `address` | `{ address, nonce }` — pending tx count for the address (same as `eth_getTransactionCount` “latest”) |
| `transactionReceipt` | **`txHash`** | If **mined**: `{ pending: false, transactionHash, blockNumber, status, gasUsed, effectiveGasPrice, gasPrice, from, to, contractAddress, logsCount }` — `status` is `1` success / `0` fail when present. If **in mempool** (tx known, no receipt yet): `{ pending: true, transactionHash, from, to, nonce, valueWei }`. If unknown hash: error. |
| `farmPendingCake` | **`pid`**; optional **`address`** (farmer; else automation wallet); optional **`masterChefAddress`** (pinned v1/v2 only) | `{ masterChef, pid, user, pendingCake }` — CAKE pending for that pool (smallest units) |
| `farmUserInfo` | **`pid`**; optional **`address`**, **`masterChefAddress`** | `{ masterChef, pid, user, stakedAmount, rewardDebt }` — LP amount staked in the pool and reward debt |
| `farmPoolInfo` | **`pid`**; optional **`masterChefAddress`** | `{ masterChef, pid, lpToken, allocPoint, lastRewardBlock, accCakePerShare }` — farm pool metadata (LP token address and emission params) |
| `farmPoolLength` | optional **`masterChefAddress`** | `{ masterChef, poolLength }` — number of farm pools (`poolLength()`); valid **`pid`** values are typically `0` … `poolLength - 1` |
| `v2FactoryGetPair` | **`tokenA`**, **`tokenB`**; optional **`factoryAddress`** (pinned V2 factory only) | `{ factory, tokenA, tokenB, pair, hasPair }` — `pair` is `0x0…0` if no pool |
| `v3PoolState` | **`v3Pool`** (pool contract) | `{ pool, token0, token1, fee, liquidity, sqrtPriceX96, tick, …slot0… }` — Uniswap V3–style pool; `fee` may be empty if the pool has no `fee()` getter |
| `v3FactoryGetPool` | **`tokenA`**, **`tokenB`**, **`v3Fee`** (uint24 tier); optional **`factoryV3Address`** (pinned Pancake V3 factory only) | `{ factory, tokenA, tokenB, fee, pool, hasPool }` — same as factory `getPool` |
| `v3QuoterExactInputSingle` | **`tokenIn`**, **`tokenOut`**, **`v3Fee`**, **`amountIn`** (uint256 or **`max`** / **`balance`** for **`tokenIn`**); optional **`holder`**, **`sqrtPriceLimitX96`** (default `0`), **`quoterV3Address`** (pinned QuoterV2 only) | `{ quoter, tokenIn, tokenOut, fee, amountIn, amountOut, … }` — QuoterV2 `quoteExactInputSingle`; balance resolution adds **`holder`**, **`amountInFromBalance`** |
| `v3QuoterExactOutputSingle` | **`tokenIn`**, **`tokenOut`**, **`v3Fee`**, **`amountOut`**; optional **`sqrtPriceLimitX96`**, **`quoterV3Address`** | Same shape with **`amountIn`** as the quoted input required for **`amountOut`** |
| `v3QuoterExactInput` | **`v3Path`**, **`amountIn`** (uint256 or **`max`** / **`balance`** for the **first path token**); optional **`holder`**, **`quoterV3Address`** | Multi-hop **`quoteExactInput`**: path is **forward** `token,fee,token,fee,…,token`. Returns **`amountOut`**, per-hop lists, **`gasEstimate`**. Balance resolution adds **`holder`**, **`amountInFromBalance`**. Up to 8 pools. |
| `v3QuoterExactOutput` | **`v3Path`**, **`amountOut`**; optional **`quoterV3Address`** | Multi-hop **`quoteExactOutput`**: pass the same **forward** path as exact-input (input token → … → output token); the extension **reverses** it for the Quoter call. Returns **`amountIn`** plus lists as above. |
| `v3NpmPosition` | **`v3PositionTokenId`** (NPM NFT id); optional **`positionManagerAddress`** (pinned Pancake V3 NonfungiblePositionManager only, else default) | `{ positionManager, tokenId, owner, nonce, operator, token0, token1, fee, tickLower, tickUpper, liquidity, feeGrowthInside0LastX128, feeGrowthInside1LastX128, tokensOwed0, tokensOwed1 }` — V3 concentrated liquidity is **tick-based** (not DLMM bins). **`owner`** from `ownerOf`; empty string if the call reverts (e.g. burned id). |
| `infiBinPoolId` | **`tokenA`**, **`tokenB`**, **`infinityFee`**, **`binStep`**; optional **`infinityHooks`**, **`infinityHooksRegistrationJson`**, **`binPoolManagerAddress`** (must match pinned BinPoolManager for chain) | `{ poolId, poolKey, binPoolManager, chainId }` — **`poolId`** from `@pancakeswap/infinity-sdk` **`getPoolId`** |
| `infiDecodeBinParameters` | **`parametersBytes32`** | `{ parametersBytes32, decoded }` — **`decodeBinPoolParameters`** |
| `infiBinPoolKeyFromId` | **`poolId`** (bytes32); optional **`binPoolManagerAddress`** | On-chain **`poolIdToPoolKey`** tuple + **`chainId`** |
| `infiBinSlot0` | **`poolId`** | **`getSlot0`**: **`activeId`**, **`protocolFee`**, **`lpFee`** |
| `infiBinGetBin` | **`poolId`**, **`binId`** (uint24) | Reserves X/Y, **`binLiquidity`**, **`totalShares`** |
| `infiBinGetBinsRange` | **`poolId`**, **`binIdLower`**, **`binIdUpper`** (inclusive; max **64** bins) | `{ bins: [{ binId, … }] }` |
| `infiBinGetPosition` | **`poolId`**, **`binId`**; optional **`owner`**, **`positionSalt`** (bytes32) | User **`share`** in that bin |
| `infiBinNextNonEmptyBin` | **`poolId`**, **`swapForY`** (bool), **`binId`** | **`nextBinId`** |
| `infiBinNpmPosition` | **`infiPositionTokenId`**; optional **`binPositionManagerAddress`** | Bin NPM **`positions`**: **`poolKey`**, **`binId`**, **`owner`** |
| `infiBinQuoteExactInputSingle` | Same pool key as **`infiBinPoolId`** (**`tokenA`**, **`tokenB`**, **`infinityFee`**, **`binStep`**, optional hooks); **`infiQuoteExactAmount`** (uint128); **`infiQuoteZeroForOne`** (currency0→1 when true); optional **`infiQuoteHookData`**, **`binPoolManagerAddress`**, **`binQuoterAddress`** | **`amountOut`**, **`gasEstimate`**, **`poolId`**, **`zeroForOne`**, … — pinned **BinQuoter** `quoteExactInputSingle` via **`staticCall`** |
| `infiBinQuoteExactInput` | **`infiQuoteCurrencyIn`** (address); **`infiBinPathJson`** (JSON array, max 8 hops: **`intermediateCurrency`**, **`infinityFee`**, **`binStep`**, optional per-hop **`infinityHooks`**, **`infinityHooksRegistrationJson`**, **`hookData`**); **`infiQuoteExactAmount`** (uint128 **amount in**); optional **`binPoolManagerAddress`**, **`binQuoterAddress`** | **`currencyIn`**, **`currencyOut`**, **`amountOut`**, **`gasEstimate`**, … — **`quoteExactInput`** |
| `infiBinQuoteExactOutput` | Same path fields as **`infiBinQuoteExactInput`**; **`infiQuoteExactAmount`** is uint128 **exact output** (last token in the path) | **`currencyIn`**, **`currencyOut`**, **`amountIn`**, **`gasEstimate`**, … — **`quoteExactOutput`** |
| `infiBinQuoteExactOutputSingle` | Same as **`infiBinQuoteExactInputSingle`** | **`amountIn`**, **`gasEstimate`**, … — **`quoteExactOutputSingle`** |
| `infiFarmCampaignLength` | optional **`campaignManagerAddress`** (pinned mainnet only) | **`campaignLength`** — **Chapel**: not pinned (error) |
| `infiFarmCampaignInfo` | **`campaignId`**; optional **`campaignManagerAddress`** | **`campaignInfo`** fields |
| `isContract` | **`address`** | `{ address, isContract, bytecodeHexChars }` — `eth_getCode` at latest block |

Empty **holder** / **owner** defaults to the automation wallet address on file (same as native balance default). For **`routerAmountsOut`** and V3 **exact-input** quoter ops, **`holder`** selects whose **`path[0]`** / **`tokenIn`** balance is used when **`amountIn`** is **`max`** or **`balance`**.

### Multi-hop Infinity: `infiBinPathJson`

Used by **`infiBinQuoteExactInput`**, **`infiBinQuoteExactOutput`**, and **`bscPancake`** **`infiBinSwapExactIn`** / **`infiBinSwapExactOut`**. Put the same JSON string in **`infiBinPathJson`**.

- **`infiQuoteCurrencyIn`** (**bscQuery**) / **`infiSwapCurrencyIn`** (**bscPancake**) = token **A** (start of route).
- Each array element describes the pool from **current** token to **`intermediateCurrency`** (must match a real bin pool for **`infinityFee`**, **`binStep`**, hooks).
- After all hops, **`intermediateCurrency`** of the **last** element is token **B** (end of route).

**One-hop** (A → B only — single pool):

```json
[{"intermediateCurrency":"0xTOKEN_B","infinityFee":"3000","binStep":"10"}]
```

**Two-hop** (A → C via B):

```json
[
  {"intermediateCurrency":"0xTOKEN_B","infinityFee":"3000","binStep":"10"},
  {"intermediateCurrency":"0xTOKEN_C","infinityFee":"500","binStep":"1"}
]
```

Optional per hop: **`infinityHooks`**, **`infinityHooksRegistrationJson`** (object as JSON string), **`hookData`**. CI validates JSON shape with **`npm run test:infi-bin-path-json`**. Full narrative: **`docs/BSC_AUTOMATION.md`**.

## Docs

- **docs/BSC_AUTOMATION.md** — overview with `bscPancake` + this step.
- **docs/BSC_WALLET_STORAGE.md** — RPC is stored with wallet metadata.
