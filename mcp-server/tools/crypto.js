/**
 * MCP Tools — Crypto operations (Solana + BSC core)
 *
 * Write operations (swaps, transfers) check the cfsMcpDryRunConfirmation setting.
 * When enabled, the first call returns a dry-run preview; a second call with
 * confirm: true executes the transaction.
 */
import { z } from 'zod';

/** Helper: check if dry-run confirmation is enabled */
async function isDryRunEnabled(ctx) {
  try {
    const res = await ctx.readStorage(['cfsMcpDryRunConfirmation']);
    return res && res.data && res.data.cfsMcpDryRunConfirmation !== false;
  } catch (_) {
    return true; /* default to safe */
  }
}

/** Helper: wrap write tool with optional dry-run */
function writeToolHandler(ctx, buildPayload) {
  return async (args) => {
    const dryRun = await isDryRunEnabled(ctx);
    const payload = buildPayload(args);

    if (dryRun && !args.confirm) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            dryRun: true,
            message: 'Dry-run mode is enabled. Review the payload below and call this tool again with confirm: true to execute.',
            payload,
          }, null, 2),
        }],
      };
    }

    const res = await ctx.sendMessage(payload);
    return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
  };
}

export function registerCryptoTools(server, ctx) {
  /* ─── Solana reads ─── */

  server.tool(
    'solana_rpc_read',
    'Read Solana data (wallet balances, token accounts, mint info) via the configured RPC.',
    {
      operation: z.string().describe('RPC operation: "balance", "tokenAccounts", "mintInfo", "accountInfo", etc.'),
      address: z.string().optional().describe('Solana address to query'),
      mint: z.string().optional().describe('Token mint address'),
      extra: z.record(z.string(), z.any()).optional().describe('Additional operation-specific fields'),
    },
    async ({ operation, address, mint, extra }) => {
      const payload = { type: 'CFS_SOLANA_RPC_READ', operation };
      if (address) payload.address = address;
      if (mint) payload.mint = mint;
      if (extra) Object.assign(payload, extra);
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'solana_rugcheck',
    'Get a Rugcheck token safety report for a Solana token mint.',
    {
      mint: z.string().describe('Token mint address to check'),
    },
    async ({ mint }) => {
      const res = await ctx.sendMessage({ type: 'CFS_RUGCHECK_TOKEN_REPORT', mint });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'solana_perps_status',
    'Get the status of perpetual futures automation (Raydium/Jupiter perps).',
    {},
    async () => {
      const res = await ctx.sendMessage({ type: 'CFS_PERPS_AUTOMATION_STATUS' });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'jupiter_perps_markets',
    'Get Jupiter perpetual futures markets data.',
    {
      jupiterApiKey: z.string().max(2048).optional().describe('Optional Jupiter API key override'),
    },
    async ({ jupiterApiKey }) => {
      const payload = { type: 'CFS_JUPITER_PERPS_MARKETS' };
      if (jupiterApiKey) payload.jupiterApiKey = jupiterApiKey;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'solana_pump_market_probe',
    'Check if a token is on PumpFun (bonding curve status, migration state).',
    {
      mint: z.string().describe('Token mint to probe'),
      extra: z.record(z.string(), z.any()).optional().describe('Additional probe fields'),
    },
    async ({ mint, extra }) => {
      const payload = { type: 'CFS_PUMPFUN_MARKET_PROBE', mint };
      if (extra) Object.assign(payload, extra);
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ─── Solana write operations ─── */

  const confirmField = z.boolean().optional().describe('Set to true to execute (required when dry-run confirmation is enabled in Settings)');

  server.tool(
    'solana_swap',
    'Execute a Solana token swap via Jupiter. WARNING: This performs a real transaction using your automation wallet.',
    {
      inputMint: z.string().describe('Input token mint (e.g. SOL mint for buying)'),
      outputMint: z.string().describe('Output token mint'),
      amount: z.string().describe('Amount in raw lamports/token units'),
      slippageBps: z.number().int().optional().describe('Slippage tolerance in basis points (default 50)'),
      extra: z.record(z.string(), z.any()).optional().describe('Extra swap params (onlyDirectRoutes, dexes, etc.)'),
      confirm: confirmField,
    },
    writeToolHandler(ctx, ({ inputMint, outputMint, amount, slippageBps, extra }) => {
      const p = { type: 'CFS_SOLANA_EXECUTE_SWAP', inputMint, outputMint, amount };
      if (slippageBps != null) p.slippageBps = slippageBps;
      if (extra) Object.assign(p, extra);
      return p;
    })
  );

  server.tool(
    'solana_transfer_sol',
    'Transfer SOL to an address. WARNING: Real transaction.',
    {
      destination: z.string().describe('Recipient Solana address'),
      lamports: z.string().describe('Amount in lamports'),
      confirm: confirmField,
    },
    writeToolHandler(ctx, ({ destination, lamports }) => ({
      type: 'CFS_SOLANA_TRANSFER_SOL', destination, lamports,
    }))
  );

  server.tool(
    'solana_transfer_spl',
    'Transfer SPL tokens to an address. WARNING: Real transaction.',
    {
      destination: z.string().describe('Recipient Solana address'),
      mint: z.string().describe('Token mint address'),
      amount: z.string().describe('Amount in raw token units'),
      confirm: confirmField,
    },
    writeToolHandler(ctx, ({ destination, mint, amount }) => ({
      type: 'CFS_SOLANA_TRANSFER_SPL', destination, mint, amount,
    }))
  );

  server.tool(
    'solana_ensure_token_account',
    'Create an associated token account for a mint if it does not exist.',
    {
      mint: z.string().describe('Token mint address'),
      owner: z.string().optional().describe('Account owner (defaults to automation wallet)'),
      confirm: confirmField,
    },
    writeToolHandler(ctx, ({ mint, owner }) => {
      const p = { type: 'CFS_SOLANA_ENSURE_TOKEN_ACCOUNT', mint };
      if (owner) p.owner = owner;
      return p;
    })
  );

  server.tool(
    'solana_wrap_sol',
    'Wrap SOL into wSOL (Wrapped SOL).',
    {
      lamports: z.string().describe('Amount of SOL to wrap in lamports'),
      confirm: confirmField,
    },
    writeToolHandler(ctx, ({ lamports }) => ({
      type: 'CFS_SOLANA_WRAP_SOL', lamports,
    }))
  );

  server.tool(
    'solana_unwrap_sol',
    'Unwrap all wSOL back to SOL.',
    { confirm: confirmField },
    writeToolHandler(ctx, () => ({ type: 'CFS_SOLANA_UNWRAP_WSOL' }))
  );

  server.tool(
    'solana_pumpfun_buy',
    'Buy a token on PumpFun (bonding curve). WARNING: Real transaction.',
    {
      mint: z.string().describe('Token mint address'),
      solLamports: z.string().describe('SOL amount to spend in lamports'),
      slippageBps: z.number().int().optional().describe('Slippage in bps'),
      extra: z.record(z.string(), z.any()).optional(),
      confirm: confirmField,
    },
    writeToolHandler(ctx, ({ mint, solLamports, slippageBps, extra }) => {
      const p = { type: 'CFS_PUMPFUN_BUY', mint, solLamports };
      if (slippageBps != null) p.slippageBps = slippageBps;
      if (extra) Object.assign(p, extra);
      return p;
    })
  );

  server.tool(
    'solana_pumpfun_sell',
    'Sell a token on PumpFun (bonding curve). WARNING: Real transaction.',
    {
      mint: z.string().describe('Token mint address'),
      tokenAmountRaw: z.string().describe('Token amount to sell in raw units'),
      slippageBps: z.number().int().optional(),
      extra: z.record(z.string(), z.any()).optional(),
      confirm: confirmField,
    },
    writeToolHandler(ctx, ({ mint, tokenAmountRaw, slippageBps, extra }) => {
      const p = { type: 'CFS_PUMPFUN_SELL', mint, tokenAmountRaw };
      if (slippageBps != null) p.slippageBps = slippageBps;
      if (extra) Object.assign(p, extra);
      return p;
    })
  );

  server.tool(
    'solana_pump_or_jupiter_buy',
    'Buy a token via PumpFun or Jupiter (auto-detects venue). WARNING: Real transaction.',
    {
      mint: z.string().describe('Token mint address'),
      solLamports: z.string().describe('SOL amount to spend in lamports'),
      slippageBps: z.number().int().optional(),
      extra: z.record(z.string(), z.any()).optional(),
      confirm: confirmField,
    },
    writeToolHandler(ctx, ({ mint, solLamports, slippageBps, extra }) => {
      const p = { type: 'CFS_PUMP_OR_JUPITER_BUY', mint, solLamports };
      if (slippageBps != null) p.slippageBps = slippageBps;
      if (extra) Object.assign(p, extra);
      return p;
    })
  );

  server.tool(
    'solana_pump_or_jupiter_sell',
    'Sell a token via PumpFun or Jupiter (auto-detects venue). WARNING: Real transaction.',
    {
      mint: z.string().describe('Token mint address'),
      tokenAmountRaw: z.string().describe('Token amount to sell in raw units'),
      slippageBps: z.number().int().optional(),
      extra: z.record(z.string(), z.any()).optional(),
      confirm: confirmField,
    },
    writeToolHandler(ctx, ({ mint, tokenAmountRaw, slippageBps, extra }) => {
      const p = { type: 'CFS_PUMP_OR_JUPITER_SELL', mint, tokenAmountRaw };
      if (slippageBps != null) p.slippageBps = slippageBps;
      if (extra) Object.assign(p, extra);
      return p;
    })
  );

  server.tool(
    'solana_sellability_probe',
    'Run a sellability probe: buy a small amount then immediately sell to test the sell path. WARNING: Real transactions.',
    {
      mint: z.string().describe('Token mint address'),
      spendUsdApprox: z.number().optional().describe('Approximate USD to spend on the probe (default ~1)'),
      solLamports: z.string().optional().describe('Alternative: exact SOL amount in lamports'),
      extra: z.record(z.string(), z.any()).optional(),
      confirm: confirmField,
    },
    writeToolHandler(ctx, ({ mint, spendUsdApprox, solLamports, extra }) => {
      const p = { type: 'CFS_SOLANA_SELLABILITY_PROBE', mint };
      if (spendUsdApprox != null) p.spendUsdApprox = spendUsdApprox;
      if (solLamports) p.solLamports = solLamports;
      if (extra) Object.assign(p, extra);
      return p;
    })
  );

  /* ─── Jupiter V2 API tools ─── */

  server.tool(
    'jupiter_price_v3',
    'Get real-time USD prices for SPL tokens via Jupiter Price API V3. Pass up to 50 mint addresses (comma-separated). No wallet needed.',
    {
      mintAddresses: z.string().describe('Comma-separated mint addresses (up to 50)'),
    },
    async ({ mintAddresses }) => {
      const res = await ctx.sendMessage({ type: 'CFS_JUPITER_PRICE_V3', mintAddresses });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'jupiter_token_search',
    'Search SPL token metadata (name, symbol, mint, decimals, verification, organic score). No wallet needed.',
    {
      query: z.string().describe('Search query: token name, symbol, or mint address'),
    },
    async ({ query }) => {
      const res = await ctx.sendMessage({ type: 'CFS_JUPITER_TOKEN_SEARCH', query });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'jupiter_dca_create',
    'Create a Jupiter DCA (Dollar-Cost Averaging) recurring buy order. WARNING: Real transaction. Splits a total investment into periodic purchases.',
    {
      inputMint: z.string().describe('Input token mint (token to spend)'),
      outputMint: z.string().describe('Output token mint (token to accumulate)'),
      inAmount: z.string().describe('Total amount to invest (raw smallest units)'),
      inAmountPerCycle: z.string().describe('Amount to spend per cycle (raw units)'),
      cycleSecondsApart: z.string().describe('Seconds between cycles (e.g. 86400 for daily)'),
      minOutAmountPerCycle: z.string().optional().describe('Min output per cycle (optional guard)'),
      maxOutAmountPerCycle: z.string().optional().describe('Max output per cycle (optional guard)'),
      startAt: z.string().optional().describe('Start time as Unix timestamp (optional)'),
      confirm: confirmField,
    },
    writeToolHandler(ctx, ({ inputMint, outputMint, inAmount, inAmountPerCycle, cycleSecondsApart, minOutAmountPerCycle, maxOutAmountPerCycle, startAt }) => {
      const p = { type: 'CFS_JUPITER_DCA_CREATE', inputMint, outputMint, inAmount, inAmountPerCycle, cycleSecondsApart };
      if (minOutAmountPerCycle) p.minOutAmountPerCycle = minOutAmountPerCycle;
      if (maxOutAmountPerCycle) p.maxOutAmountPerCycle = maxOutAmountPerCycle;
      if (startAt) p.startAt = startAt;
      return p;
    })
  );

  server.tool(
    'jupiter_limit_order',
    'Create a vault-based limit order via Jupiter Trigger V2. Supports single price and OCO (take-profit/stop-loss). WARNING: Real transaction. Full auth flow (challenge → sign → JWT) handled automatically.',
    {
      inputMint: z.string().describe('Input token mint (token to sell)'),
      outputMint: z.string().describe('Output token mint (token to buy)'),
      makingAmount: z.string().describe('Amount to sell (raw smallest units)'),
      triggerPriceUsd: z.string().describe('USD price trigger (e.g. "120.50")'),
      orderType: z.enum(['single', 'oco']).optional().describe('Order type: "single" or "oco" for take-profit/stop-loss'),
      takeProfitPriceUsd: z.string().optional().describe('Take profit price (OCO only)'),
      stopLossPriceUsd: z.string().optional().describe('Stop loss price (OCO only)'),
      expireInSeconds: z.string().optional().describe('Order expiry in seconds (0 = no expiry)'),
      slippageBps: z.number().int().optional().describe('Slippage in bps (default 50)'),
      confirm: confirmField,
    },
    writeToolHandler(ctx, ({ inputMint, outputMint, makingAmount, triggerPriceUsd, orderType, takeProfitPriceUsd, stopLossPriceUsd, expireInSeconds, slippageBps }) => {
      const p = { type: 'CFS_JUPITER_LIMIT_ORDER', inputMint, outputMint, makingAmount, triggerPriceUsd };
      if (orderType) p.orderType = orderType;
      if (takeProfitPriceUsd) p.takeProfitPriceUsd = takeProfitPriceUsd;
      if (stopLossPriceUsd) p.stopLossPriceUsd = stopLossPriceUsd;
      if (expireInSeconds) p.expireInSeconds = expireInSeconds;
      if (slippageBps != null) p.slippageBps = slippageBps;
      return p;
    })
  );

  server.tool(
    'jupiter_earn',
    'Deposit to or withdraw from Jupiter Earn vaults (yield-bearing). WARNING: Real transaction.',
    {
      operation: z.enum(['deposit', 'withdraw']).describe('Operation: "deposit" to earn yield, "withdraw" to reclaim'),
      mint: z.string().describe('Token mint to deposit/withdraw'),
      amount: z.string().describe('Amount in raw smallest units'),
      confirm: confirmField,
    },
    writeToolHandler(ctx, ({ operation, mint, amount }) => ({
      type: 'CFS_JUPITER_EARN', earnOperation: operation, mint, amount,
    }))
  );

  /* ─── Jupiter Prediction Markets ─── */

  server.tool(
    'jupiter_prediction_search',
    'Search and browse Jupiter Prediction Markets. Binary YES/NO events aggregating Polymarket & Kalshi liquidity. Categories: crypto, sports, politics, esports, culture, economics, tech. Prices in micro USD (1,000,000 = $1). No wallet needed.',
    {
      operation: z.enum(['searchEvents', 'listEvents', 'getEvent', 'getMarket', 'getOrderbook', 'tradingStatus'])
        .describe('Operation: searchEvents (keyword search), listEvents (by category/filter), getEvent, getMarket, getOrderbook, tradingStatus'),
      query: z.string().optional().describe('Search query (for searchEvents): e.g. "nba", "bitcoin", "election"'),
      category: z.string().optional().describe('Category filter (for listEvents): crypto, sports, politics, esports, culture, economics, tech'),
      filter: z.string().optional().describe('Filter: new, live, trending'),
      eventId: z.string().optional().describe('Event ID (for getEvent)'),
      marketId: z.string().optional().describe('Market ID (for getMarket/getOrderbook)'),
    },
    async ({ operation, query, category, filter, eventId, marketId }) => {
      const payload = { type: 'CFS_JUPITER_PREDICTION_SEARCH', operation };
      if (query) payload.query = query;
      if (category) payload.category = category;
      if (filter) payload.filter = filter;
      if (eventId) payload.eventId = eventId;
      if (marketId) payload.marketId = marketId;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'jupiter_prediction_trade',
    'Trade on Jupiter Prediction Markets. Buy/sell YES or NO contracts on real-world events. WARNING: Real transaction.',
    {
      operation: z.enum(['buyOrder', 'sellOrder', 'closePosition', 'closeAllPositions', 'claimPayout'])
        .describe('Trade operation'),
      marketId: z.string().optional().describe('Market ID (for buyOrder/sellOrder)'),
      isYes: z.boolean().optional().describe('Buy YES (true) or NO (false) contract'),
      amount: z.string().optional().describe('Amount in micro USD (1000000 = $1)'),
      limitPrice: z.string().optional().describe('Limit price in micro USD'),
      positionPubkey: z.string().optional().describe('Position pubkey (for closePosition/claimPayout)'),
      confirm: confirmField,
    },
    writeToolHandler(ctx, ({ operation, marketId, isYes, amount, limitPrice, positionPubkey }) => {
      const p = { type: 'CFS_JUPITER_PREDICTION_TRADE', operation };
      if (marketId) p.marketId = marketId;
      if (isYes != null) p.isYes = isYes;
      if (amount) p.amount = amount;
      if (limitPrice) p.limitPrice = limitPrice;
      if (positionPubkey) p.positionPubkey = positionPubkey;
      return p;
    })
  );

  /* ─── BSC ─── */

  server.tool(
    'bsc_query',
    'Read-only BSC queries: balances, pool data, V3 positions, Infinity pools, MasterChef farms, etc.',
    {
      operation: z.string().describe('Query operation (e.g. "nativeBalance", "erc20Balance", "v3NpmPosition", "infiBinPoolId", etc.)'),
      params: z.record(z.string(), z.any()).optional().describe('Operation-specific parameters'),
    },
    async ({ operation, params }) => {
      const payload = { type: 'CFS_BSC_QUERY', operation };
      if (params) Object.assign(payload, params);
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'bsc_execute',
    'Execute a BSC transaction (swap, LP add/remove, farm claim, transfer). WARNING: Real transaction. Requires wallet unlock.',
    {
      operation: z.string().describe('Execute operation (e.g. "v2SwapExactTokensForTokens", "v3Mint", "infiBinSwapExactIn", etc.)'),
      params: z.record(z.string(), z.any()).optional().describe('Operation-specific parameters'),
      confirm: confirmField,
    },
    writeToolHandler(ctx, ({ operation, params }) => {
      const p = { type: 'CFS_BSC_POOL_EXECUTE', operation };
      if (params) Object.assign(p, params);
      return p;
    })
  );

  server.tool(
    'bsc_sellability_probe',
    'Run a BSC sellability probe: small buy then immediate sell to test the path. WARNING: Real transactions.',
    {
      token: z.string().describe('BEP-20 token address'),
      spendUsdApprox: z.number().optional().describe('Approximate USD to spend (default ~1)'),
      spendBnbWei: z.string().optional().describe('Alternative: exact BNB amount in wei'),
      extra: z.record(z.string(), z.any()).optional(),
      confirm: confirmField,
    },
    writeToolHandler(ctx, ({ token, spendUsdApprox, spendBnbWei, extra }) => {
      const p = { type: 'CFS_BSC_SELLABILITY_PROBE', token };
      if (spendUsdApprox != null) p.spendUsdApprox = spendUsdApprox;
      if (spendBnbWei) p.spendBnbWei = spendBnbWei;
      if (extra) Object.assign(p, extra);
      return p;
    })
  );
}
