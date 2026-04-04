# BSC PancakeSwap pins (extension)

These **on-chain constants** are compiled into `background/bsc-evm.js`. Verify against current [PancakeSwap documentation](https://docs.pancakeswap.finance/) before mainnet upgrades.

| Contract | BSC mainnet address |
|----------|---------------------|
| PancakeSwap V2 router | `0x10ED43C718714eb63d5aA57B78B54704E256024E` |
| PancakeSwap V2 factory | `0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73` |
| PancakeSwap V3 factory | `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865` |
| PancakeSwap V3 QuoterV2 | `0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997` |
| PancakeSwap V3 SwapRouter (`bscPancake` execute) | `0x1b81D678ffb9C0263b24A97847620C99d213eB14` |
| PancakeSwap V3 NonfungiblePositionManager | `0x46A15B0b27311cedF172AB29E4f4766fbE7F4364` |
| WBNB | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` |
| MasterChef v1 (legacy `enterStaking` / `leaveStaking`) | `0x73feaa1eE314F8c655E354234017bE2193C9E24E` |
| MasterChef v2 (`deposit` / `withdraw` / harvest) | `0xa5f8C5Dbd5F286960b9d90548680aE5ebFf07652` |
| **PancakeSwap Infinity** Vault | `0x238a358808379702088667322f80aC48bAd5e6c4` |
| Infinity BinPoolManager | `0xC697d2898e0D09264376196696c51D7aBbbAA4a9` |
| Infinity BinPositionManager | `0x3D311D6283Dd8aB90bb0031835C8e606349e2850` |
| Infinity BinQuoter | `0xC631f4B0Fc2Dd68AD45f74B2942628db117dD359` |
| Infinity farm Distributor (Merkle `claim`) | `0xEA8620aAb2F07a0ae710442590D649ADE8440877` |
| Infinity farm CampaignManager | `0x26Bde0AC5b77b65A402778448eCac2aCaa9c9115` |
| Uniswap Permit2 (BSC) | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

### BSC Chapel (chain 97) — Infinity pins in `bsc-evm.js`

Used when `chainId === 97` for Infinity query/execute paths (not the same as mainnet table above).

| Contract | Chapel address |
|----------|----------------|
| Infinity BinPoolManager | `0xe71d2e0230cE0765be53A8A1ee05bdACF30F296B` |
| Infinity BinPositionManager | `0x68B834232da911c787bcF782CED84ec5d36909a7` |
| Infinity BinQuoter | `0x82E7741E3DE763692785cfDB536D168B1226c4d5` |
| Infinity Vault | `0x2CdB3EC82EE13d341Dc6E73637BE0Eab79cb79dD` |
| Infinity farm Distributor | `0xFBb5B0B69f89B75E18c37A8211C1f2Fa3B7D2728` |

Minimal ABIs are embedded in `bsc-evm.js`: ERC20 `approve`, **`transfer`**, `balanceOf`, `allowance`, `totalSupply`, `decimals`, `symbol`, `name`; WBNB **`deposit`** / **`withdraw`** (`wrapBnb` / `unwrapWbnb`); factory V2 **`getPair`** (`CFS_BSC_QUERY` → `v2FactoryGetPair`); factory V3 **`getPool`** (`v3FactoryGetPool`); V3 **QuoterV2** **`quoteExactInputSingle`** / **`quoteExactOutputSingle`** / **`quoteExactInput`** / **`quoteExactOutput`** (`v3Quoter*` query operations); V3 pool read **`slot0`**, **`liquidity`**, **`token0`**, **`token1`**, **`fee`** (`v3PoolState`); V3 **SwapRouter** **`exactInputSingle`** / **`exactOutputSingle`** / **`exactInput`** / **`exactOutput`** (`bscPancake` execute); V3 **NonfungiblePositionManager** **`mint`** / **`increaseLiquidity`** / **`decreaseLiquidity`** / **`collect`** / **`burn`** / **`positions`** view; **Infinity BinPoolManager** read **`getSlot0`**, **`getBin`**, **`getPosition`**, **`getNextNonEmptyBin`**, **`poolIdToPoolKey`** (`CFS_BSC_QUERY` → `infiBin*`); **Infinity BinQuoter** **`quoteExactInputSingle`** / **`quoteExactOutputSingle`** via SDK **`BinQuoterAbi`** + **`staticCall`** (`infiBinQuoteExactInputSingle` / `infiBinQuoteExactOutputSingle`); **Infinity BinPositionManager** **`modifyLiquidities`** (payload bundles **BIN_SWAP_EXACT_IN_SINGLE** / **BIN_SWAP_EXACT_OUT_SINGLE** + settle/take for **`infiBinSwapExactInSingle`** / **`infiBinSwapExactOutSingle`**, add/remove liquidity, etc.), **`multicall`**, **`positions`**, **`ownerOf`** (execute + `infiBinNpmPosition` query); **Permit2** **`approve`**; **CampaignManager** **`campaignLength`**, **`campaignInfo`**; **Farming Distributor** `claim` calldata via `@pancakeswap/infinity-sdk` (`encodeClaimCalldata`); pair `getReserves` / `token0` / `token1`; V2 router swaps + liquidity + **SupportingFeeOnTransferTokens** swap variants as listed in **docs/BSC_AUTOMATION.md**, plus read-only **`getAmountsOut`** / **`getAmountsIn`** (`CFS_BSC_QUERY`); MasterChef `deposit` / `withdraw` / `enterStaking` / `leaveStaking`, plus read-only **`pendingCake`** / **`userInfo`** / **`poolInfo`** / **`poolLength`** (`CFS_BSC_QUERY` → `farm*` query operations).

Liquidity Book **pool id** encoding and **add/remove** calldata use **`@pancakeswap/infinity-sdk`** in **`background/infinity-sdk.bundle.js`** (build: `npm run build:infinity`).
