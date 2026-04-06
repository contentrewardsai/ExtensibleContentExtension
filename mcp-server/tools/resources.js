/**
 * MCP Resources — Browsable read-only data
 *
 * Resources replace read-only tools. AI clients can browse extension data
 * (workflows, steps, wallets, schedules, following) without calling tools.
 */
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

/** In-memory cache for step definitions (loaded once from extension bundle). */
const stepCache = new Map();
/** In-memory cache for step README.md content. */
const readmeCache = new Map();
let stepManifestCache = null;

/** Fetch and cache the step manifest (list of all step IDs). */
async function getStepManifest(ctx) {
  if (stepManifestCache) return stepManifestCache;
  try {
    const res = await ctx.fetchExtensionFile('steps/manifest.json');
    if (res && res.ok && res.data) {
      const manifest = JSON.parse(res.data);
      stepManifestCache = manifest.steps || [];
      return stepManifestCache;
    }
  } catch (_) {}
  return [];
}

/** Fetch and cache a single step definition. */
async function getStepDefinition(ctx, stepId) {
  if (stepCache.has(stepId)) return stepCache.get(stepId);
  try {
    const res = await ctx.fetchExtensionFile('steps/' + stepId + '/step.json');
    if (res && res.ok && res.data) {
      const def = JSON.parse(res.data);
      stepCache.set(stepId, def);
      return def;
    }
  } catch (_) {}
  return null;
}

/** Fetch and cache a step's README.md (returns markdown string or null). */
async function getStepReadme(ctx, stepId) {
  if (readmeCache.has(stepId)) return readmeCache.get(stepId);
  try {
    const res = await ctx.fetchExtensionFile('steps/' + stepId + '/README.md');
    if (res && res.ok && res.data) {
      readmeCache.set(stepId, res.data);
      return res.data;
    }
  } catch (_) {}
  readmeCache.set(stepId, null);
  return null;
}

/** Fetch all step definitions (batched, cached). */
async function getAllStepDefinitions(ctx) {
  const ids = await getStepManifest(ctx);
  const results = [];
  for (const id of ids) {
    const def = await getStepDefinition(ctx, id);
    if (def) results.push(def);
  }
  return results;
}

export function registerResources(server, ctx) {
  /* ── Workflows ── */

  server.resource(
    'extensible://workflows',
    'All Workflows',
    async () => {
      const res = await ctx.readStorage(['workflows']);
      const wfs = (res?.data?.workflows) || {};
      const list = Object.entries(wfs).map(([id, wf]) => ({
        id,
        name: wf.name || id,
        stepCount: wf.analyzed?.actions?.length || 0,
        urlPattern: wf.urlPattern || null,
        hasAlwaysOn: !!(wf.alwaysOn?.enabled),
      }));
      return {
        contents: [{
          uri: 'extensible://workflows',
          mimeType: 'application/json',
          text: JSON.stringify(list, null, 2),
        }],
      };
    }
  );

  server.resource(
    new ResourceTemplate('extensible://workflows/{workflowId}', { list: undefined }),
    'Workflow Details',
    async (uri, { workflowId }) => {
      const res = await ctx.readStorage(['workflows']);
      const wf = res?.data?.workflows?.[workflowId];
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: wf ? JSON.stringify(wf, null, 2) : '{"error":"Workflow not found"}',
        }],
      };
    }
  );

  server.resource(
    new ResourceTemplate('extensible://workflows/{workflowId}/steps', { list: undefined }),
    'Workflow Steps with Definitions',
    async (uri, { workflowId }) => {
      const res = await ctx.readStorage(['workflows']);
      const wf = res?.data?.workflows?.[workflowId];
      if (!wf || !wf.analyzed?.actions) {
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: '{"error":"Workflow not found or has no steps"}' }] };
      }
      /* Enrich each action with its step definition */
      const enriched = [];
      for (const action of wf.analyzed.actions) {
        const def = action.type ? await getStepDefinition(ctx, action.type) : null;
        enriched.push({
          action,
          stepDefinition: def ? { id: def.id, label: def.label, category: def.category, description: def.description } : null,
        });
      }
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(enriched, null, 2),
        }],
      };
    }
  );

  /* ── Steps (catalog) ── */

  server.resource(
    'extensible://steps',
    'All Step Type Definitions',
    async () => {
      const defs = await getAllStepDefinitions(ctx);
      const ids = await getStepManifest(ctx);
      /* Pre-fetch READMEs in parallel for the hasReadme flag */
      const readmeChecks = await Promise.all(ids.map(id => getStepReadme(ctx, id).then(r => [id, !!r])));
      const readmeMap = Object.fromEntries(readmeChecks);
      const summary = defs.map(d => ({
        id: d.id,
        label: d.label,
        category: d.category || 'uncategorized',
        description: d.description || '',
        hasReadme: !!readmeMap[d.id],
      }));
      return {
        contents: [{
          uri: 'extensible://steps',
          mimeType: 'application/json',
          text: JSON.stringify(summary, null, 2),
        }],
      };
    }
  );

  server.resource(
    new ResourceTemplate('extensible://steps/{stepId}', { list: undefined }),
    'Step Type Definition (with README documentation)',
    async (uri, { stepId }) => {
      const def = await getStepDefinition(ctx, stepId);
      const readme = await getStepReadme(ctx, stepId);
      if (!def) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: '{"error":"Step type not found"}',
          }],
        };
      }
      const enriched = { ...def, readme: readme || null };
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(enriched, null, 2),
        }],
      };
    }
  );

  server.resource(
    new ResourceTemplate('extensible://steps/{stepId}/readme', { list: undefined }),
    'Step README Documentation (Markdown)',
    async (uri, { stepId }) => {
      const readme = await getStepReadme(ctx, stepId);
      return {
        contents: [{
          uri: uri.href,
          mimeType: readme ? 'text/markdown' : 'application/json',
          text: readme || '{"error":"No README.md found for step: ' + stepId + '"}',
        }],
      };
    }
  );

  server.resource(
    'extensible://steps/categories',
    'Steps Grouped by Category',
    async () => {
      const defs = await getAllStepDefinitions(ctx);
      const cats = {};
      for (const d of defs) {
        const cat = d.category || 'uncategorized';
        if (!cats[cat]) cats[cat] = [];
        cats[cat].push({ id: d.id, label: d.label, description: d.description || '' });
      }
      return {
        contents: [{
          uri: 'extensible://steps/categories',
          mimeType: 'application/json',
          text: JSON.stringify(cats, null, 2),
        }],
      };
    }
  );

  /* ── Generators (templates) ── */

  server.resource(
    'extensible://generators',
    'Generator Templates',
    async () => {
      try {
        const res = await ctx.fetchExtensionFile('generator/templates/manifest.json');
        if (res && res.ok && res.data) {
          const manifest = JSON.parse(res.data);
          const ids = manifest.templates || [];
          /* Fetch merge fields for each template */
          const templates = [];
          for (const id of ids) {
            try {
              const tRes = await ctx.fetchExtensionFile('generator/templates/' + id + '/template.json');
              if (tRes && tRes.ok && tRes.data) {
                const tmpl = JSON.parse(tRes.data);
                const mergeFields = (tmpl.merge || []).map(m => ({
                  field: m.find,
                  defaultValue: m.replace || '',
                }));
                templates.push({
                  id,
                  mergeFieldCount: mergeFields.length,
                  mergeFields,
                  outputFormat: tmpl.output?.format || 'unknown',
                  outputSize: tmpl.output?.size || tmpl.output?.resolution || null,
                });
              } else {
                templates.push({ id, mergeFields: [], error: 'Could not load template.json' });
              }
            } catch (_) {
              templates.push({ id, mergeFields: [] });
            }
          }
          return {
            contents: [{
              uri: 'extensible://generators',
              mimeType: 'application/json',
              text: JSON.stringify(templates, null, 2),
            }],
          };
        }
      } catch (_) {}
      return {
        contents: [{
          uri: 'extensible://generators',
          mimeType: 'application/json',
          text: '{"error":"Could not load generator templates manifest"}',
        }],
      };
    }
  );

  server.resource(
    new ResourceTemplate('extensible://generators/{templateId}', { list: undefined }),
    'Generator Template Details',
    async (uri, { templateId }) => {
      try {
        const res = await ctx.fetchExtensionFile('generator/templates/' + templateId + '/template.json');
        if (res && res.ok && res.data) {
          return {
            contents: [{
              uri: uri.href,
              mimeType: 'application/json',
              text: res.data,
            }],
          };
        }
      } catch (_) {}
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: '{"error":"Template not found: ' + templateId + '"}',
        }],
      };
    }
  );

  /* ── Schedules ── */

  server.resource(
    'extensible://schedules',
    'Scheduled Workflows',
    async () => {
      const res = await ctx.sendMessage({ type: 'GET_SCHEDULED_WORKFLOW_RUNS' });
      return {
        contents: [{
          uri: 'extensible://schedules',
          mimeType: 'application/json',
          text: JSON.stringify(res, null, 2),
        }],
      };
    }
  );

  /* ── Run History ── */

  server.resource(
    'extensible://run-history',
    'Workflow Run History',
    async () => {
      const res = await ctx.readStorage(['workflowRunHistory']);
      return {
        contents: [{
          uri: 'extensible://run-history',
          mimeType: 'application/json',
          text: JSON.stringify(res?.data?.workflowRunHistory || [], null, 2),
        }],
      };
    }
  );

  /* ── Wallets ── */

  server.resource(
    'extensible://wallets',
    'Extension Wallets',
    async () => {
      const res = await ctx.readStorage(['cfsWallets']);
      const wallets = (res?.data?.cfsWallets || []).map(w => ({
        label: w.label || '',
        chain: w.chain || '',
        address: w.address || '',
      }));
      return {
        contents: [{
          uri: 'extensible://wallets',
          mimeType: 'application/json',
          text: JSON.stringify(wallets, null, 2),
        }],
      };
    }
  );

  server.resource(
    new ResourceTemplate('extensible://wallets/{chain}', { list: undefined }),
    'Wallets by Chain',
    async (uri, { chain }) => {
      const res = await ctx.readStorage(['cfsWallets']);
      const wallets = (res?.data?.cfsWallets || [])
        .filter(w => (w.chain || '').toLowerCase() === chain.toLowerCase())
        .map(w => ({ label: w.label || '', chain: w.chain || '', address: w.address || '' }));
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(wallets, null, 2),
        }],
      };
    }
  );

  /* ── Following ── */

  server.resource(
    'extensible://following',
    'Following Profiles',
    async () => {
      const res = await ctx.sendMessage({ type: 'GET_FOLLOWING_DATA' });
      return {
        contents: [{
          uri: 'extensible://following',
          mimeType: 'application/json',
          text: JSON.stringify(res, null, 2),
        }],
      };
    }
  );

  server.resource(
    new ResourceTemplate('extensible://following/{profileId}', { list: undefined }),
    'Following Profile Details',
    async (uri, { profileId }) => {
      const res = await ctx.sendMessage({ type: 'GET_FOLLOWING_DATA' });
      const profiles = res?.profiles || res?.data || [];
      const profile = Array.isArray(profiles)
        ? profiles.find(p => p.id === profileId)
        : null;
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: profile ? JSON.stringify(profile, null, 2) : '{"error":"Profile not found"}',
        }],
      };
    }
  );

  server.resource(
    'extensible://following/watch/solana',
    'Solana Watch Activity',
    async () => {
      const res = await ctx.sendMessage({ type: 'CFS_SOLANA_WATCH_GET_ACTIVITY' });
      return {
        contents: [{
          uri: 'extensible://following/watch/solana',
          mimeType: 'application/json',
          text: JSON.stringify(res, null, 2),
        }],
      };
    }
  );

  server.resource(
    'extensible://following/watch/bsc',
    'BSC Watch Activity',
    async () => {
      const res = await ctx.sendMessage({ type: 'CFS_BSC_WATCH_GET_ACTIVITY' });
      return {
        contents: [{
          uri: 'extensible://following/watch/bsc',
          mimeType: 'application/json',
          text: JSON.stringify(res, null, 2),
        }],
      };
    }
  );

  server.resource(
    'extensible://following/automation-status',
    'Following Automation Status',
    async () => {
      const res = await ctx.sendMessage({ type: 'CFS_FOLLOWING_AUTOMATION_STATUS' });
      return {
        contents: [{
          uri: 'extensible://following/automation-status',
          mimeType: 'application/json',
          text: JSON.stringify(res, null, 2),
        }],
      };
    }
  );

  /* ── Status ── */

  server.resource(
    'extensible://status',
    'Extension Status',
    async () => {
      const connected = ctx.isRelayConnected();
      return {
        contents: [{
          uri: 'extensible://status',
          mimeType: 'application/json',
          text: JSON.stringify({
            relayConnected: connected,
            message: connected
              ? 'Extension relay is connected. All tools and resources are available.'
              : 'Extension relay is NOT connected. Open mcp/mcp-relay.html in the extension browser.',
          }, null, 2),
        }],
      };
    }
  );
}
