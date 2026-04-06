/**
 * MCP Tools — Following / Pulse (write operations only)
 *
 * Read operations (profiles, watch activity, automation status) moved to MCP Resources.
 */
import { z } from 'zod';

export function registerFollowingTools(server, ctx) {
  /* ── mutate_following ── */
  server.tool(
    'mutate_following',
    'Create, update, or delete a Following profile or account. Requires the sidepanel to be open.',
    {
      action: z.enum(['createProfile', 'updateProfile', 'deleteProfile', 'createDetail', 'updateDetail', 'deleteDetail'])
        .describe('Mutation action to perform'),
      profileId: z.string().optional().describe('Profile ID (required for update/delete and detail operations)'),
      data: z.record(z.string(), z.any()).optional().describe('Data for the create/update operation'),
    },
    async ({ action, profileId, data }) => {
      const payload = { type: 'MUTATE_FOLLOWING', action };
      if (profileId) payload.profileId = profileId;
      if (data) Object.assign(payload, data);
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── refresh_solana_watch ── */
  server.tool(
    'refresh_solana_watch',
    'Force an immediate Solana watch poll cycle to check for new transactions.',
    {},
    async () => {
      const res = await ctx.sendMessage({ type: 'CFS_SOLANA_WATCH_REFRESH_NOW' });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── refresh_bsc_watch ── */
  server.tool(
    'refresh_bsc_watch',
    'Force an immediate BSC watch poll cycle to check for new transactions.',
    {},
    async () => {
      const res = await ctx.sendMessage({ type: 'CFS_BSC_WATCH_REFRESH_NOW' });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── clear_solana_watch_activity ── */
  server.tool(
    'clear_solana_watch_activity',
    'Clear all Solana watch activity history.',
    {},
    async () => {
      const res = await ctx.sendMessage({ type: 'CFS_SOLANA_WATCH_CLEAR_ACTIVITY' });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── clear_bsc_watch_activity ── */
  server.tool(
    'clear_bsc_watch_activity',
    'Clear all BSC watch activity history.',
    {},
    async () => {
      const res = await ctx.sendMessage({ type: 'CFS_BSC_WATCH_CLEAR_ACTIVITY' });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );
}
