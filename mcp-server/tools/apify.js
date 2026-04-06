/**
 * MCP Tools — Apify automation
 */
import { z } from 'zod';

export function registerApifyTools(server, ctx) {
  server.tool(
    'apify_run_actor',
    'Run an Apify actor or task. Supports sync (returns data immediately) and async (returns run info) modes.',
    {
      targetType: z.enum(['actor', 'task']).describe('Whether to run an actor or a task'),
      resourceId: z.string().max(512).describe('Actor/task identifier (e.g. "username~actor-name")'),
      mode: z.enum(['syncDataset', 'syncOutput', 'asyncPoll']).optional().describe('Execution mode'),
      input: z.record(z.string(), z.any()).optional().describe('Actor input (JSON object)'),
      token: z.string().max(2048).optional().describe('Apify API token (omit to use saved token from Settings)'),
      syncTimeoutMs: z.number().int().min(1000).max(600000).optional().describe('Sync mode timeout'),
      datasetMaxItems: z.number().int().min(0).max(50000000).optional().describe('Max dataset items to return'),
      extra: z.record(z.string(), z.any()).optional().describe('Additional Apify options'),
    },
    async ({ targetType, resourceId, mode, input, token, syncTimeoutMs, datasetMaxItems, extra }) => {
      const payload = { type: 'APIFY_RUN', targetType, resourceId };
      if (mode) payload.mode = mode;
      if (input) payload.input = input;
      if (token) payload.token = token;
      if (syncTimeoutMs != null) payload.syncTimeoutMs = syncTimeoutMs;
      if (datasetMaxItems != null) payload.datasetMaxItems = datasetMaxItems;
      if (extra) Object.assign(payload, extra);
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'apify_run_start',
    'Start an Apify actor/task run asynchronously. Returns the run ID for later polling.',
    {
      targetType: z.enum(['actor', 'task']).describe('Actor or task'),
      resourceId: z.string().max(512).describe('Actor/task identifier'),
      input: z.record(z.string(), z.any()).optional().describe('Actor input'),
      token: z.string().max(2048).optional(),
      extra: z.record(z.string(), z.any()).optional(),
    },
    async ({ targetType, resourceId, input, token, extra }) => {
      const payload = { type: 'APIFY_RUN_START', targetType, resourceId };
      if (input) payload.input = input;
      if (token) payload.token = token;
      if (extra) Object.assign(payload, extra);
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'apify_run_wait',
    'Wait for a running Apify run to complete, optionally fetching the dataset or output afterwards.',
    {
      runId: z.string().describe('Apify run ID to wait for'),
      fetchAfter: z.enum(['none', 'dataset', 'output']).optional().describe('What to fetch after completion'),
      asyncMaxWaitMs: z.number().int().min(1000).max(7200000).optional().describe('Max wait time (default 120s)'),
      pollIntervalMs: z.number().int().min(0).max(300000).optional().describe('Polling interval'),
      datasetMaxItems: z.number().int().optional(),
      token: z.string().max(2048).optional(),
      extra: z.record(z.string(), z.any()).optional(),
    },
    async ({ runId, fetchAfter, asyncMaxWaitMs, pollIntervalMs, datasetMaxItems, token, extra }) => {
      const payload = { type: 'APIFY_RUN_WAIT', runId };
      if (fetchAfter) payload.fetchAfter = fetchAfter;
      if (asyncMaxWaitMs != null) payload.asyncMaxWaitMs = asyncMaxWaitMs;
      if (pollIntervalMs != null) payload.pollIntervalMs = pollIntervalMs;
      if (datasetMaxItems != null) payload.datasetMaxItems = datasetMaxItems;
      if (token) payload.token = token;
      if (extra) Object.assign(payload, extra);
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'apify_dataset_items',
    'Fetch items from an Apify dataset by dataset ID.',
    {
      datasetId: z.string().describe('Apify dataset ID'),
      datasetMaxItems: z.number().int().optional().describe('Max items to fetch'),
      token: z.string().max(2048).optional(),
      extra: z.record(z.string(), z.any()).optional(),
    },
    async ({ datasetId, datasetMaxItems, token, extra }) => {
      const payload = { type: 'APIFY_DATASET_ITEMS', datasetId };
      if (datasetMaxItems != null) payload.datasetMaxItems = datasetMaxItems;
      if (token) payload.token = token;
      if (extra) Object.assign(payload, extra);
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'apify_test_token',
    'Test an Apify API token to verify it is valid.',
    {
      token: z.string().max(2048).optional().describe('Token to test (omit to test the saved token)'),
    },
    async ({ token }) => {
      const payload = { type: 'APIFY_TEST_TOKEN' };
      if (token) payload.token = token;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );
}
