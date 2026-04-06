/**
 * MCP Tools — Workflow management (write operations only)
 *
 * Read operations (list, get, history) moved to MCP Resources (tools/resources.js).
 */
import { z } from 'zod';

export function registerWorkflowTools(server, ctx) {
  /* ── run_workflow ── */
  server.tool(
    'run_workflow',
    'Run a workflow with optional row data. The workflow will run in the sidepanel.',
    {
      workflowId: z.string().describe('ID of the workflow to run'),
      rows: z.array(z.record(z.string(), z.any())).optional().describe('Array of row objects to use as input data'),
      startIndex: z.number().int().min(0).optional().describe('Index of the first row to start from (default 0)'),
      autoStart: z.enum(['all', 'current']).optional().describe('Auto-start mode: "all" runs all rows, "current" runs just the current row'),
    },
    async ({ workflowId, rows, startIndex, autoStart }) => {
      const payload = { type: 'RUN_WORKFLOW', workflowId };
      if (rows) payload.rows = rows;
      if (startIndex != null) payload.startIndex = startIndex;
      if (autoStart) payload.autoStart = autoStart;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── set_imported_rows ── */
  server.tool(
    'set_imported_rows',
    'Set the sidepanel imported rows and optionally select a workflow.',
    {
      rows: z.array(z.record(z.string(), z.any())).describe('Array of row objects for variable substitution'),
      workflowId: z.string().optional().describe('Optional workflow ID to select in the dropdown'),
    },
    async ({ rows, workflowId }) => {
      const payload = { type: 'SET_IMPORTED_ROWS', rows };
      if (workflowId) payload.workflowId = workflowId;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── clear_imported_rows ── */
  server.tool(
    'clear_imported_rows',
    'Clear all imported rows from the sidepanel and cancel any pending programmatic run.',
    {},
    async () => {
      const res = await ctx.sendMessage({ type: 'CLEAR_IMPORTED_ROWS' });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );
  /* ── run_generator ── */
  server.tool(
    'run_generator',
    'Generate content (image, video, audio, text) from a template. Browse extensible://generators to see available templates and their merge fields. Pass inputMap to set merge field values.',
    {
      pluginId: z.string().describe('Template ID (e.g. "ad-apple-notes", "ad-facebook"). Browse extensible://generators for the list.'),
      inputMap: z.record(z.string(), z.any()).describe('Map of merge field names to values. Use the merge field "find" values from the template.'),
      entry: z.string().optional().describe('Optional entry point override'),
    },
    async ({ pluginId, inputMap, entry }) => {
      const payload = { type: 'RUN_GENERATOR', pluginId, inputs: inputMap || {} };
      if (entry) payload.entry = entry;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── create_workflow ── */
  server.tool(
    'create_workflow',
    'Create a new workflow with steps. Browse extensible://steps for available step types and extensible://steps/{id} for step configuration. Each step is an action object with at minimum a "type" field.',
    {
      name: z.string().describe('Human-readable workflow name'),
      id: z.string().optional().describe('Workflow ID (auto-generated UUID if omitted)'),
      actions: z.array(z.record(z.string(), z.any())).describe('Array of step action objects. Each must have { type: "stepType", ...config }. Browse extensible://steps/{stepType} for defaultAction and formSchema.'),
      urlPattern: z.string().optional().describe('URL pattern the workflow runs on (e.g. "https://example.com/*")'),
    },
    async ({ name, id, actions, urlPattern }) => {
      const wfId = id || crypto.randomUUID();
      const payload = {
        type: 'CFS_MCP_SAVE_WORKFLOW',
        id: wfId,
        name,
        actions,
      };
      if (urlPattern) payload.urlPattern = urlPattern;
      const res = await ctx.sendMessage(payload);
      if (res.ok) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, workflowId: wfId, message: 'Workflow created. Use run_workflow to execute it, or browse extensible://workflows/' + wfId + ' to verify.' }, null, 2) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: true };
    }
  );

  /* ── update_workflow ── */
  server.tool(
    'update_workflow',
    'Update an existing workflow. Pass only the fields you want to change. Use merge mode to preserve fields not specified.',
    {
      id: z.string().describe('Workflow ID to update'),
      name: z.string().optional().describe('New workflow name'),
      actions: z.array(z.record(z.string(), z.any())).optional().describe('New step actions (replaces all existing steps)'),
      urlPattern: z.string().optional().describe('New URL pattern'),
    },
    async ({ id, name, actions, urlPattern }) => {
      const payload = {
        type: 'CFS_MCP_SAVE_WORKFLOW',
        id,
        merge: true,
      };
      if (name != null) payload.name = name;
      if (actions) payload.actions = actions;
      if (urlPattern !== undefined) payload.urlPattern = urlPattern;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── delete_workflow ── */
  server.tool(
    'delete_workflow',
    'Delete a workflow by ID. This is permanent.',
    {
      id: z.string().describe('Workflow ID to delete'),
    },
    async ({ id }) => {
      const res = await ctx.sendMessage({ type: 'CFS_MCP_DELETE_WORKFLOW', id });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );
}
