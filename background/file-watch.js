/**
 * File Watch: project import folder watcher (MV3 service worker).
 *
 * Transport: chrome.alarms polling (periodInMinutes >= 1) with optional
 * MCP server fs.watch() for real-time notification.
 *
 * chrome.storage.local keys:
 * - workflows — Library workflows; always-on gate via __CFS_evaluateAlwaysOnAutomation
 * - cfsFileWatchLastPoll — { ts, ok, idle?, reason?, error? }
 * - cfsFileWatchProjectIds — array of project IDs with active file watchers
 *
 * Messages:
 * - CFS_FILE_WATCH_REFRESH_NOW — force one poll tick
 * - CFS_FILE_WATCH_GET_STATUS — returns last poll info
 */
(function (global) {
  'use strict';

  var ALARM_NAME = 'cfs_file_watch_poll';
  var LAST_POLL_KEY = 'cfsFileWatchLastPoll';
  var WORKFLOWS_KEY = 'workflows';

  function storageLocalGet(keys) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.storage.local.get(keys, function (r) {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(r || {});
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageLocalSet(obj) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.storage.local.set(obj, function () {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Collect project IDs that have an always-on workflow with fileWatch scope.
   */
  function getFileWatchProjectIds(stored) {
    var w = stored[WORKFLOWS_KEY];
    if (!w || typeof w !== 'object' || Array.isArray(w)) return [];
    var ids = Object.keys(w);
    var projectIds = [];
    for (var i = 0; i < ids.length; i++) {
      var wf = w[ids[i]];
      if (!wf || !wf.alwaysOn || wf.alwaysOn.enabled !== true) continue;
      var sc = (wf.alwaysOn && wf.alwaysOn.scopes) || {};
      if (!sc.fileWatch) continue;
      // Look for project binding on the workflow
      var pId = (wf.alwaysOn && wf.alwaysOn.projectId) || '';
      if (pId && projectIds.indexOf(pId) < 0) projectIds.push(pId);
    }
    return projectIds;
  }

  function recordPoll(fields) {
    var payload = Object.assign({ ts: Date.now() }, fields);
    return storageLocalSet({ [LAST_POLL_KEY]: payload }).catch(function () {});
  }

  /**
   * One tick: check if any always-on workflow has fileWatch scope, 
   * scan import folders, notify sidepanel if files found.
   */
  async function tick() {
    try {
      var stored = await storageLocalGet([WORKFLOWS_KEY]);
      var evalFn = global.__CFS_evaluateAlwaysOnAutomation || global.__CFS_evaluateFollowingAutomation;
      if (typeof evalFn === 'function') {
        var gate = evalFn(stored);
        if (!gate.allowFileWatch) {
          await recordPoll({ ok: true, idle: true, reason: 'file_watch_not_enabled' });
          return;
        }
      }

      var projectIds = getFileWatchProjectIds(stored);
      
      // If workflows have fileWatch scope but no explicit projectId binding,
      // fall back to the currently selected project
      if (projectIds.length === 0) {
        var hasFileWatchScope = false;
        var w = stored[WORKFLOWS_KEY];
        if (w && typeof w === 'object' && !Array.isArray(w)) {
          var wfIds = Object.keys(w);
          for (var fi = 0; fi < wfIds.length; fi++) {
            var wf = w[wfIds[fi]];
            if (wf && wf.alwaysOn && wf.alwaysOn.enabled === true) {
              var sc = (wf.alwaysOn && wf.alwaysOn.scopes) || {};
              if (sc.fileWatch) { hasFileWatchScope = true; break; }
            }
          }
        }
        if (hasFileWatchScope) {
          try {
            var projData = await storageLocalGet(['selectedProjectId']);
            var selectedId = (projData.selectedProjectId || '').trim();
            if (selectedId) projectIds.push(selectedId);
          } catch (_) {}
        }
      }

      if (projectIds.length === 0) {
        await recordPoll({ ok: true, idle: true, reason: 'no_file_watch_projects' });
        return;
      }

      // Notify any open sidepanel to scan import folders (it has the FileSystem handles)
      // The sidepanel will pick up this message and run processMediaImports if files are found
      try {
        chrome.runtime.sendMessage({
          type: 'CFS_FILE_WATCH_SCAN_REQUEST',
          projectIds: projectIds,
          ts: Date.now(),
        });
      } catch (_) {
        // No listeners (sidepanel closed) — that's ok, can't scan without FS handles
      }

      await recordPoll({ ok: true, projectCount: projectIds.length });
    } catch (e) {
      await recordPoll({ ok: false, error: (e && e.message) || 'tick error' });
    }
  }

  function setupAlarm() {
    try {
      chrome.alarms.get(ALARM_NAME, function (existing) {
        if (!existing) {
          chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
        }
      });
    } catch (_) {}
  }

  // Expose for service-worker.js
  global.__CFS_fileWatch_tick = tick;
  global.__CFS_fileWatch_setupAlarm = setupAlarm;
})(typeof self !== 'undefined' ? self : globalThis);
