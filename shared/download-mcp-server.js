/**
 * MCP Server Binary Download Manager
 *
 * Downloads pre-compiled MCP server binaries from GitHub Releases into the
 * user's project folder. The binary is platform-specific and self-contained
 * (compiled with Bun).
 *
 * Storage keys used:
 *   cfsMcpBinaryPath     — relative path in project folder where binary is saved
 *   cfsMcpBinaryVersion  — version string of the downloaded binary
 *
 * Expects the global `writeBinaryToProjectFolder` from download-xenova-lamini.js
 * and `readBinaryFromProjectFolder` to be available.
 */
(function (global) {
  'use strict';

  /**
   * GitHub repo where MCP binaries are released.
   * Update this when the repo changes.
   */
  var MCP_BINARY_REPO = 'extensiblecontent/ExtensibleContentExtension';
  var RELEASES_API = 'https://api.github.com/repos/' + MCP_BINARY_REPO + '/releases';

  /**
   * Detect user's platform and architecture from navigator.
   * Returns { os, arch, target, filename } or null if unsupported.
   */
  function detectPlatform() {
    var ua = navigator.userAgent || '';
    var platform = navigator.platform || '';
    var os, arch, target, filename;

    /* Detect OS */
    if (/Mac/i.test(platform) || /Mac/i.test(ua)) {
      os = 'darwin';
    } else if (/Win/i.test(platform) || /Win/i.test(ua)) {
      os = 'win';
    } else if (/Linux/i.test(platform) || /Linux/i.test(ua)) {
      os = 'linux';
    } else {
      return null;
    }

    /* Detect architecture — check navigator.userAgentData if available */
    if (navigator.userAgentData && navigator.userAgentData.architecture) {
      var a = navigator.userAgentData.architecture.toLowerCase();
      arch = (a === 'arm' || a === 'arm64') ? 'arm64' : 'x64';
    } else {
      /* Fallback: Mac ARM detected via "Apple" in vendor or ARM in UA */
      if (os === 'darwin' && /arm64|aarch64/i.test(ua)) {
        arch = 'arm64';
      } else if (os === 'darwin') {
        /* Post-2020 Macs are ARM; x64 Macs are pre-2020. Browser UA doesn't
           clearly distinguish; detect via Rosetta hints or default to arm64
           since all new Macs are ARM and Rosetta runs x64 binaries. */
        arch = 'arm64';
      } else {
        arch = 'x64';
      }
    }

    target = os + '-' + arch;
    filename = 'ec-mcp-server-' + target + (os === 'win' ? '.exe' : '');
    var friendlyName;
    if (os === 'win') friendlyName = 'StartWindowsMCPServer.exe';
    else if (os === 'linux') friendlyName = 'StartLinuxMCPServer';
    else if (os === 'darwin' && arch === 'arm64') friendlyName = 'StartMacMCPServer';
    else friendlyName = 'StartMacIntelMCPServer';
    return { os: os, arch: arch, target: target, filename: filename, friendlyName: friendlyName };
  }

  /**
   * Fetch the latest MCP release metadata from GitHub.
   * @returns {Promise<{ tag: string, version: string, assets: Array<{ name: string, url: string, size: number }> } | null>}
   */
  async function fetchLatestMcpRelease() {
    try {
      /* Look for releases tagged mcp-v* */
      var res = await fetch(RELEASES_API + '?per_page=20', {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      var releases = await res.json();
      if (!Array.isArray(releases)) return null;

      for (var i = 0; i < releases.length; i++) {
        var r = releases[i];
        if (r.draft || r.prerelease) continue;
        if (r.tag_name && r.tag_name.startsWith('mcp-v') && r.assets && r.assets.length > 0) {
          return {
            tag: r.tag_name,
            version: r.tag_name.replace(/^mcp-v/, ''),
            assets: r.assets.map(function (a) {
              return {
                name: a.name,
                url: a.browser_download_url,
                size: a.size,
              };
            }),
          };
        }
      }
      return null;
    } catch (_) {
      return null;
    }
  }


  /**
   * Try to find the MCP binary in the project folder's local paths.
   * Checks mcp-server/dist/ and mcp-server/ for the platform-specific filename.
   * @param {FileSystemDirectoryHandle} projectRoot
   * @param {{ filename: string }} plat
   * @returns {Promise<{buffer: ArrayBuffer, srcPath: string}|null>}
   */
  async function findLocalBinary(projectRoot, plat) {
    var paths = [
      'mcp-server/dist/' + plat.friendlyName,
      'mcp-server/' + plat.friendlyName,
      'mcp-server/dist/' + plat.filename,
      'mcp-server/' + plat.filename,
    ];

    /* Method 1: fetch from extension's own URL (works for unpacked extensions) */
    for (var i = 0; i < paths.length; i++) {
      try {
        var url = chrome.runtime.getURL(paths[i]);
        var resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (resp.ok) {
          var buf = await resp.arrayBuffer();
          if (buf && buf.byteLength > 1000000) return { buffer: buf, srcPath: paths[i] };
        }
      } catch (_) {}
    }

    /* Method 2: File System Access API (if project folder is set) */
    if (projectRoot) {
      for (var j = 0; j < paths.length; j++) {
        try {
          var fsBuf = await readBinaryFromProjectFolder(projectRoot, paths[j]);
          if (fsBuf && fsBuf.byteLength > 1000000) return { buffer: fsBuf, srcPath: paths[j] };
        } catch (_) {}
      }
    }

    return null;
  }

  /**
   * Get the extension URL for the binary folder (for "open in Finder" style UX).
   */
  function cfsMcpGetBinaryFolder(plat) {
    if (!plat) plat = detectPlatform();
    if (!plat) return null;
    /* Check which path the binary is at */
    return {
      distPath: 'mcp-server/dist/',
      rootPath: 'mcp-server/',
      filename: plat.filename,
    };
  }

  /**
   * Locate the MCP server binary for the current platform.
   * The binary ships inside the extension folder. This function:
   * 1. Checks if already set up (skip unless force)
   * 2. Finds the binary via extension URL or File System Access
   * 3. Records its path in chrome.storage.local
   *
   * @param {FileSystemDirectoryHandle|null} projectRoot
   * @param {{ (msg: string): void } | null} onStatus
   * @param {{ force?: boolean }} opts
   * @returns {Promise<{ ok: boolean, error?: string, skipped?: boolean, path?: string, version?: string }>}
   */
  async function cfsMcpDownloadBinary(projectRoot, onStatus, opts) {
    opts = opts || {};

    var plat = detectPlatform();
    if (!plat) return { ok: false, error: 'Unsupported platform. Only macOS, Windows, and Linux are supported.' };

    if (onStatus) onStatus('Platform: ' + plat.target);

    /* ── 1. Already set up? Verify the binary still exists ── */
    if (!opts.force) {
      var data = await new Promise(function (resolve) {
        chrome.storage.local.get(['cfsMcpBinaryPath', 'cfsMcpBinaryVersion'], resolve);
      });
      if (data.cfsMcpBinaryPath) {
        try {
          var checkUrl = chrome.runtime.getURL(data.cfsMcpBinaryPath);
          var checkResp = await fetch(checkUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
          if (checkResp.ok) {
            if (onStatus) onStatus('✓ MCP binary ready (' + (data.cfsMcpBinaryVersion || 'local') + ')');
            return { ok: true, skipped: true, path: data.cfsMcpBinaryPath, version: data.cfsMcpBinaryVersion };
          }
        } catch (_) {}
      }
    }

    /* ── 2. Find the binary in the extension folder ── */
    if (onStatus) onStatus('Scanning for binary…');
    var local = await findLocalBinary(projectRoot, plat);
    if (local) {
      /* Record where we found it */
      await new Promise(function (resolve) {
        chrome.storage.local.set({
          cfsMcpBinaryPath: local.srcPath,
          cfsMcpBinaryVersion: 'local',
        }, resolve);
      });

      if (onStatus) onStatus('✓ Found: ' + local.srcPath);
      return { ok: true, path: local.srcPath, version: 'local' };
    }

    return {
      ok: false,
      error: 'Binary not found at mcp-server/dist/' + plat.filename + '. Build it with: cd mcp-server && ./build.sh',
    };
  }

  /**
   * Get info about the currently downloaded binary.
   * @returns {Promise<{ path: string, version: string } | null>}
   */
  async function cfsMcpGetBinaryInfo() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(['cfsMcpBinaryPath', 'cfsMcpBinaryVersion'], function (data) {
        if (data.cfsMcpBinaryPath) {
          resolve({ path: data.cfsMcpBinaryPath, version: data.cfsMcpBinaryVersion || 'unknown' });
        } else {
          resolve(null);
        }
      });
    });
  }

  global.cfsMcpDetectPlatform = detectPlatform;
  global.cfsMcpDownloadBinary = cfsMcpDownloadBinary;
  global.cfsMcpGetBinaryInfo = cfsMcpGetBinaryInfo;
  global.cfsMcpGetBinaryFolder = cfsMcpGetBinaryFolder;
})(typeof self !== 'undefined' ? self : window);
