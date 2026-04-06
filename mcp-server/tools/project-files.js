/**
 * MCP Tools — Project file management and file-watch integration.
 *
 * Tools that interact with the user's project folder structure,
 * including file-watch status and media import pipeline triggering.
 *
 * NOTE: PROJECT_FOLDER_LIST_DIR and PROJECT_FOLDER_MOVE_FILE are
 * dispatched to the sidepanel (which holds the FS Access handles).
 * Read/write file operations go through the same relay → sidepanel path.
 */
import { z } from 'zod';

export function registerProjectTools(server, ctx) {
  /* ── trigger_file_watch ── */
  server.tool(
    'trigger_file_watch',
    'Manually trigger the file watch poll to scan all project import folders. Equivalent to clicking "Refresh poll" for file watch in the activity panel.',
    {},
    async () => {
      const res = await ctx.sendMessage({ type: 'CFS_FILE_WATCH_REFRESH_NOW' });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res?.ok };
    }
  );

  /* ── get_file_watch_status ── */
  server.tool(
    'get_file_watch_status',
    'Get the current file watch status: last poll time, active projects, and any errors.',
    {},
    async () => {
      const res = await ctx.sendMessage({ type: 'CFS_FILE_WATCH_GET_STATUS' });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res?.ok };
    }
  );

  /* ── run_media_import_pipeline ── */
  server.tool(
    'run_media_import_pipeline',
    'Run the system Media Import Pipeline workflow for a specific project. This scans the import folder, detects media types, moves files to the library, and optionally transcribes audio/video. The workflow must be loaded in the sidepanel.',
    {
      projectId: z.string().describe('Project ID to run the pipeline for'),
    },
    async ({ projectId }) => {
      const res = await ctx.sendMessage({
        type: 'RUN_WORKFLOW',
        workflowId: 'system-media-import-pipeline',
        rows: [{ projectId }],
        autoStart: 'current',
      });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res?.ok };
    }
  );

  /* ── get_project_defaults ── */
  server.tool(
    'get_project_defaults',
    'Read a project\'s defaults.json (colors, logos, description). Reads from uploads/{projectId}/source/defaults.json via the extension storage.',
    {
      projectId: z.string().describe('Project ID'),
    },
    async ({ projectId }) => {
      // Read from extension storage — the sidepanel caches project defaults
      const res = await ctx.readStorage(['cfsProjectDefaults_' + projectId]);
      const data = res?.data?.['cfsProjectDefaults_' + projectId];
      if (data) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, defaults: data }, null, 2) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, defaults: null, hint: 'No defaults cached. Edit the project in the sidepanel first, or the file exists in uploads/' + projectId + '/source/defaults.json' }, null, 2) }] };
    }
  );

  /* ── list_always_on_workflows ── */
  server.tool(
    'list_always_on_workflows',
    'List all workflows with always-on (background automation) enabled, showing their scopes, conditions, and project bindings.',
    {},
    async () => {
      const res = await ctx.readStorage(['workflows']);
      const wfs = res?.data?.workflows;
      if (!wfs || typeof wfs !== 'object') {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, count: 0, workflows: [] }, null, 2) }] };
      }
      const results = [];
      for (const [id, wf] of Object.entries(wfs)) {
        if (!wf?.alwaysOn?.enabled) continue;
        results.push({
          id,
          name: wf.name || id,
          scopes: wf.alwaysOn.scopes || {},
          conditions: wf.alwaysOn.conditions || {},
          projectId: wf.alwaysOn.projectId || null,
          pollIntervalMs: wf.alwaysOn.pollIntervalMs || null,
        });
      }
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, count: results.length, workflows: results }, null, 2) }] };
    }
  );

  /* ── set_always_on_scope ── */
  server.tool(
    'set_always_on_scope',
    'Enable or disable a specific always-on scope on a workflow. Scopes: followingSolanaWatch, followingBscWatch, followingAutomationSolana, followingAutomationBsc, fileWatch, priceRangeWatch, custom.',
    {
      workflowId: z.string().describe('Workflow ID'),
      scope: z.enum(['followingSolanaWatch', 'followingBscWatch', 'followingAutomationSolana', 'followingAutomationBsc', 'fileWatch', 'priceRangeWatch', 'custom']).describe('Scope name'),
      enabled: z.boolean().describe('Enable or disable this scope'),
      projectId: z.string().optional().describe('Project ID to bind (for fileWatch scope)'),
      pollIntervalMs: z.number().int().min(1000).optional().describe('Poll interval in ms (for fileWatch)'),
    },
    async ({ workflowId, scope, enabled, projectId, pollIntervalMs }) => {
      const storageRes = await ctx.readStorage(['workflows']);
      const wfs = storageRes?.data?.workflows;
      if (!wfs || !wfs[workflowId]) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'Workflow not found: ' + workflowId }, null, 2) }], isError: true };
      }

      const wf = wfs[workflowId];
      if (!wf.alwaysOn) wf.alwaysOn = { enabled: true, scopes: {}, conditions: {} };
      if (!wf.alwaysOn.scopes) wf.alwaysOn.scopes = {};
      wf.alwaysOn.enabled = true;
      wf.alwaysOn.scopes[scope] = enabled;
      if (projectId !== undefined) wf.alwaysOn.projectId = projectId;
      if (pollIntervalMs !== undefined) wf.alwaysOn.pollIntervalMs = pollIntervalMs;

      // Save back via storage write
      const writeRes = await ctx.sendMessage({
        type: 'STORAGE_WRITE',
        key: 'workflows',
        value: wfs,
      });

      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, workflowId, scope, enabled, alwaysOn: wf.alwaysOn }, null, 2) }] };
    }
  );
}
