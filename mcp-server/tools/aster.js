/**
 * MCP Tools — Aster DEX (futures + spot)
 */
import { z } from 'zod';

const confirmField = z.boolean().optional().describe('Set to true to execute (required when dry-run is enabled)');

export function registerAsterTools(server, ctx) {
  /* ── Public market data (no auth needed on Aster side) ── */

  server.tool(
    'aster_futures_market',
    'Get Aster futures public market data: ticker, depth, klines, exchangeInfo, etc.',
    {
      operation: z.string().describe('Market operation (e.g. "ping", "time", "exchangeInfo", "ticker24hr", "depth", "klines", "markPrice", "fundingRate")'),
      params: z.record(z.string(), z.any()).optional().describe('Operation-specific query params (e.g. { symbol: "BTCUSDT" })'),
    },
    async ({ operation, params }) => {
      const gateErr = await ctx.cryptoGate.guard('aster_futures_market');
      if (gateErr) return gateErr;
      const payload = { type: 'CFS_ASTER_FUTURES', asterCategory: 'market', operation };
      if (params) Object.assign(payload, params);
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'aster_spot_market',
    'Get Aster spot public market data.',
    {
      operation: z.string().describe('Spot market operation (e.g. "exchangeInfo", "ticker24hr", "depth", "klines")'),
      params: z.record(z.string(), z.any()).optional(),
    },
    async ({ operation, params }) => {
      const gateErr = await ctx.cryptoGate.guard('aster_spot_market');
      if (gateErr) return gateErr;
      const payload = { type: 'CFS_ASTER_FUTURES', asterCategory: 'spotMarket', operation };
      if (params) Object.assign(payload, params);
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── Account reads (signed, no trading) ── */

  server.tool(
    'aster_futures_account',
    'Get Aster futures account data: positions, balance, open orders, income history, user stream URL, etc.',
    {
      operation: z.string().describe('Account operation (e.g. "balance", "positionRisk", "openOrders", "queryOrder", "allOrders", "income", "userStreamUrl")'),
      params: z.record(z.string(), z.any()).optional(),
    },
    async ({ operation, params }) => {
      const gateErr = await ctx.cryptoGate.guard('aster_futures_account');
      if (gateErr) return gateErr;
      const payload = { type: 'CFS_ASTER_FUTURES', asterCategory: 'account', operation };
      if (params) Object.assign(payload, params);
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'aster_spot_account',
    'Get Aster spot account data: balances, orders, trades, futures transfer, etc.',
    {
      operation: z.string().describe('Spot account operation (e.g. "account", "openOrders", "queryOrder", "myTrades", "userStreamUrl", "futuresTransferHistory")'),
      params: z.record(z.string(), z.any()).optional(),
    },
    async ({ operation, params }) => {
      const gateErr = await ctx.cryptoGate.guard('aster_spot_account');
      if (gateErr) return gateErr;
      const payload = { type: 'CFS_ASTER_FUTURES', asterCategory: 'spotAccount', operation };
      if (params) Object.assign(payload, params);
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── Analysis (composite reads) ── */

  server.tool(
    'aster_futures_analysis',
    'Composite Aster futures analysis reads: decisionQuote, feesAndFunding, positionContext, rowSnapshot.',
    {
      operation: z.string().describe('Analysis operation (e.g. "decisionQuote", "feesAndFunding", "positionContext", "rowSnapshot")'),
      params: z.record(z.string(), z.any()).optional(),
    },
    async ({ operation, params }) => {
      const gateErr = await ctx.cryptoGate.guard('aster_futures_analysis');
      if (gateErr) return gateErr;
      const payload = { type: 'CFS_ASTER_FUTURES', asterCategory: 'analysis', operation };
      if (params) Object.assign(payload, params);
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── Trading (signed writes) ── */

  function asterTrade(name, desc, category, schema, buildPayload) {
    server.tool(name, desc, { ...schema, confirm: confirmField }, async (args) => {
      const gateErr = await ctx.cryptoGate.guard(name);
      if (gateErr) return gateErr;
      const dryRunRes = await ctx.readStorage(['cfsMcpDryRunConfirmation']);
      const dryRun = !(dryRunRes && dryRunRes.data && dryRunRes.data.cfsMcpDryRunConfirmation === false);
      const payload = buildPayload(args);
      if (dryRun && !args.confirm) {
        return { content: [{ type: 'text', text: JSON.stringify({ dryRun: true, message: 'Review and call again with confirm: true.', payload }, null, 2) }] };
      }
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    });
  }

  asterTrade(
    'aster_futures_trade',
    'Execute Aster futures trade operations: place orders, cancel orders, modify SL/TP, set leverage/margin, batch orders. WARNING: Real trades. Requires "Allow futures trading" in Settings.',
    'trade',
    {
      operation: z.string().describe('Trade operation (e.g. "placeOrder", "cancelOrder", "cancelAllOpenOrders", "replaceStopLoss", "replaceTakeProfit", "batchOrders", "leverage", "marginType", "positionMargin", "countdownCancelAll")'),
      params: z.record(z.string(), z.any()).optional().describe('Operation-specific fields (symbol, side, orderType, quantity, price, etc.)'),
      dryRunOrder: z.boolean().optional().describe('Set to true for placeOrder dry-run (extension-level, validates without submitting)'),
    },
    ({ operation, params, dryRunOrder }) => {
      const p = { type: 'CFS_ASTER_FUTURES', asterCategory: 'trade', operation };
      if (params) Object.assign(p, params);
      if (dryRunOrder) p.dryRun = true;
      return p;
    }
  );

  asterTrade(
    'aster_spot_trade',
    'Execute Aster spot trade operations: place orders, cancel, etc. WARNING: Real trades. Requires "Allow spot trading" in Settings.',
    'spotTrade',
    {
      operation: z.string().describe('Spot trade operation (e.g. "placeOrder", "cancelOrder", "cancelAllOpenOrders")'),
      params: z.record(z.string(), z.any()).optional(),
    },
    ({ operation, params }) => {
      const p = { type: 'CFS_ASTER_FUTURES', asterCategory: 'spotTrade', operation };
      if (params) Object.assign(p, params);
      return p;
    }
  );

  /* ── User stream WebSocket wait ── */

  server.tool(
    'aster_user_stream_wait',
    'Wait for a specific event on an Aster user-data WebSocket (futures or spot). Holds the offscreen slot until a match or timeout.',
    {
      wsUrl: z.string().describe('WebSocket URL (wss://fstream.asterdex.com/ws/<listenKey> or wss://sstream.asterdex.com/ws/<listenKey>)'),
      matchEvent: z.string().optional().describe('Match by "e" field (e.g. "ORDER_TRADE_UPDATE")'),
      matchSubstring: z.string().optional().describe('Raw frame must contain this substring'),
      timeoutMs: z.number().int().min(1000).max(600000).optional().describe('Timeout in ms (default 120000)'),
      maxMessages: z.number().int().min(1).max(10000).optional().describe('Max messages before timeout (default 2000)'),
      skipEventTypes: z.string().optional().describe('Comma-separated event types to skip'),
      listenKey: z.string().optional().describe('Listen key for keepalive'),
      listenKeyKeepaliveIntervalMs: z.number().int().min(60000).max(3600000).optional().describe('Keepalive interval'),
    },
    async ({ wsUrl, matchEvent, matchSubstring, timeoutMs, maxMessages, skipEventTypes, listenKey, listenKeyKeepaliveIntervalMs }) => {
      const gateErr = await ctx.cryptoGate.guard('aster_user_stream_wait');
      if (gateErr) return gateErr;
      const payload = { type: 'CFS_ASTER_USER_STREAM_WAIT', wsUrl };
      if (matchEvent) payload.matchEvent = matchEvent;
      if (matchSubstring) payload.matchSubstring = matchSubstring;
      if (timeoutMs != null) payload.timeoutMs = timeoutMs;
      if (maxMessages != null) payload.maxMessages = maxMessages;
      if (skipEventTypes) payload.skipEventTypes = skipEventTypes;
      if (listenKey) payload.listenKey = listenKey;
      if (listenKeyKeepaliveIntervalMs != null) payload.listenKeyKeepaliveIntervalMs = listenKeyKeepaliveIntervalMs;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );
}
