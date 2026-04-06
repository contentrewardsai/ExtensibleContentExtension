/**
 * MCP Tools — Scheduling management
 */
import { z } from 'zod';

export function registerSchedulingTools(server, ctx) {
  /* ── list_scheduled_runs ── */
  server.tool(
    'list_scheduled_runs',
    'List all scheduled and recurring workflow runs.',
    {},
    async () => {
      const res = await ctx.sendMessage({ type: 'GET_SCHEDULED_WORKFLOW_RUNS' });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── schedule_workflow_run ── */
  server.tool(
    'schedule_workflow_run',
    'Schedule one-time or recurring workflow runs. Entries are merged into the existing schedule list.',
    {
      entries: z.array(z.object({
        workflowId: z.string().describe('Workflow ID to schedule'),
        workflowName: z.string().optional().describe('Human-readable name'),
        type: z.enum(['once', 'recurring']).optional().describe('"once" for one-time, "recurring" for repeating'),
        runAt: z.number().optional().describe('Unix timestamp (ms) for one-time runs'),
        timezone: z.string().optional().describe('Timezone for recurring runs (e.g. "America/New_York")'),
        time: z.string().optional().describe('Time of day for recurring runs (HH:MM format)'),
        pattern: z.enum(['daily', 'weekdays', 'weekends', 'interval']).optional().describe('Recurrence pattern'),
        intervalMinutes: z.number().min(1).optional().describe('Interval in minutes when pattern is "interval"'),
        row: z.record(z.string(), z.any()).optional().describe('Row data for variable substitution'),
      })).describe('Array of schedule entries (max 500)'),
      replaceAll: z.boolean().optional().describe('If true, replace all existing entries; otherwise append'),
    },
    async ({ entries, replaceAll }) => {
      const payload = { type: 'MERGE_SCHEDULED_WORKFLOW_RUNS', entries };
      if (replaceAll != null) payload.replaceAll = replaceAll;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── remove_scheduled_runs ── */
  server.tool(
    'remove_scheduled_runs',
    'Remove scheduled workflow runs by their IDs.',
    {
      ids: z.array(z.string().min(1).max(256)).min(1).max(200).describe('Array of schedule entry IDs to remove'),
    },
    async ({ ids }) => {
      const res = await ctx.sendMessage({ type: 'REMOVE_SCHEDULED_WORKFLOW_RUNS', ids });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );
}
