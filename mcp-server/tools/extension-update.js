/**
 * MCP Tools — Extension self-update from GitHub
 *
 * Uses the same GitHub API logic as shared/github-extension-update.js but
 * runs server-side with Node fs (no File System Access API needed).
 *
 * Flow:
 *   1. check_extension_update  — compare baseline → HEAD, return diff summary
 *   2. apply_extension_update  — download changed files, write to disk
 *   3. reload_extension        — tell the extension to chrome.runtime.reload()
 */
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_OWNER = 'contentrewardsai';
const DEFAULT_REPO = 'ExtensibleContentExtension';
const DEFAULT_BRANCH = 'main';
const SYNC_STATE_FILENAME = 'github-sync-state.json';

/** Paths we never overwrite from GitHub (user data / huge binaries). */
const SKIP_PREFIXES = [
  'node_modules/',
  '.git/',
  'models/',
  '.cursor/',
  '.DS_Store',
];

function shouldSkipPath(rel) {
  if (!rel || typeof rel !== 'string') return true;
  const n = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  for (const prefix of SKIP_PREFIXES) {
    if (n === prefix.replace(/\/$/, '') || n.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Resolve the extension root directory.
 * Heuristic: walk up from the MCP server directory until we find manifest.json
 * with the matching extension name, or use a configured path.
 */
function resolveExtensionRoot() {
  /* Try ec-mcp-config.json for extensionPath */
  const configCandidates = [
    path.join(path.dirname(process.argv[0] || '.'), 'ec-mcp-config.json'),
    path.join(path.dirname(process.argv[1] || '.'), 'ec-mcp-config.json'),
    path.join(process.cwd(), 'ec-mcp-config.json'),
  ];
  for (const p of configCandidates) {
    try {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (cfg.extensionPath && fs.existsSync(path.join(cfg.extensionPath, 'manifest.json'))) {
        return cfg.extensionPath;
      }
    } catch (_) {}
  }

  /* Walk up from mcp-server/ or from cwd */
  const startDirs = [
    path.dirname(process.argv[1] || process.argv[0] || '.'),
    process.cwd(),
  ];
  for (const startDir of startDirs) {
    let dir = path.resolve(startDir);
    for (let i = 0; i < 5; i++) {
      const manifestPath = path.join(dir, 'manifest.json');
      try {
        if (fs.existsSync(manifestPath)) {
          const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          if (m.manifest_version === 3 && m.name) return dir;
        }
      } catch (_) {}
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

function ghHeaders(token) {
  const h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) h.Authorization = 'Bearer ' + token;
  return h;
}

async function ghJson(url, token) {
  const r = await fetch(url, { headers: ghHeaders(token) });
  const text = await r.text();
  let j = null;
  try { j = text ? JSON.parse(text) : null; } catch (_) {}
  if (!r.ok) {
    const msg = (j && (j.message || j.error)) || text || r.statusText || String(r.status);
    throw new Error('GitHub API ' + r.status + ': ' + msg);
  }
  return j;
}

function readSyncState(extensionRoot) {
  const filePath = path.join(extensionRoot, SYNC_STATE_FILENAME);
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    const j = JSON.parse(text);
    return j && typeof j === 'object' ? j : null;
  } catch (_) {
    return null;
  }
}

function writeSyncState(extensionRoot, updates) {
  const filePath = path.join(extensionRoot, SYNC_STATE_FILENAME);
  let base = {};
  try {
    base = JSON.parse(fs.readFileSync(filePath, 'utf-8')) || {};
  } catch (_) {}

  let manifestVersion = '';
  try {
    const m = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf-8'));
    manifestVersion = m.version || '';
  } catch (_) {}

  const next = {
    ...base,
    ...updates,
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
  };
  if (updates.manifestVersion != null) next.manifestVersion = updates.manifestVersion;
  else if (!next.manifestVersion && manifestVersion) next.manifestVersion = manifestVersion;
  if (updates.baselineCommitSha != null) next.baselineCommitSha = updates.baselineCommitSha;

  fs.writeFileSync(filePath, JSON.stringify(next, null, 2));
  return next;
}

async function getLatestCommit(owner, repo, branch, token) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(branch)}`;
  const j = await ghJson(url, token);
  return {
    sha: j.sha,
    date: j.commit?.committer?.date || '',
    message: j.commit?.message || '',
  };
}

async function compareCommits(owner, repo, baseSha, headSha, token) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/compare/${encodeURIComponent(baseSha)}...${encodeURIComponent(headSha)}`;
  return ghJson(url, token);
}

function rawUrl(owner, repo, commitSha, filename) {
  const enc = filename.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${owner}/${repo}/${commitSha}/${enc}`;
}

async function fetchRawBuffer(url, token) {
  const h = {};
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(url, { headers: h });
  if (!r.ok) throw new Error('Raw fetch ' + r.status + ' ' + url);
  return Buffer.from(await r.arrayBuffer());
}

export function registerExtensionUpdateTools(server, ctx) {

  server.tool(
    'check_extension_update',
    'Check if a newer version of the extension is available on GitHub. Compares the local baseline commit against the latest commit on the configured branch. Returns file change count and commit info.',
    {
      owner: z.string().optional().describe('GitHub owner (default: contentrewardsai)'),
      repo: z.string().optional().describe('GitHub repo (default: ExtensibleContentExtension)'),
      branch: z.string().optional().describe('Branch to check (default: main)'),
      token: z.string().optional().describe('GitHub PAT for private repos (optional)'),
    },
    async ({ owner, repo, branch, token }) => {
      const o = owner || DEFAULT_OWNER;
      const r = repo || DEFAULT_REPO;
      const b = branch || DEFAULT_BRANCH;

      const extensionRoot = resolveExtensionRoot();
      if (!extensionRoot) {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            ok: false,
            error: 'Cannot find extension root directory. Set "extensionPath" in ec-mcp-config.json or run the MCP server from the extension directory.',
          }, null, 2) }],
          isError: true,
        };
      }

      const syncState = readSyncState(extensionRoot);
      const baseSha = syncState?.baselineCommitSha || null;
      const remote = await getLatestCommit(o, r, b, token);
      const short = remote.sha.slice(0, 7);
      const subject = (remote.message || '').split('\n')[0].slice(0, 100);

      if (!baseSha) {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            ok: true,
            upToDate: false,
            noBaseline: true,
            extensionRoot,
            latestCommit: short,
            latestMessage: subject,
            hint: 'No baseline found. Run apply_extension_update with force=true for a full tree sync, or first record a baseline by running with recordBaseline=true.',
          }, null, 2) }],
        };
      }

      if (baseSha === remote.sha) {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            ok: true,
            upToDate: true,
            extensionRoot,
            baselineCommit: baseSha.slice(0, 7),
            latestCommit: short,
            syncState: syncState ? {
              baseline: syncState.baselineCommitSha?.slice(0, 7),
              version: syncState.manifestVersion,
              updatedAt: syncState.updatedAt,
            } : null,
          }, null, 2) }],
        };
      }

      const cmp = await compareCommits(o, r, baseSha, remote.sha, token);
      const fileCount = cmp.files?.length || 0;
      const commits = cmp.total_commits || '?';

      return {
        content: [{ type: 'text', text: JSON.stringify({
          ok: true,
          upToDate: false,
          extensionRoot,
          baselineCommit: baseSha.slice(0, 7),
          latestCommit: short,
          latestMessage: subject,
          behindBy: commits,
          fileChanges: fileCount,
          files: (cmp.files || []).slice(0, 50).map(f => ({
            path: f.filename,
            status: f.status,
          })),
          hint: 'Run apply_extension_update to download and apply these changes, then reload_extension to activate them.',
        }, null, 2) }],
      };
    }
  );

  server.tool(
    'apply_extension_update',
    'Download and apply extension updates from GitHub. Writes changed files to the extension directory on disk. After applying, use reload_extension to activate. Supports incremental (compare-based) and full tree sync.',
    {
      owner: z.string().optional().describe('GitHub owner (default: contentrewardsai)'),
      repo: z.string().optional().describe('GitHub repo (default: ExtensibleContentExtension)'),
      branch: z.string().optional().describe('Branch (default: main)'),
      token: z.string().optional().describe('GitHub PAT (optional)'),
      force: z.boolean().optional().describe('Force full tree sync (downloads all files, not incremental). Required when no baseline exists.'),
      recordBaseline: z.boolean().optional().describe('Only record the current commit as baseline without downloading files (use after a fresh clone).'),
      autoReload: z.boolean().optional().describe('Automatically reload the extension after applying (default: false)'),
    },
    async ({ owner, repo, branch, token, force, recordBaseline, autoReload }) => {
      const o = owner || DEFAULT_OWNER;
      const r = repo || DEFAULT_REPO;
      const b = branch || DEFAULT_BRANCH;

      const extensionRoot = resolveExtensionRoot();
      if (!extensionRoot) {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            ok: false,
            error: 'Cannot find extension root. Set "extensionPath" in ec-mcp-config.json.',
          }, null, 2) }],
          isError: true,
        };
      }

      const remote = await getLatestCommit(o, r, b, token);

      /* Record baseline only */
      if (recordBaseline) {
        writeSyncState(extensionRoot, { baselineCommitSha: remote.sha });
        return {
          content: [{ type: 'text', text: JSON.stringify({
            ok: true,
            action: 'baseline_recorded',
            commit: remote.sha.slice(0, 7),
            message: 'Baseline recorded. Future check_extension_update calls will compare against this commit.',
          }, null, 2) }],
        };
      }

      /* Full tree sync */
      if (force) {
        const treeShaUrl = `https://api.github.com/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/commits/${encodeURIComponent(remote.sha)}`;
        const commitData = await ghJson(treeShaUrl, token);
        const treeSha = commitData.commit?.tree?.sha;
        if (!treeSha) throw new Error('No tree SHA on commit');

        const treeUrl = `https://api.github.com/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`;
        const tree = await ghJson(treeUrl, token);

        if (tree.truncated) {
          return {
            content: [{ type: 'text', text: JSON.stringify({
              ok: false,
              error: 'Tree response truncated by GitHub. Use git clone instead.',
            }, null, 2) }],
            isError: true,
          };
        }

        const blobs = (tree.tree || []).filter(e => e && e.type === 'blob' && e.path && !shouldSkipPath(e.path));
        let written = 0;

        /* Concurrent downloads (6 workers) */
        let idx = 0;
        async function worker() {
          while (idx < blobs.length) {
            const my = idx++;
            const e = blobs[my];
            const url = rawUrl(o, r, remote.sha, e.path);
            const buf = await fetchRawBuffer(url, token);
            const fullPath = path.join(extensionRoot, e.path);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, buf);
            written++;
          }
        }
        const workers = [];
        for (let w = 0; w < Math.min(6, blobs.length || 1); w++) workers.push(worker());
        await Promise.all(workers);

        writeSyncState(extensionRoot, { baselineCommitSha: remote.sha });

        /* Auto-reload if requested */
        if (autoReload && ctx.isRelayConnected()) {
          try { await ctx._relayRequest('RELOAD_EXTENSION', {}); } catch (_) {}
        }

        return {
          content: [{ type: 'text', text: JSON.stringify({
            ok: true,
            action: 'full_sync',
            filesWritten: written,
            commit: remote.sha.slice(0, 7),
            message: `Full sync complete: ${written} files written.` + (autoReload ? ' Extension reloading…' : ' Run reload_extension to activate.'),
          }, null, 2) }],
        };
      }

      /* Incremental update */
      const syncState = readSyncState(extensionRoot);
      const baseSha = syncState?.baselineCommitSha;
      if (!baseSha) {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            ok: false,
            error: 'No baseline commit. Run with force=true for full tree sync or recordBaseline=true first.',
          }, null, 2) }],
          isError: true,
        };
      }

      if (baseSha === remote.sha) {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            ok: true,
            action: 'none',
            message: 'Already up to date.',
          }, null, 2) }],
        };
      }

      const cmp = await compareCommits(o, r, baseSha, remote.sha, token);
      const files = Array.isArray(cmp.files) ? cmp.files : [];
      let written = 0;
      let removed = 0;

      for (const f of files) {
        if (!f || !f.filename || shouldSkipPath(f.filename)) continue;

        if (f.status === 'removed') {
          const fullPath = path.join(extensionRoot, f.filename);
          try { fs.unlinkSync(fullPath); removed++; } catch (_) {}
          continue;
        }
        if (f.status === 'renamed' && f.previous_filename && !shouldSkipPath(f.previous_filename)) {
          try { fs.unlinkSync(path.join(extensionRoot, f.previous_filename)); } catch (_) {}
        }

        const url = rawUrl(o, r, remote.sha, f.filename);
        const buf = await fetchRawBuffer(url, token);
        const fullPath = path.join(extensionRoot, f.filename);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, buf);
        written++;
      }

      writeSyncState(extensionRoot, { baselineCommitSha: remote.sha });

      /* Auto-reload if requested */
      if (autoReload && ctx.isRelayConnected()) {
        try { await ctx._relayRequest('RELOAD_EXTENSION', {}); } catch (_) {}
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({
          ok: true,
          action: 'incremental',
          filesWritten: written,
          filesRemoved: removed,
          baselineCommit: baseSha.slice(0, 7),
          newCommit: remote.sha.slice(0, 7),
          message: `Update applied: ${written} written, ${removed} removed.` + (autoReload ? ' Extension reloading…' : ' Run reload_extension to activate.'),
        }, null, 2) }],
      };
    }
  );

  server.tool(
    'reload_extension',
    'Reload the Chrome extension. Triggers chrome.runtime.reload() via the relay. The relay page will briefly disconnect and reconnect automatically. Use after apply_extension_update to activate new code.',
    {},
    async () => {
      if (!ctx.isRelayConnected()) {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            ok: false,
            error: 'Extension relay not connected. Open mcp/mcp-relay.html in the extension first.',
          }, null, 2) }],
          isError: true,
        };
      }

      try {
        const res = await ctx._relayRequest('RELOAD_EXTENSION', {});
        return {
          content: [{ type: 'text', text: JSON.stringify({
            ok: true,
            message: 'Extension reload triggered. The relay will reconnect automatically in a few seconds.',
          }, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            ok: false,
            error: e.message || 'Reload failed',
          }, null, 2) }],
          isError: true,
        };
      }
    }
  );
}
