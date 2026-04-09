/**
 * MCP Subscriptions — Real-time data streaming via periodic polling
 *
 * Subscriptions poll data through the relay WebSocket at configurable intervals.
 * When data changes, the new value is returned on the next tool call or via
 * resource subscription notifications.
 *
 * Subscription types:
 *  - tokenPrice: poll Jupiter/CoinGecko for token price
 *  - walletBalance: poll Solana/BSC RPC for wallet balances
 *  - dlmmPosition: poll Meteora DLMM position range status
 *  - clmmPosition: poll Raydium CLMM position range status
 *  - alwaysOnStatus: poll always-on workflow status
 *  - watchActivity: poll Following watch buffer for new txs
 *  - asterPosition: poll Aster futures position status
 */
import { z } from 'zod';

/** Active subscriptions. */
const subscriptions = new Map();
let subIdCounter = 0;

/** Default poll intervals per type (seconds). */
const DEFAULT_INTERVALS = {
  tokenPrice: 10,
  walletBalance: 30,
  dlmmPosition: 60,
  clmmPosition: 60,
  alwaysOnStatus: 5,
  watchActivity: 15,
  asterPosition: 30,
};

function makeSubId() {
  return 'sub_' + (++subIdCounter) + '_' + Date.now().toString(36);
}

/** Build the poll function for a given subscription type. */
function buildPoller(ctx, type, params) {
  switch (type) {
    case 'tokenPrice':
      return async () => {
        const mint = params.mint || '';
        const chain = (params.chain || 'solana').toLowerCase();
        if (chain === 'solana' && mint) {
          /* Use Jupiter Price V3 API for accurate real-time USD prices */
          const res = await ctx.sendMessage({
            type: 'CFS_JUPITER_PRICE_V3',
            mintAddresses: mint,
          });
          if (res && res.ok && res.prices) {
            const price = res.prices[mint];
            return {
              type: 'tokenPrice', mint, chain,
              priceUsd: price ? price.price : null,
              buyPriceUsd: price ? price.buyPrice : null,
              sellPriceUsd: price ? price.sellPrice : null,
              confidence: price ? price.confidenceLevel : null,
              timestamp: new Date().toISOString(),
            };
          }
          return res;
        }
        return { type: 'tokenPrice', mint, chain, error: 'Use solana chain with a mint address' };
      };

    case 'walletBalance':
      return async () => {
        const address = params.address || '';
        const chain = (params.chain || 'solana').toLowerCase();
        if (chain === 'solana') {
          const res = await ctx.sendMessage({
            type: 'CFS_SOLANA_RPC_READ',
            readKind: 'nativeBalance',
            address,
          });
          return res;
        }
        if (chain === 'bsc') {
          const res = await ctx.sendMessage({
            type: 'CFS_BSC_QUERY',
            operation: 'nativeBalance',
            address,
          });
          return res;
        }
        return { error: 'Unsupported chain: ' + chain };
      };

    case 'dlmmPosition':
      return async () => {
        const res = await ctx.sendMessage({
          type: 'CFS_METEORA_DLMM_RANGE_CHECK',
          lbPair: params.poolAddress || params.lbPair || '',
          position: params.positionAddress || params.position || '',
          cluster: params.cluster || 'mainnet-beta',
          rpcUrl: params.rpcUrl || undefined,
        });
        return res;
      };

    case 'clmmPosition':
      return async () => {
        const res = await ctx.sendMessage({
          type: 'CFS_RAYDIUM_CLMM_RANGE_CHECK',
          poolId: params.poolId || '',
          positionNftMint: params.positionNftMint || '',
          cluster: params.cluster || 'mainnet-beta',
          rpcUrl: params.rpcUrl || undefined,
        });
        return res;
      };

    case 'alwaysOnStatus':
      return async () => {
        const wfId = params.workflowId || '';
        const storageRes = await ctx.readStorage(['workflows']);
        const wf = storageRes?.data?.workflows?.[wfId];
        if (!wf) return { error: 'Workflow not found: ' + wfId };
        return {
          workflowId: wfId,
          name: wf.name,
          alwaysOn: wf.alwaysOn || { enabled: false },
          lastRun: wf.runs?.[wf.runs.length - 1] || null,
        };
      };

    case 'watchActivity':
      return async () => {
        const chain = (params.chain || 'solana').toLowerCase();
        const msgType = chain === 'bsc'
          ? 'CFS_BSC_WATCH_GET_ACTIVITY'
          : 'CFS_SOLANA_WATCH_GET_ACTIVITY';
        const res = await ctx.sendMessage({ type: msgType });
        return res;
      };

    case 'asterPosition':
      return async () => {
        const res = await ctx.sendMessage({
          type: 'CFS_ASTER_FUTURES',
          asterCategory: 'account',
          operation: 'positionRisk',
        });
        return res;
      };

    default:
      return async () => ({ error: 'Unknown subscription type: ' + type });
  }
}

/** Serialize subscriptions for the list tool / settings display. */
function serializeSubscriptions() {
  const list = [];
  for (const [id, sub] of subscriptions) {
    list.push({
      id,
      type: sub.type,
      params: sub.params,
      intervalSeconds: sub.intervalMs / 1000,
      createdAt: sub.createdAt,
      pollCount: sub.pollCount,
      lastPollAt: sub.lastPollAt,
      lastError: sub.lastError,
    });
  }
  return list;
}

/** Get subscription health color based on count. */
function getHealthIndicator() {
  const count = subscriptions.size;
  if (count <= 10) return { level: 'green', label: '🟢', count };
  if (count <= 20) return { level: 'yellow', label: '🟡', count };
  return { level: 'red', label: '🔴', count };
}

export function registerSubscriptions(server, ctx) {
  /* ── subscribe ── */
  server.tool(
    'subscribe',
    'Subscribe to real-time data updates. Returns a subscription ID. Data is polled at the specified interval. Use list_subscriptions to see latest data.',
    {
      type: z.enum(['tokenPrice', 'walletBalance', 'dlmmPosition', 'clmmPosition',
                    'alwaysOnStatus', 'watchActivity', 'asterPosition'])
        .describe('Type of data to subscribe to'),
      params: z.record(z.string(), z.any())
        .describe('Parameters for the subscription (e.g. { mint, chain } for tokenPrice, { address, chain } for walletBalance, { poolAddress } for dlmmPosition, { workflowId } for alwaysOnStatus, { chain } for watchActivity)'),
      intervalSeconds: z.number().min(5).max(3600).optional()
        .describe('Poll interval in seconds (min 5, max 3600). Defaults vary by type.'),
    },
    async ({ type, params, intervalSeconds }) => {
      const id = makeSubId();
      const intervalMs = (intervalSeconds || DEFAULT_INTERVALS[type] || 30) * 1000;
      const poller = buildPoller(ctx, type, params);

      // Run first poll immediately
      let lastData = null;
      let lastError = null;
      try {
        lastData = await poller();
      } catch (e) {
        lastError = e.message || 'Poll failed';
      }

      const sub = {
        type,
        params,
        intervalMs,
        poller,
        lastData,
        lastError,
        pollCount: 1,
        lastPollAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        timer: setInterval(async () => {
          try {
            const newData = await poller();
            sub.lastData = newData;
            sub.lastError = null;
          } catch (e) {
            sub.lastError = e.message || 'Poll failed';
          }
          sub.pollCount++;
          sub.lastPollAt = new Date().toISOString();
        }, intervalMs),
      };

      subscriptions.set(id, sub);

      const health = getHealthIndicator();
      const warning = health.level !== 'green'
        ? ` Warning: ${health.label} ${health.count} active subscriptions.`
        : '';

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: true,
            subscriptionId: id,
            type,
            intervalSeconds: intervalMs / 1000,
            initialData: lastData,
            initialError: lastError,
            activeSubscriptions: health.count,
            message: 'Subscription created. Use list_subscriptions to get latest data, or unsubscribe to stop.' + warning,
          }, null, 2),
        }],
      };
    }
  );

  /* ── unsubscribe ── */
  server.tool(
    'unsubscribe',
    'Stop a data subscription by ID, or pass "all" to stop all subscriptions.',
    {
      subscriptionId: z.string().describe('Subscription ID to stop, or "all" to stop all'),
    },
    async ({ subscriptionId }) => {
      if (subscriptionId === 'all') {
        const count = subscriptions.size;
        for (const [, sub] of subscriptions) {
          clearInterval(sub.timer);
        }
        subscriptions.clear();
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, message: `Stopped all ${count} subscription(s).` }, null, 2) }] };
      }
      const sub = subscriptions.get(subscriptionId);
      if (!sub) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'Subscription not found: ' + subscriptionId }, null, 2) }], isError: true };
      }
      clearInterval(sub.timer);
      subscriptions.delete(subscriptionId);
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, unsubscribed: subscriptionId, remaining: subscriptions.size }, null, 2) }] };
    }
  );

  /* ── list_subscriptions ── */
  server.tool(
    'list_subscriptions',
    'List all active subscriptions with their latest data. This is the primary way to read streamed data.',
    {},
    async () => {
      const list = serializeSubscriptions();
      const health = getHealthIndicator();

      // Include latest data for each subscription
      const withData = list.map(sub => {
        const live = subscriptions.get(sub.id);
        return {
          ...sub,
          latestData: live?.lastData || null,
          latestError: live?.lastError || null,
        };
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            health: health,
            subscriptions: withData,
          }, null, 2),
        }],
      };
    }
  );

  /* ── get_subscription_data ── */
  server.tool(
    'get_subscription_data',
    'Get the latest data from a specific subscription.',
    {
      subscriptionId: z.string().describe('Subscription ID'),
    },
    async ({ subscriptionId }) => {
      const sub = subscriptions.get(subscriptionId);
      if (!sub) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'Subscription not found' }, null, 2) }], isError: true };
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            id: subscriptionId,
            type: sub.type,
            params: sub.params,
            pollCount: sub.pollCount,
            lastPollAt: sub.lastPollAt,
            data: sub.lastData,
            error: sub.lastError,
          }, null, 2),
        }],
      };
    }
  );
}

/** Export for Settings page API. */
export function getSubscriptionStatus() {
  return {
    health: getHealthIndicator(),
    subscriptions: serializeSubscriptions(),
  };
}

/** Clear all subscriptions (called on server shutdown). */
export function clearAllSubscriptions() {
  for (const [, sub] of subscriptions) {
    clearInterval(sub.timer);
  }
  subscriptions.clear();
}
