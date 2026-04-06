/**
 * DeFi Action Patterns — mapping table for converting UI-recorded selectors
 * to headless API steps. Used by the walletApprove step (convertToApiCall)
 * and the post-recording optimizer.
 *
 * Each pattern maps a URL + action sequence → equivalent CFS step type.
 * autoReplace: true means the analyzer will automatically replace the
 * recorded click/type/walletApprove sequence with the API step.
 */
;(function () {
  'use strict';

  var DEFI_ACTION_PATTERNS = [
    /* ── Raydium Swap ── */
    {
      id: 'raydium-swap',
      urlMatch: /app\.raydium\.io\/(swap|liquidity)/i,
      platform: 'raydium',
      chain: 'solana',
      description: 'Raydium swap via Jupiter',
      autoReplace: true,
      selectors: [
        { role: 'inputMint', patterns: [/swap.*input.*mint/i, /input.*token/i, /from.*token/i] },
        { role: 'outputMint', patterns: [/swap.*output.*mint/i, /output.*token/i, /to.*token/i] },
        { role: 'amount', patterns: [/swap.*input.*amount/i, /amount.*input/i] },
        { role: 'submit', patterns: [/swap.*button/i, /swap.*confirm/i] },
      ],
      mapToStep: {
        type: 'solanaJupiterSwap',
        fields: ['inputMint', 'outputMint', 'amountRaw', 'slippageBps'],
      },
    },

    /* ── Jupiter Swap ── */
    {
      id: 'jupiter-swap',
      urlMatch: /jup\.ag/i,
      platform: 'jupiter',
      chain: 'solana',
      description: 'Jupiter aggregator swap',
      autoReplace: true,
      selectors: [
        { role: 'inputMint', patterns: [/input.*token/i, /from.*selector/i, /paying/i] },
        { role: 'outputMint', patterns: [/output.*token/i, /to.*selector/i, /receiving/i] },
        { role: 'amount', patterns: [/input.*amount/i, /from.*amount/i] },
        { role: 'submit', patterns: [/swap.*button/i, /exchange/i] },
      ],
      mapToStep: {
        type: 'solanaJupiterSwap',
        fields: ['inputMint', 'outputMint', 'amountRaw', 'slippageBps'],
      },
    },

    /* ── PancakeSwap (BSC) ── */
    {
      id: 'pancakeswap-swap',
      urlMatch: /pancakeswap\.finance\/(swap|liquidity)/i,
      platform: 'pancakeswap',
      chain: 'bsc',
      description: 'PancakeSwap V3 swap',
      autoReplace: true,
      selectors: [
        { role: 'inputToken', patterns: [/swap.*input.*token/i, /currency.*input/i, /token.*0/i] },
        { role: 'outputToken', patterns: [/swap.*output.*token/i, /currency.*output/i, /token.*1/i] },
        { role: 'amount', patterns: [/swap.*input.*amount/i, /amount.*input/i] },
        { role: 'submit', patterns: [/swap.*button/i, /confirm.*swap/i] },
      ],
      mapToStep: {
        type: 'bscPancake',
        fields: ['inputToken', 'outputToken', 'amountIn', 'slippageBps'],
      },
    },

    /* ── Meteora DLMM Add Liquidity ── */
    {
      id: 'meteora-dlmm-add',
      urlMatch: /app\.meteora\.ag.*dlmm/i,
      platform: 'meteora',
      chain: 'solana',
      description: 'Meteora DLMM add liquidity',
      autoReplace: true,
      selectors: [
        { role: 'pool', patterns: [/pool.*select/i, /pair/i] },
        { role: 'amount', patterns: [/deposit.*amount/i, /amount/i] },
        { role: 'submit', patterns: [/add.*liquidity/i, /deposit.*button/i] },
      ],
      mapToStep: {
        type: 'meteoraDlmmAddLiquidity',
        fields: ['lbPair', 'amountX', 'amountY', 'strategy'],
      },
    },

    /* ── Orca Swap ── */
    {
      id: 'orca-swap',
      urlMatch: /orca\.so/i,
      platform: 'orca',
      chain: 'solana',
      description: 'Orca DEX swap',
      autoReplace: true,
      selectors: [
        { role: 'inputMint', patterns: [/input.*token/i, /from.*token/i] },
        { role: 'outputMint', patterns: [/output.*token/i, /to.*token/i] },
        { role: 'amount', patterns: [/input.*amount/i] },
        { role: 'submit', patterns: [/swap/i] },
      ],
      mapToStep: {
        type: 'solanaJupiterSwap',
        fields: ['inputMint', 'outputMint', 'amountRaw', 'slippageBps'],
      },
    },

    /* ── Raydium CLMM Open Position ── */
    {
      id: 'raydium-clmm-position',
      urlMatch: /app\.raydium\.io.*clmm/i,
      platform: 'raydium',
      chain: 'solana',
      description: 'Raydium CLMM open/manage position',
      autoReplace: true,
      selectors: [
        { role: 'pool', patterns: [/pool.*id/i, /pool.*select/i] },
        { role: 'range', patterns: [/tick.*lower/i, /tick.*upper/i, /price.*range/i] },
        { role: 'amount', patterns: [/base.*amount/i, /deposit/i] },
        { role: 'submit', patterns: [/add.*position/i, /open.*position/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'raydiumClmmOpenPosition',
        fields: ['poolId', 'tickLower', 'tickUpper', 'baseAmountRaw', 'otherAmountMaxRaw'],
      },
    },

    /* ── Pump.fun Buy ── */
    {
      id: 'pumpfun-buy',
      urlMatch: /pump\.fun\/(coin|token)/i,
      platform: 'pumpfun',
      chain: 'solana',
      description: 'Pump.fun buy token',
      autoReplace: true,
      selectors: [
        { role: 'mint', patterns: [/token.*mint/i, /coin.*address/i, /mint/i] },
        { role: 'amount', patterns: [/amount/i, /sol.*input/i, /buy.*amount/i] },
        { role: 'submit', patterns: [/buy/i, /place.*trade/i, /swap/i] },
      ],
      mapToStep: {
        type: 'solanaPumpOrJupiterBuy',
        fields: ['mint', 'solLamports', 'pumpSlippage'],
      },
    },

    /* ── Pump.fun Sell ── */
    {
      id: 'pumpfun-sell',
      urlMatch: /pump\.fun\/(coin|token)/i,
      platform: 'pumpfun',
      chain: 'solana',
      description: 'Pump.fun sell token',
      autoReplace: true,
      selectors: [
        { role: 'mint', patterns: [/token.*mint/i, /coin.*address/i, /mint/i] },
        { role: 'amount', patterns: [/sell.*amount/i, /token.*amount/i, /amount/i] },
        { role: 'submit', patterns: [/sell/i, /place.*sell/i] },
      ],
      mapToStep: {
        type: 'solanaPumpOrJupiterSell',
        fields: ['mint', 'tokenLamports', 'pumpSlippage'],
      },
    },

    /* ── Raydium CLMM Swap ── */
    {
      id: 'raydium-clmm-swap',
      urlMatch: /app\.raydium\.io.*clmm.*swap/i,
      platform: 'raydium',
      chain: 'solana',
      description: 'Raydium CLMM swap',
      autoReplace: true,
      selectors: [
        { role: 'poolId', patterns: [/pool.*id/i, /pool/i] },
        { role: 'inputMint', patterns: [/input.*mint/i, /input.*token/i, /from.*token/i] },
        { role: 'outputMint', patterns: [/output.*mint/i, /output.*token/i, /to.*token/i] },
        { role: 'amount', patterns: [/amount.*in/i, /input.*amount/i, /amount/i] },
        { role: 'submit', patterns: [/swap.*button/i, /swap.*confirm/i, /swap/i] },
      ],
      mapToStep: {
        type: 'raydiumClmmSwap',
        fields: ['poolId', 'inputMint', 'outputMint', 'amountInRaw', 'slippageBps'],
      },
    },

    /* ── Raydium Standard AMM Swap ── */
    {
      id: 'raydium-standard-swap',
      urlMatch: /app\.raydium\.io\/(swap|amm)/i,
      platform: 'raydium',
      chain: 'solana',
      description: 'Raydium Standard AMM swap',
      autoReplace: true,
      selectors: [
        { role: 'poolId', patterns: [/pool.*id/i, /amm.*pool/i] },
        { role: 'inputMint', patterns: [/input.*mint/i, /input.*token/i, /from/i] },
        { role: 'outputMint', patterns: [/output.*mint/i, /output.*token/i, /to/i] },
        { role: 'amount', patterns: [/amount.*in/i, /input.*amount/i, /amount/i] },
        { role: 'submit', patterns: [/swap.*button/i, /swap/i] },
      ],
      mapToStep: {
        type: 'raydiumSwapStandard',
        fields: ['poolId', 'inputMint', 'outputMint', 'amountInRaw', 'slippageBps'],
      },
    },

    /* ── Raydium CPMM Add Liquidity ── */
    {
      id: 'raydium-cpmm-add',
      urlMatch: /app\.raydium\.io.*(cpmm|liquidity)/i,
      platform: 'raydium',
      chain: 'solana',
      description: 'Raydium CPMM add liquidity',
      autoReplace: true,
      selectors: [
        { role: 'poolId', patterns: [/pool.*id/i, /pool/i] },
        { role: 'amount', patterns: [/deposit.*amount/i, /amount.*a/i, /amount/i] },
        { role: 'submit', patterns: [/add.*liquidity/i, /deposit/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'raydiumCpmmAddLiquidity',
        fields: ['poolId', 'inputAmount', 'slippageBps'],
      },
    },

    /* ── Raydium CPMM Remove Liquidity ── */
    {
      id: 'raydium-cpmm-remove',
      urlMatch: /app\.raydium\.io.*(cpmm|liquidity)/i,
      platform: 'raydium',
      chain: 'solana',
      description: 'Raydium CPMM remove liquidity',
      autoReplace: true,
      selectors: [
        { role: 'poolId', patterns: [/pool.*id/i, /pool/i] },
        { role: 'amount', patterns: [/withdraw.*amount/i, /remove.*amount/i, /percent/i] },
        { role: 'submit', patterns: [/remove.*liquidity/i, /withdraw/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'raydiumCpmmRemoveLiquidity',
        fields: ['poolId', 'lpAmount', 'slippageBps'],
      },
    },

    /* ── Raydium Standard Add Liquidity ── */
    {
      id: 'raydium-standard-add',
      urlMatch: /app\.raydium\.io.*liquidity/i,
      platform: 'raydium',
      chain: 'solana',
      description: 'Raydium Standard add liquidity',
      autoReplace: true,
      selectors: [
        { role: 'poolId', patterns: [/pool.*id/i, /pool/i] },
        { role: 'amount', patterns: [/base.*amount/i, /deposit.*amount/i, /amount/i] },
        { role: 'submit', patterns: [/add.*liquidity/i, /supply/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'raydiumAddLiquidity',
        fields: ['poolId', 'baseAmountRaw', 'quoteAmountMaxRaw', 'slippageBps'],
      },
    },

    /* ── Raydium Standard Remove Liquidity ── */
    {
      id: 'raydium-standard-remove',
      urlMatch: /app\.raydium\.io.*liquidity/i,
      platform: 'raydium',
      chain: 'solana',
      description: 'Raydium Standard remove liquidity',
      autoReplace: true,
      selectors: [
        { role: 'poolId', patterns: [/pool.*id/i, /pool/i] },
        { role: 'amount', patterns: [/remove.*amount/i, /lp.*amount/i, /percent/i] },
        { role: 'submit', patterns: [/remove.*liquidity/i, /withdraw/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'raydiumRemoveLiquidity',
        fields: ['poolId', 'lpAmount'],
      },
    },

    /* ── Raydium CLMM Increase Position ── */
    {
      id: 'raydium-clmm-increase',
      urlMatch: /app\.raydium\.io.*clmm/i,
      platform: 'raydium',
      chain: 'solana',
      description: 'Raydium CLMM increase position',
      autoReplace: true,
      selectors: [
        { role: 'poolId', patterns: [/pool/i] },
        { role: 'amount', patterns: [/deposit.*amount/i, /increase.*amount/i, /amount/i] },
        { role: 'submit', patterns: [/increase/i, /add.*more/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'raydiumClmmIncreasePosition',
        fields: ['poolId', 'baseAmountRaw'],
      },
    },

    /* ── Raydium CLMM Decrease Liquidity ── */
    {
      id: 'raydium-clmm-decrease',
      urlMatch: /app\.raydium\.io.*clmm/i,
      platform: 'raydium',
      chain: 'solana',
      description: 'Raydium CLMM decrease liquidity',
      autoReplace: true,
      selectors: [
        { role: 'poolId', patterns: [/pool/i] },
        { role: 'amount', patterns: [/remove.*amount/i, /decrease.*amount/i, /percent/i] },
        { role: 'submit', patterns: [/decrease/i, /remove/i, /withdraw/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'raydiumClmmDecreaseLiquidity',
        fields: ['poolId', 'liquidity', 'amountMinA', 'amountMinB'],
      },
    },

    /* ── Raydium CLMM Close Position ── */
    {
      id: 'raydium-clmm-close',
      urlMatch: /app\.raydium\.io.*clmm/i,
      platform: 'raydium',
      chain: 'solana',
      description: 'Raydium CLMM close position',
      autoReplace: true,
      selectors: [
        { role: 'poolId', patterns: [/pool/i] },
        { role: 'submit', patterns: [/close.*position/i, /close/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'raydiumClmmClosePosition',
        fields: ['poolId'],
      },
    },

    /* ── Raydium CLMM Collect Rewards ── */
    {
      id: 'raydium-clmm-collect',
      urlMatch: /app\.raydium\.io.*clmm/i,
      platform: 'raydium',
      chain: 'solana',
      description: 'Raydium CLMM collect rewards',
      autoReplace: true,
      selectors: [
        { role: 'poolId', patterns: [/pool/i] },
        { role: 'submit', patterns: [/collect.*reward/i, /harvest/i, /claim/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'raydiumClmmCollectRewards',
        fields: ['poolId'],
      },
    },

    /* ── Raydium CLMM Lock Position ── */
    {
      id: 'raydium-clmm-lock',
      urlMatch: /app\.raydium\.io.*clmm/i,
      platform: 'raydium',
      chain: 'solana',
      description: 'Raydium CLMM lock position',
      autoReplace: true,
      selectors: [
        { role: 'poolId', patterns: [/pool/i] },
        { role: 'submit', patterns: [/lock.*position/i, /lock/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'raydiumClmmLockPosition',
        fields: ['poolId'],
      },
    },

    /* ── Raydium CLMM Harvest Lock Position ── */
    {
      id: 'raydium-clmm-harvest',
      urlMatch: /app\.raydium\.io.*clmm/i,
      platform: 'raydium',
      chain: 'solana',
      description: 'Raydium CLMM harvest locked position',
      autoReplace: true,
      selectors: [
        { role: 'poolId', patterns: [/pool/i] },
        { role: 'submit', patterns: [/harvest.*lock/i, /harvest/i, /claim.*lock/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'raydiumClmmHarvestLockPosition',
        fields: ['poolId'],
      },
    },

    /* ── Meteora CP-AMM Swap ── */
    {
      id: 'meteora-cpamm-swap',
      urlMatch: /app\.meteora\.ag.*(pools|amm)/i,
      platform: 'meteora',
      chain: 'solana',
      description: 'Meteora CP-AMM swap',
      autoReplace: true,
      selectors: [
        { role: 'pool', patterns: [/pool.*address/i, /pool/i] },
        { role: 'inputMint', patterns: [/input.*mint/i, /input.*token/i, /from/i] },
        { role: 'outputMint', patterns: [/output.*mint/i, /output.*token/i, /to/i] },
        { role: 'amount', patterns: [/amount.*in/i, /swap.*amount/i, /amount/i] },
        { role: 'submit', patterns: [/swap/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'meteoraCpammSwap',
        fields: ['pool', 'inputMint', 'outputMint', 'amountInRaw', 'slippagePercent'],
      },
    },

    /* ── Meteora CP-AMM Add Liquidity ── */
    {
      id: 'meteora-cpamm-add',
      urlMatch: /app\.meteora\.ag.*(pools|amm)/i,
      platform: 'meteora',
      chain: 'solana',
      description: 'Meteora CP-AMM add liquidity',
      autoReplace: true,
      selectors: [
        { role: 'pool', patterns: [/pool/i] },
        { role: 'amount', patterns: [/deposit.*amount/i, /amount/i] },
        { role: 'submit', patterns: [/add.*liquidity/i, /deposit/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'meteoraCpammAddLiquidity',
        fields: ['pool', 'tokenAAmount', 'tokenBAmount', 'slippagePercent'],
      },
    },

    /* ── Meteora CP-AMM Remove Liquidity ── */
    {
      id: 'meteora-cpamm-remove',
      urlMatch: /app\.meteora\.ag.*(pools|amm)/i,
      platform: 'meteora',
      chain: 'solana',
      description: 'Meteora CP-AMM remove liquidity',
      autoReplace: true,
      selectors: [
        { role: 'pool', patterns: [/pool/i] },
        { role: 'amount', patterns: [/withdraw.*amount/i, /remove.*amount/i, /percent/i] },
        { role: 'submit', patterns: [/remove.*liquidity/i, /withdraw/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'meteoraCpammRemoveLiquidity',
        fields: ['pool', 'lpTokenAmount', 'slippagePercent'],
      },
    },

    /* ── Meteora CP-AMM Claim Fees ── */
    {
      id: 'meteora-cpamm-claim-fees',
      urlMatch: /app\.meteora\.ag.*(pools|amm)/i,
      platform: 'meteora',
      chain: 'solana',
      description: 'Meteora CP-AMM claim fees',
      autoReplace: true,
      selectors: [
        { role: 'pool', patterns: [/pool/i] },
        { role: 'submit', patterns: [/claim.*fee/i, /collect.*fee/i, /claim/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'meteoraCpammClaimFees',
        fields: ['pool'],
      },
    },

    /* ── Meteora CP-AMM Claim Reward ── */
    {
      id: 'meteora-cpamm-claim-reward',
      urlMatch: /app\.meteora\.ag.*(pools|amm)/i,
      platform: 'meteora',
      chain: 'solana',
      description: 'Meteora CP-AMM claim reward',
      autoReplace: true,
      selectors: [
        { role: 'pool', patterns: [/pool/i] },
        { role: 'submit', patterns: [/claim.*reward/i, /harvest/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'meteoraCpammClaimReward',
        fields: ['pool'],
      },
    },

    /* ── Meteora DLMM Remove Liquidity ── */
    {
      id: 'meteora-dlmm-remove',
      urlMatch: /app\.meteora\.ag.*dlmm/i,
      platform: 'meteora',
      chain: 'solana',
      description: 'Meteora DLMM remove liquidity',
      autoReplace: true,
      selectors: [
        { role: 'pool', patterns: [/pool/i, /pair/i] },
        { role: 'amount', patterns: [/withdraw.*amount/i, /remove.*amount/i, /percent/i] },
        { role: 'submit', patterns: [/remove.*liquidity/i, /withdraw/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'meteoraDlmmRemoveLiquidity',
        fields: ['lbPair', 'binIds', 'bps'],
      },
    },

    /* ── Meteora DLMM Claim Rewards ── */
    {
      id: 'meteora-dlmm-claim',
      urlMatch: /app\.meteora\.ag.*dlmm/i,
      platform: 'meteora',
      chain: 'solana',
      description: 'Meteora DLMM claim rewards',
      autoReplace: true,
      selectors: [
        { role: 'pool', patterns: [/pool/i, /pair/i] },
        { role: 'submit', patterns: [/claim.*reward/i, /harvest/i, /claim/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'meteoraDlmmClaimRewards',
        fields: ['lbPair'],
      },
    },

    /* ── 1inch (BSC / EVM) ── */
    {
      id: '1inch-swap',
      urlMatch: /app\.1inch\.io/i,
      platform: '1inch',
      chain: 'bsc',
      description: '1inch aggregator swap',
      autoReplace: true,
      selectors: [
        { role: 'srcToken', patterns: [/input.*token/i, /from.*token/i, /source.*token/i, /you.*pay/i] },
        { role: 'destToken', patterns: [/output.*token/i, /to.*token/i, /dest.*token/i, /you.*receive/i] },
        { role: 'amount', patterns: [/input.*amount/i, /amount/i] },
        { role: 'submit', patterns: [/swap.*button/i, /swap/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'bscAggregatorSwap',
        fields: ['srcToken', 'destToken', 'amount', 'slippage'],
      },
    },

    /* ── ParaSwap ── */
    {
      id: 'paraswap-swap',
      urlMatch: /app\.paraswap\.(io|xyz)/i,
      platform: 'paraswap',
      chain: 'bsc',
      description: 'ParaSwap aggregator swap',
      autoReplace: true,
      selectors: [
        { role: 'srcToken', patterns: [/input.*token/i, /from.*token/i, /source/i] },
        { role: 'destToken', patterns: [/output.*token/i, /to.*token/i, /dest/i] },
        { role: 'amount', patterns: [/input.*amount/i, /amount/i] },
        { role: 'submit', patterns: [/swap.*button/i, /swap/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'bscAggregatorSwap',
        fields: ['srcToken', 'destToken', 'amount', 'slippage'],
      },
    },

    /* ── Phantom Wallet Transfer (SOL) ── */
    {
      id: 'phantom-transfer-sol',
      urlMatch: /phantom\.app/i,
      platform: 'phantom',
      chain: 'solana',
      description: 'Phantom wallet SOL transfer',
      autoReplace: true,
      selectors: [
        { role: 'recipient', patterns: [/recipient/i, /send.*to/i, /address/i] },
        { role: 'amount', patterns: [/amount/i, /send.*amount/i] },
        { role: 'submit', patterns: [/send/i, /confirm/i, /next/i] },
      ],
      mapToStep: {
        type: 'solanaTransferSol',
        fields: ['toAddress', 'lamports'],
      },
    },

    /* ── Solflare Wallet Transfer ── */
    {
      id: 'solflare-transfer',
      urlMatch: /solflare\.com/i,
      platform: 'solflare',
      chain: 'solana',
      description: 'Solflare wallet transfer',
      autoReplace: true,
      selectors: [
        { role: 'recipient', patterns: [/recipient/i, /send.*to/i, /address/i] },
        { role: 'amount', patterns: [/amount/i, /send.*amount/i] },
        { role: 'submit', patterns: [/send/i, /confirm/i, /transfer/i] },
      ],
      mapToStep: {
        type: 'solanaTransferSol',
        fields: ['toAddress', 'lamports'],
      },
    },

    /* ── BSC Transfer BNB ── */
    {
      id: 'bsc-transfer-bnb',
      urlMatch: /bscscan\.com\/(tx|address)|metamask\.io/i,
      platform: 'bsc',
      chain: 'bsc',
      description: 'BSC BNB transfer',
      autoReplace: true,
      selectors: [
        { role: 'recipient', patterns: [/recipient/i, /to.*address/i, /address/i] },
        { role: 'amount', patterns: [/amount/i, /value/i] },
        { role: 'submit', patterns: [/send/i, /confirm/i, /transfer/i] },
      ],
      mapToStep: {
        type: 'bscTransferBnb',
        fields: ['toAddress', 'valueWei'],
      },
    },

    /* ── Aster Futures Trade ── */
    {
      id: 'aster-futures-trade',
      urlMatch: /asterdex\.com.*futures/i,
      platform: 'aster',
      chain: 'bsc',
      description: 'Aster DEX futures trade',
      autoReplace: true,
      selectors: [
        { role: 'symbol', patterns: [/symbol/i, /pair/i, /market/i] },
        { role: 'side', patterns: [/side/i, /buy.*sell/i, /long.*short/i] },
        { role: 'amount', patterns: [/quantity/i, /amount/i, /size/i] },
        { role: 'submit', patterns: [/place.*order/i, /submit/i, /buy.*long/i, /sell.*short/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'asterFuturesTrade',
        fields: ['symbol', 'side', 'type', 'quantity'],
      },
    },

    /* ── Aster Spot Trade ── */
    {
      id: 'aster-spot-trade',
      urlMatch: /asterdex\.com.*spot/i,
      platform: 'aster',
      chain: 'bsc',
      description: 'Aster DEX spot trade',
      autoReplace: true,
      selectors: [
        { role: 'symbol', patterns: [/symbol/i, /pair/i, /market/i] },
        { role: 'side', patterns: [/side/i, /buy.*sell/i] },
        { role: 'amount', patterns: [/quantity/i, /amount/i, /size/i] },
        { role: 'submit', patterns: [/place.*order/i, /submit/i, /buy/i, /sell/i, /confirm/i] },
      ],
      mapToStep: {
        type: 'asterSpotTrade',
        fields: ['symbol', 'side', 'type', 'quantity'],
      },
    },
  ];

  /**
   * Match a page URL against known patterns.
   * Returns the matching pattern(s) or empty array.
   */
  function matchUrl(url) {
    if (!url) return [];
    return DEFI_ACTION_PATTERNS.filter(function (p) { return p.urlMatch.test(url); });
  }

  /**
   * Attempt to match a recorded action (click/type on a selector) to a semantic role
   * in a known DeFi pattern.
   * Returns { patternId, role, mapToStep, autoReplace } or null.
   */
  function matchSelector(url, selector) {
    var patterns = matchUrl(url);
    if (!patterns.length || !selector) return null;
    var selStr = typeof selector === 'string' ? selector : (Array.isArray(selector) ? selector[0] : '');
    if (!selStr) return null;
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      for (var j = 0; j < p.selectors.length; j++) {
        var s = p.selectors[j];
        for (var k = 0; k < s.patterns.length; k++) {
          if (s.patterns[k].test(selStr)) {
            return { patternId: p.id, role: s.role, mapToStep: p.mapToStep, platform: p.platform, chain: p.chain, autoReplace: !!p.autoReplace };
          }
        }
      }
    }
    return null;
  }

  /**
   * Given a recorded workflow (array of actions) on a DeFi site,
   * attempt to convert the sequence to an API step.
   * Returns { canConvert, autoReplace, suggestion } where suggestion is the API step config.
   */
  function suggestApiConversion(actions, pageUrl) {
    var patterns = matchUrl(pageUrl);
    if (!patterns.length || !Array.isArray(actions) || !actions.length) {
      return { canConvert: false, reason: 'No known DeFi pattern for this URL' };
    }
    var p = patterns[0]; /* Use first match */
    var fieldValues = {};
    var hasSubmit = false;

    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      var selArr = a.selectors || (a.selector ? [a.selector] : []);
      var sel = selArr[0] || '';
      for (var j = 0; j < p.selectors.length; j++) {
        var s = p.selectors[j];
        for (var k = 0; k < s.patterns.length; k++) {
          if (s.patterns[k].test(sel)) {
            if (s.role === 'submit') {
              hasSubmit = true;
            } else if (a.type === 'type' && a.value) {
              fieldValues[s.role] = a.value;
            }
            break;
          }
        }
      }
    }

    if (!hasSubmit) {
      return { canConvert: false, reason: 'No submit action found in recorded sequence' };
    }

    var step = { type: p.mapToStep.type };
    for (var f = 0; f < p.mapToStep.fields.length; f++) {
      var fieldName = p.mapToStep.fields[f];
      step[fieldName] = fieldValues[fieldName] || '';
    }

    return {
      canConvert: true,
      autoReplace: !!p.autoReplace,
      suggestion: step,
      pattern: p,
      fieldValues: fieldValues,
    };
  }

  /* Export */
  if (typeof globalThis !== 'undefined') {
    globalThis.__CFS_DEFI_ACTION_PATTERNS = {
      patterns: DEFI_ACTION_PATTERNS,
      matchUrl: matchUrl,
      matchSelector: matchSelector,
      suggestApiConversion: suggestApiConversion,
    };
  }
  if (typeof window !== 'undefined') {
    window.__CFS_DEFI_ACTION_PATTERNS = globalThis.__CFS_DEFI_ACTION_PATTERNS;
  }
})();
