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
      const writeRes = await ctx.writeStorage('workflows', wfs);

      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, workflowId, scope, enabled, alwaysOn: wf.alwaysOn }, null, 2) }] };
    }
  );

  /* ══════════════════════════════════════════════════════════════
   * Project Management Tools
   * ══════════════════════════════════════════════════════════════ */

  /* ── list_projects ── */
  server.tool(
    'list_projects',
    'List all projects (local + remote if logged in). Returns project IDs, names, and the currently selected project.',
    {},
    async () => {
      const res = await ctx.readStorage(['localProjects', 'selectedProjectId', 'selectedProject']);
      const data = res?.data || {};
      const localProjects = Array.isArray(data.localProjects) ? data.localProjects : [];
      return {
        content: [{ type: 'text', text: JSON.stringify({
          ok: true,
          selectedProjectId: data.selectedProjectId || null,
          selectedProject: data.selectedProject || null,
          localProjects,
          count: localProjects.length,
        }, null, 2) }],
      };
    }
  );

  /* ── get_selected_project ── */
  server.tool(
    'get_selected_project',
    'Get the currently selected project ID and metadata.',
    {},
    async () => {
      const res = await ctx.readStorage(['selectedProjectId', 'selectedProject']);
      const data = res?.data || {};
      return {
        content: [{ type: 'text', text: JSON.stringify({
          ok: true,
          projectId: data.selectedProjectId || null,
          project: data.selectedProject || null,
        }, null, 2) }],
      };
    }
  );

  /* ── select_project ── */
  server.tool(
    'select_project',
    'Select a project by ID. This changes the active project used by the generator, file watch, and other project-scoped features.',
    {
      projectId: z.string().describe('Project ID to select (must exist in the project list)'),
    },
    async ({ projectId }) => {
      // Read projects to find the matching one
      const res = await ctx.readStorage(['localProjects']);
      const projects = Array.isArray(res?.data?.localProjects) ? res.data.localProjects : [];
      const proj = projects.find(p => p.id === projectId);
      const projectObj = proj || { id: projectId, name: projectId, industries: [], added_by: '' };
      // Write the selection
      await ctx.writeStorage('selectedProjectId', projectId);
      await ctx.writeStorage('selectedProject', projectObj);
      // Ensure project folder structure
      try {
        await ctx.sendMessage({ type: 'CFS_PROJECT_ENSURE_DIRS', paths: [
          'uploads/' + projectId,
          'uploads/' + projectId + '/generations',
          'uploads/' + projectId + '/posts',
          'uploads/' + projectId + '/templates',
          'uploads/' + projectId + '/source',
          'uploads/' + projectId + '/source/logos',
          'uploads/' + projectId + '/source/media',
          'uploads/' + projectId + '/source/media/import',
          'uploads/' + projectId + '/source/media/library',
        ]});
      } catch (_) {}
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, projectId, project: projectObj }, null, 2) }] };
    }
  );

  /* ── create_project ── */
  server.tool(
    'create_project',
    'Create a new local project. Creates the project entry and its folder structure (uploads/{id}/source, generations, posts, templates, etc.).',
    {
      name: z.string().describe('Project name'),
      id: z.string().optional().describe('Custom project ID (auto-generated UUID if omitted)'),
      description: z.string().optional().default(''),
      colors: z.object({
        primary: z.string().optional(),
        secondary: z.string().optional(),
        accent: z.string().optional(),
        background: z.string().optional(),
        text: z.string().optional(),
      }).optional(),
    },
    async ({ name, id, description, colors }) => {
      const projectId = id || crypto.randomUUID();
      // Read existing projects
      const res = await ctx.readStorage(['localProjects']);
      const projects = Array.isArray(res?.data?.localProjects) ? [...res.data.localProjects] : [];
      // Check for duplicate
      if (projects.some(p => p.id === projectId)) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'Project ID already exists: ' + projectId }) }], isError: true };
      }
      const newProject = { id: projectId, name, industries: [], added_by: 'mcp' };
      projects.push(newProject);
      // Save to storage and file
      await ctx.writeStorage('localProjects', projects);
      try {
        await ctx.sendMessage({ type: 'CFS_PROJECT_WRITE_FILE', relativePath: 'config/projects.json', content: JSON.stringify(projects, null, 2) });
      } catch (_) {}
      // Create folder structure
      try {
        await ctx.sendMessage({ type: 'CFS_PROJECT_ENSURE_DIRS', paths: [
          'uploads/' + projectId,
          'uploads/' + projectId + '/generations',
          'uploads/' + projectId + '/posts',
          'uploads/' + projectId + '/templates',
          'uploads/' + projectId + '/source',
          'uploads/' + projectId + '/source/logos',
          'uploads/' + projectId + '/source/media',
          'uploads/' + projectId + '/source/media/import',
          'uploads/' + projectId + '/source/media/library',
        ]});
      } catch (_) {}
      // Write defaults.json
      const defaults = {
        schemaVersion: 2,
        name,
        description: description || '',
        colors: {
          primary: colors?.primary || '#6C5CE7',
          secondary: colors?.secondary || '#A29BFE',
          accent: colors?.accent || '#FD79A8',
          background: colors?.background || '#1A1A2E',
          text: colors?.text || '#FFFFFF',
        },
        logoDark: '',
        logoLight: '',
        uploadPostProfileId: '',
        importPollIntervalMs: 10000,
      };
      try {
        await ctx.sendMessage({ type: 'CFS_PROJECT_WRITE_FILE', relativePath: 'uploads/' + projectId + '/source/defaults.json', content: JSON.stringify(defaults, null, 2) });
      } catch (_) {}
      // Select the new project
      await ctx.writeStorage('selectedProjectId', projectId);
      await ctx.writeStorage('selectedProject', newProject);
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, projectId, name, defaults }, null, 2) }] };
    }
  );

  /* ── edit_project ── */
  server.tool(
    'edit_project',
    'Edit a local project\'s name. Updates the project entry in the projects list.',
    {
      projectId: z.string().describe('Project ID to edit'),
      name: z.string().optional().describe('New project name'),
    },
    async ({ projectId, name }) => {
      const res = await ctx.readStorage(['localProjects']);
      const projects = Array.isArray(res?.data?.localProjects) ? [...res.data.localProjects] : [];
      const idx = projects.findIndex(p => p.id === projectId);
      if (idx === -1) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'Project not found: ' + projectId }) }], isError: true };
      }
      if (name) projects[idx].name = name;
      await ctx.writeStorage('localProjects', projects);
      try {
        await ctx.sendMessage({ type: 'CFS_PROJECT_WRITE_FILE', relativePath: 'config/projects.json', content: JSON.stringify(projects, null, 2) });
      } catch (_) {}
      // Update selected project if it's this one
      const selRes = await ctx.readStorage(['selectedProjectId']);
      if (selRes?.data?.selectedProjectId === projectId) {
        await ctx.writeStorage('selectedProject', projects[idx]);
      }
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, project: projects[idx] }, null, 2) }] };
    }
  );

  /* ── delete_project ── */
  server.tool(
    'delete_project',
    'Delete a local project. Removes the project entry from the list. Does NOT delete the project folder (uploads/{id}/) — use project_list_dir to inspect and manually clean up.',
    {
      projectId: z.string().describe('Project ID to delete'),
    },
    async ({ projectId }) => {
      const res = await ctx.readStorage(['localProjects']);
      const projects = Array.isArray(res?.data?.localProjects) ? [...res.data.localProjects] : [];
      const filtered = projects.filter(p => p.id !== projectId);
      if (filtered.length === projects.length) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'Project not found: ' + projectId }) }], isError: true };
      }
      await ctx.writeStorage('localProjects', filtered);
      try {
        await ctx.sendMessage({ type: 'CFS_PROJECT_WRITE_FILE', relativePath: 'config/projects.json', content: JSON.stringify(filtered, null, 2) });
      } catch (_) {}
      // Clear selection if this was selected
      const selRes = await ctx.readStorage(['selectedProjectId']);
      if (selRes?.data?.selectedProjectId === projectId) {
        await ctx.writeStorage('selectedProjectId', '');
        await ctx.writeStorage('selectedProject', null);
      }
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, deleted: projectId, remaining: filtered.length }, null, 2) }] };
    }
  );

  /* ── set_project_defaults ── */
  server.tool(
    'set_project_defaults',
    'Update a project\'s defaults.json (colors, logos, description, etc.). Merges with existing defaults — only pass the fields you want to change.',
    {
      projectId: z.string().describe('Project ID'),
      name: z.string().optional(),
      description: z.string().optional(),
      colors: z.object({
        primary: z.string().optional(),
        secondary: z.string().optional(),
        accent: z.string().optional(),
        background: z.string().optional(),
        text: z.string().optional(),
      }).optional(),
      logoDark: z.string().optional(),
      logoLight: z.string().optional(),
      uploadPostProfileId: z.string().optional(),
    },
    async ({ projectId, ...updates }) => {
      // Read existing defaults
      const readRes = await ctx.sendMessage({
        type: 'CFS_PROJECT_READ_FILE',
        relativePath: 'uploads/' + projectId + '/source/defaults.json',
      });
      let existing = {};
      if (readRes?.ok && readRes.text) {
        try { existing = JSON.parse(readRes.text); } catch (_) {}
      }
      // Merge
      const merged = { ...existing };
      if (updates.name !== undefined) merged.name = updates.name;
      if (updates.description !== undefined) merged.description = updates.description;
      if (updates.logoDark !== undefined) merged.logoDark = updates.logoDark;
      if (updates.logoLight !== undefined) merged.logoLight = updates.logoLight;
      if (updates.uploadPostProfileId !== undefined) merged.uploadPostProfileId = updates.uploadPostProfileId;
      if (updates.colors) {
        merged.colors = { ...(existing.colors || {}), ...updates.colors };
      }
      // Write
      const writeRes = await ctx.sendMessage({
        type: 'CFS_PROJECT_WRITE_FILE',
        relativePath: 'uploads/' + projectId + '/source/defaults.json',
        content: JSON.stringify(merged, null, 2),
      });
      // Also cache in storage
      try {
        await ctx.writeStorage('cfsProjectDefaults_' + projectId, merged);
      } catch (_) {}
      return { content: [{ type: 'text', text: JSON.stringify({ ok: writeRes?.ok !== false, defaults: merged }, null, 2) }] };
    }
  );

  /* ══════════════════════════════════════════════════════════════
   * Project Folder File I/O Tools
   * ══════════════════════════════════════════════════════════════ */

  /* ── project_read_file ── */
  server.tool(
    'project_read_file',
    'Read a file from the project folder. Path is relative to the project root. Use for reading templates, defaults, or any project file.',
    {
      relativePath: z.string().describe('File path relative to project root (e.g. "uploads/myProject/source/defaults.json")'),
      encoding: z.enum(['text', 'base64']).optional().default('text').describe('Encoding: "text" for UTF-8 or "base64" for binary'),
    },
    async ({ relativePath, encoding }) => {
      const res = await ctx.sendMessage({ type: 'CFS_PROJECT_READ_FILE', relativePath, encoding });
      if (!res?.ok) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: res?.error || 'Read failed' }) }], isError: true };
      }
      // Offscreen returns { ok, text } for text encoding, { ok, base64, mimeType } for base64
      return { content: [{ type: 'text', text: res.text || res.base64 || '' }] };
    }
  );

  /* ── project_write_file ── */
  server.tool(
    'project_write_file',
    'Write a file to the project folder. Creates intermediate directories automatically. Path is relative to the project root.',
    {
      relativePath: z.string().describe('File path relative to project root'),
      content: z.string().describe('File content to write'),
    },
    async ({ relativePath, content }) => {
      const res = await ctx.sendMessage({ type: 'CFS_PROJECT_WRITE_FILE', relativePath, content });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res?.ok };
    }
  );

  /* ── project_list_dir ── */
  server.tool(
    'project_list_dir',
    'List files and directories in a project folder path. Returns names and types (file/directory).',
    {
      relativePath: z.string().optional().default('').describe('Directory path relative to project root (empty = list root)'),
    },
    async ({ relativePath }) => {
      const res = await ctx.sendMessage({ type: 'PROJECT_FOLDER_LIST_DIR', relativePath: relativePath || 'uploads' });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res?.ok };
    }
  );

  /* ── project_ensure_dirs ── */
  server.tool(
    'project_ensure_dirs',
    'Create one or more directories in the project folder. Creates all intermediate directories as needed.',
    {
      paths: z.array(z.string()).min(1).describe('Directory paths to create, relative to project root'),
    },
    async ({ paths }) => {
      const res = await ctx.sendMessage({ type: 'CFS_PROJECT_ENSURE_DIRS', paths });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res?.ok };
    }
  );

  /* ── project_move_file ── */
  server.tool(
    'project_move_file',
    'Move or rename a file within the project folder.',
    {
      sourcePath: z.string().describe('Source file path relative to project root'),
      destPath: z.string().describe('Destination file path relative to project root'),
    },
    async ({ sourcePath, destPath }) => {
      const res = await ctx.sendMessage({ type: 'PROJECT_FOLDER_MOVE_FILE', sourcePath, destPath });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res?.ok };
    }
  );

  /* ── project_download_to_folder ── */
  server.tool(
    'project_download_to_folder',
    'Download a file from a URL and save it to the project folder. Useful for downloading images, videos, or other content into a project.',
    {
      url: z.string().url().describe('URL to download from'),
      relativePath: z.string().describe('Destination path in project folder (e.g. "uploads/myProject/source/media/library/image.png")'),
    },
    async ({ url, relativePath }) => {
      try {
        // Fetch the file through the relay (extension can fetch cross-origin)
        const res = await ctx.sendMessage({ type: 'CFS_FETCH_AND_SAVE_TO_PROJECT', url, relativePath });
        if (res?.ok) {
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, path: relativePath, bytes: res.bytes || null }, null, 2) }] };
        }
        // Fallback: fetch on server side and write as base64
        const fetchRes = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!fetchRes.ok) {
          return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'Download failed: HTTP ' + fetchRes.status }) }], isError: true };
        }
        const buf = Buffer.from(await fetchRes.arrayBuffer());
        const b64 = buf.toString('base64');
        // Write as base64 content — the extension write handler can accept this
        const writeRes = await ctx.sendMessage({
          type: 'CFS_PROJECT_WRITE_FILE',
          relativePath,
          content: b64,
          encoding: 'base64',
        });
        return { content: [{ type: 'text', text: JSON.stringify({ ok: writeRes?.ok !== false, path: relativePath, bytes: buf.length }, null, 2) }], isError: !writeRes?.ok };
      } catch (e) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: e.message }) }], isError: true };
      }
    }
  );
}
