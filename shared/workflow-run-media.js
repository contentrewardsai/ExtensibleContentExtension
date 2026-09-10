/**
 * Layout and destination rules for workflow-run screen/webcam/audio captures.
 * HighLevel: Workflows / {workflowFolderId} / {runId} /
 * Local project: workflows/{workflowFolderId}/recordings/{runId}/
 */
(function (global) {
  'use strict';

  var GHL_ROOT_FOLDER = 'Workflows';
  var LOCAL_RECORDINGS_DIR = 'recordings';
  var FILE_CAPTURE = 'capture.webm';
  var FILE_SCREEN = 'screen.webm';
  var FILE_WEBCAM = 'webcam.webm';
  var FILE_SYSTEM = 'system.webm';
  var FILE_MIC = 'mic.webm';
  var FILE_AUDIO = 'audio.m4a';
  var FILE_META = 'run.json';

  var TRACK_ROLES = [
    { role: 'screen', label: 'Screen capture', kind: 'video', files: [FILE_SCREEN, FILE_CAPTURE] },
    { role: 'webcam', label: 'Webcam', kind: 'video', files: [FILE_WEBCAM] },
    { role: 'system', label: 'Computer audio', kind: 'audio', files: [FILE_SYSTEM, FILE_AUDIO] },
    { role: 'mic', label: 'Microphone', kind: 'audio', files: [FILE_MIC] },
  ];

  function fileNameForRole(role) {
    if (role === 'webcam') return FILE_WEBCAM;
    if (role === 'system') return FILE_SYSTEM;
    if (role === 'mic') return FILE_MIC;
    return FILE_SCREEN;
  }

  function classifyTrackFilename(name) {
    var n = String(name || '').split(/[/\\]/).pop().toLowerCase();
    if (!n) return '';
    if (n === FILE_WEBCAM || n.indexOf('webcam') >= 0) return 'webcam';
    if (n === FILE_MIC || /(^|[._-])mic(\.|$|[._-])/.test(n)) return 'mic';
    if (n === FILE_SYSTEM || /(^|[._-])system(\.|$|[._-])/.test(n)) return 'system';
    if (n === FILE_SCREEN || /(^|[._-])screen(\.|$|[._-])/.test(n)) return 'screen';
    if (n === FILE_CAPTURE) return 'screen';
    if (n === FILE_AUDIO) return 'system';
    if (/^recording-\d/.test(n) && n.indexOf('webcam') < 0) return 'screen';
    return '';
  }

  function isRecordingSessionName(name) {
    return /^recording[-_]/i.test(String(name || ''));
  }

  function pickTrackFiles(names) {
    var list = (names || []).filter(Boolean).map(function (n) { return String(n); });
    function find(role) {
      var def = null;
      for (var i = 0; i < TRACK_ROLES.length; i++) {
        if (TRACK_ROLES[i].role === role) { def = TRACK_ROLES[i]; break; }
      }
      var prefs = (def && def.files) || [];
      for (var p = 0; p < prefs.length; p++) {
        var want = String(prefs[p]).toLowerCase();
        for (var j = 0; j < list.length; j++) {
          if (list[j].toLowerCase() === want) return list[j];
        }
      }
      for (var k = 0; k < list.length; k++) {
        if (classifyTrackFilename(list[k]) === role) return list[k];
      }
      return '';
    }
    return {
      screen: find('screen'),
      webcam: find('webcam'),
      system: find('system'),
      mic: find('mic'),
    };
  }

  function tracksFromFilenames(names) {
    var picked = pickTrackFiles(names);
    var out = [];
    for (var i = 0; i < TRACK_ROLES.length; i++) {
      var def = TRACK_ROLES[i];
      var file = picked[def.role];
      if (!file) continue;
      out.push({ role: def.role, label: def.label, kind: def.kind, file: file });
    }
    return out;
  }

  function isRecordingSessionDir(name, childNames) {
    var kids = childNames || [];
    var tracks = tracksFromFilenames(kids);
    if (isRecordingSessionName(name) && tracks.length >= 1) return true;
    return tracks.length >= 2;
  }

  function safeRunDirName(runId) {
    var rid = String(runId == null ? '' : runId).replace(/^run_/, '');
    rid = rid.replace(/[^\w.-]/g, '_');
    return rid || String(Date.now());
  }

  function localRecordingDirSegments(folderId, runId) {
    return [LOCAL_RECORDINGS_DIR, safeRunDirName(runId)];
  }

  function localRelPath(folderId, runId, filename) {
    return LOCAL_RECORDINGS_DIR + '/' + safeRunDirName(runId) + '/' + filename;
  }

  function ghlFolderNames(folderId, runId) {
    return {
      root: GHL_ROOT_FOLDER,
      workflow: String(folderId || 'workflow'),
      run: safeRunDirName(runId),
    };
  }

  /**
   * Prefer the user's connected HighLevel location; otherwise backend My Files (shared GHL).
   * @param {{ ghlLocations?: Array, hasShared?: boolean }} accounts
   * @param {{ SHARED_STORAGE_SOURCE_ID?: string }} [api]
   */
  function pickHighLevelDest(accounts, api) {
    var sharedId = (api && api.SHARED_STORAGE_SOURCE_ID) || '__shared_storage__';
    var locs = (accounts && accounts.ghlLocations) || [];
    var owned = [];
    for (var i = 0; i < locs.length; i++) {
      var l = locs[i];
      if (!l || l.owned === false) continue;
      var id = l.location_id || l.id;
      if (!id) continue;
      owned.push({
        kind: 'ghl',
        id: String(id),
        name: l.location_name || String(id),
      });
    }
    if (owned.length) return owned[0];
    if (accounts && accounts.hasShared === false) return null;
    return { kind: 'shared', id: sharedId, name: 'My Files' };
  }

  function runHasSavedCapture(run) {
    if (!run || typeof run !== 'object') return false;
    return !!(
      run.mediaCaptureFile ||
      run.webcamCaptureFile ||
      run.screenCaptureFile ||
      run.systemCaptureFile ||
      run.micCaptureFile ||
      run.mediaCaptureUrl ||
      run.webcamCaptureUrl ||
      run.screenCaptureUrl ||
      run.systemCaptureUrl ||
      run.micCaptureUrl ||
      run.mediaCaptureDir
    );
  }

  function captureReadPlan(run, kind) {
    var rid = run && run.runId != null ? safeRunDirName(run.runId) : '';
    var dir = run && run.mediaCaptureDir ? String(run.mediaCaptureDir).replace(/^\/+|\/+$/g, '') : '';
    var fileKey = kind === 'webcam' ? 'webcamCaptureFile' : kind === 'audio' ? 'mediaCaptureAudioFile' : 'mediaCaptureFile';
    var urlKey = kind === 'webcam' ? 'webcamCaptureUrl' : kind === 'audio' ? 'mediaCaptureAudioUrl' : 'mediaCaptureUrl';
    var defaultName = kind === 'webcam' ? FILE_WEBCAM : kind === 'audio' ? FILE_AUDIO : FILE_CAPTURE;
    var stored = run && run[fileKey] ? String(run[fileKey]).trim() : '';
    var candidates = [];
    if (dir) {
      candidates.push({ dirSegments: dir.split('/').filter(Boolean), file: stored && stored.indexOf('/') < 0 ? stored : defaultName });
    }
    if (rid) {
      candidates.push({ dirSegments: [LOCAL_RECORDINGS_DIR, rid], file: defaultName });
    }
    var legacy = stored;
    if (legacy && legacy.indexOf('/') >= 0) {
      var parts = legacy.split('/');
      candidates.push({ dirSegments: parts.slice(0, -1), file: parts[parts.length - 1] });
    } else if (rid) {
      var legacyFile = legacy || (kind === 'webcam'
        ? 'run-' + rid + '-webcam.webm'
        : kind === 'audio'
          ? 'run-' + rid + '-audio.m4a'
          : 'run-' + rid + '-capture.webm');
      candidates.push({ dirSegments: ['runs'], file: legacyFile });
    }
    return {
      candidates: candidates,
      url: run && run[urlKey] ? String(run[urlKey]).trim() : '',
    };
  }

  function missSaveHint(loggedIn, hasProjectFolder) {
    if (loggedIn) return ' Could not save the recording to HighLevel. Set a local folder to keep a copy on disk.';
    if (hasProjectFolder) return ' Could not write the recording into the local folder.';
    return ' Sign in to save recordings to HighLevel, or set a local folder to save them on disk.';
  }

  global.CFS_workflowRunMedia = {
    GHL_ROOT_FOLDER: GHL_ROOT_FOLDER,
    LOCAL_RECORDINGS_DIR: LOCAL_RECORDINGS_DIR,
    FILE_CAPTURE: FILE_CAPTURE,
    FILE_SCREEN: FILE_SCREEN,
    FILE_WEBCAM: FILE_WEBCAM,
    FILE_SYSTEM: FILE_SYSTEM,
    FILE_MIC: FILE_MIC,
    FILE_AUDIO: FILE_AUDIO,
    FILE_META: FILE_META,
    TRACK_ROLES: TRACK_ROLES,
    fileNameForRole: fileNameForRole,
    classifyTrackFilename: classifyTrackFilename,
    isRecordingSessionName: isRecordingSessionName,
    pickTrackFiles: pickTrackFiles,
    tracksFromFilenames: tracksFromFilenames,
    isRecordingSessionDir: isRecordingSessionDir,
    safeRunDirName: safeRunDirName,
    localRecordingDirSegments: localRecordingDirSegments,
    localRelPath: localRelPath,
    ghlFolderNames: ghlFolderNames,
    pickHighLevelDest: pickHighLevelDest,
    runHasSavedCapture: runHasSavedCapture,
    captureReadPlan: captureReadPlan,
    missSaveHint: missSaveHint,
  };
})(typeof window !== 'undefined' ? window : globalThis);
