/**
 * Upload-Post API client for submitting posts from uploads/{projectId}/posts/...
 * API docs: https://docs.upload-post.com/llm.txt
 * Key source: when user is logged in, prefers ExtensionApi.getUploadPostApiKey() (Whop/Supabase);
 * otherwise uses chrome.storage.local (uploadPostApiKey).
 */
(function () {
  'use strict';

  const BASE = 'https://api.upload-post.com/api';
  const STORAGE_KEY = 'uploadPostApiKey';

  async function getApiKey() {
    if (typeof window !== 'undefined' && window.ExtensionApi && typeof window.ExtensionApi.getUploadPostApiKey === 'function') {
      try {
        const loggedIn = await window.ExtensionApi.isLoggedIn();
        if (loggedIn) {
          const res = await window.ExtensionApi.getUploadPostApiKey();
          if (res && res.ok && typeof res.upload_post_api_key === 'string' && res.upload_post_api_key.trim())
            return res.upload_post_api_key.trim();
        }
      } catch (_) {}
    }
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
    const o = await chrome.storage.local.get(STORAGE_KEY);
    const k = o[STORAGE_KEY];
    return typeof k === 'string' && k.trim() ? k.trim() : null;
  }

  async function setApiKey(key) {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    await chrome.storage.local.set({ [STORAGE_KEY]: (key && key.trim()) || '' });
  }

  /**
   * @param {FormData} form
   * @returns {Promise<{ ok: boolean, json?: object, error?: string }>}
   */
  async function request(form, endpoint) {
    const apiKey = await getApiKey();
    if (!apiKey) return { ok: false, error: 'Upload-Post API key not set. Set it in the post card or Library → Posts.' };
    const url = BASE + endpoint;
    const headers = { Authorization: 'Apikey ' + apiKey };
    try {
      const body = form.get ? form : new URLSearchParams(form);
      const res = await fetch(url, {
        method: 'POST',
        headers: body instanceof FormData ? headers : { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json.message || json.error || res.statusText || 'Request failed';
        const detail = res.status === 429 && json.violations ? ' ' + JSON.stringify(json.violations) : '';
        return { ok: false, error: msg + detail, json };
      }
      return { ok: true, json };
    } catch (e) {
      return { ok: false, error: e.message || 'Network error' };
    }
  }

  /**
   * Submit video post. Uses multipart/form-data with file or URL.
   * @param {{ user: string, platform: string[], title: string, description?: string, video: File|string, options?: object }} params
   */
  async function submitVideo(params) {
    const form = new FormData();
    form.append('user', params.user);
    (params.platform || []).forEach((p) => form.append('platform[]', p));
    form.append('title', params.title || '');
    if (params.description != null) form.append('description', params.description);
    if (params.video instanceof File) {
      form.append('video', params.video);
    } else if (typeof params.video === 'string' && params.video) {
      form.append('video', params.video);
    } else {
      return { ok: false, error: 'Missing video file or URL' };
    }
    const opts = params.options || {};
    if (opts.scheduled_date) form.append('scheduled_date', opts.scheduled_date);
    if (opts.async_upload !== undefined) form.append('async_upload', opts.async_upload ? 'true' : 'false');
    if (opts.timezone) form.append('timezone', opts.timezone);
    Object.keys(opts).forEach((k) => {
      if (['scheduled_date', 'async_upload', 'timezone'].includes(k)) return;
      const v = opts[k];
      if (Array.isArray(v)) {
        v.forEach((item) => form.append(k + '[]', String(item)));
      } else if (v !== undefined && v !== null && typeof v !== 'object') {
        form.append(k, String(v));
      }
    });
    return request(form, '/upload');
  }

  /**
   * Submit photo post. Uses multipart with files or URLs.
   * @param {{ user: string, platform: string[], title: string, description?: string, photos: File[]|string[], options?: object }} params
   */
  async function submitPhotos(params) {
    const form = new FormData();
    form.append('user', params.user);
    (params.platform || []).forEach((p) => form.append('platform[]', p));
    form.append('title', params.title || '');
    if (params.description != null) form.append('description', params.description);
    const photos = params.photos || [];
    if (photos.length === 0) return { ok: false, error: 'Missing photos' };
    photos.forEach((item) => {
      if (item instanceof File) form.append('photos[]', item);
      else if (typeof item === 'string') form.append('photos[]', item);
    });
    const opts = params.options || {};
    if (opts.scheduled_date) form.append('scheduled_date', opts.scheduled_date);
    if (opts.async_upload !== undefined) form.append('async_upload', opts.async_upload ? 'true' : 'false');
    if (opts.timezone) form.append('timezone', opts.timezone);
    Object.keys(opts).forEach((k) => {
      if (['scheduled_date', 'async_upload', 'timezone'].includes(k)) return;
      const v = opts[k];
      if (Array.isArray(v)) {
        v.forEach((item) => form.append(k + '[]', String(item)));
      } else if (v !== undefined && v !== null && typeof v !== 'object') {
        form.append(k, String(v));
      }
    });
    return request(form, '/upload_photos');
  }

  /**
   * Submit text-only post.
   * @param {{ user: string, platform: string[], title: string, description?: string, options?: object }} params
   */
  async function submitText(params) {
    const form = new FormData();
    form.append('user', params.user);
    (params.platform || []).forEach((p) => form.append('platform[]', p));
    form.append('title', params.title || '');
    if (params.description != null) form.append('description', params.description);
    const opts = params.options || {};
    if (opts.scheduled_date) form.append('scheduled_date', opts.scheduled_date);
    if (opts.async_upload !== undefined) form.append('async_upload', opts.async_upload ? 'true' : 'false');
    if (opts.timezone) form.append('timezone', opts.timezone);
    Object.keys(opts).forEach((k) => {
      if (['scheduled_date', 'async_upload', 'timezone'].includes(k)) return;
      const v = opts[k];
      if (Array.isArray(v)) {
        v.forEach((item) => form.append(k + '[]', String(item)));
      } else if (v !== undefined && v !== null && typeof v !== 'object') {
        form.append(k, String(v));
      }
    });
    return request(form, '/upload_text');
  }

  /**
   * Check upload status (async or scheduled).
   * @param {{ request_id?: string, job_id?: string }}
   */
  async function checkStatus(params) {
    const q = new URLSearchParams();
    if (params.request_id) q.set('request_id', params.request_id);
    if (params.job_id) q.set('job_id', params.job_id);
    if (!params.request_id && !params.job_id) return { ok: false, error: 'request_id or job_id required' };
    const apiKey = await getApiKey();
    if (!apiKey) return { ok: false, error: 'API key not set' };
    try {
      const res = await fetch(BASE + '/uploadposts/status?' + q.toString(), {
        headers: { Authorization: 'Apikey ' + apiKey },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json.message || json.error || res.statusText, json };
      return { ok: true, json };
    } catch (e) {
      return { ok: false, error: e.message || 'Network error' };
    }
  }

  /**
   * List scheduled posts (GET /api/uploadposts/schedule).
   * @returns {{ ok: boolean, json?: Array<{ job_id: string, scheduled_date: string, post_type: string, profile_username: string, title: string, preview_url?: string }>, error?: string }}
   */
  async function listScheduled() {
    const apiKey = await getApiKey();
    if (!apiKey) return { ok: false, error: 'API key not set' };
    try {
      const res = await fetch(BASE + '/uploadposts/schedule', {
        headers: { Authorization: 'Apikey ' + apiKey },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json.message || json.error || res.statusText, json };
      const list = Array.isArray(json) ? json : (json.result || json.payload || json.list || []);
      return { ok: true, json: list };
    } catch (e) {
      return { ok: false, error: e.message || 'Network error' };
    }
  }

  /**
   * Cancel a scheduled post (DELETE /api/uploadposts/schedule/:job_id).
   * @param {string} jobId
   */
  async function cancelScheduled(jobId) {
    if (!jobId || !String(jobId).trim()) return { ok: false, error: 'job_id required' };
    const apiKey = await getApiKey();
    if (!apiKey) return { ok: false, error: 'API key not set' };
    try {
      const res = await fetch(BASE + '/uploadposts/schedule/' + encodeURIComponent(String(jobId).trim()), {
        method: 'DELETE',
        headers: { Authorization: 'Apikey ' + apiKey },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json.error || json.message || res.statusText, json };
      return { ok: true, json };
    } catch (e) {
      return { ok: false, error: e.message || 'Network error' };
    }
  }

  /**
   * Retrieve paginated upload history.
   * @param {{ page?: number, limit?: number }} params
   */
  async function getHistory(params = {}) {
    const apiKey = await getApiKey();
    if (!apiKey) return { ok: false, error: 'API key not set' };
    const q = new URLSearchParams();
    if (params.page) q.set('page', String(params.page));
    if (params.limit) q.set('limit', String(params.limit));
    try {
      const res = await fetch(BASE + '/uploadposts/history?' + q.toString(), {
        headers: { Authorization: 'Apikey ' + apiKey },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json.error || json.message || res.statusText, json };
      return { ok: true, json };
    } catch (e) {
      return { ok: false, error: e.message || 'Network error' };
    }
  }

  /**
   * Get all user profiles for the current API key.
   * @returns {{ ok: boolean, profiles?: Array, error?: string }}
   */
  async function getUserProfiles() {
    const apiKey = await getApiKey();
    if (!apiKey) return { ok: false, error: 'API key not set' };
    return getUserProfilesWithKey(apiKey);
  }

  /**
   * Get user profiles using a specific API key (e.g. the one from Settings).
   * Use this to fetch from the local key when getApiKey() prefers the backend key.
   * @param {string} apiKey
   * @returns {{ ok: boolean, profiles?: Array, error?: string }}
   */
  async function getUserProfilesWithKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) return { ok: false, error: 'API key not set' };
    try {
      const res = await fetch(BASE + '/uploadposts/users', {
        headers: { Authorization: 'Apikey ' + apiKey.trim() },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json.error || json.message || res.statusText, json };
      return { ok: true, profiles: json.profiles || [], plan: json.plan, limit: json.limit };
    } catch (e) {
      return { ok: false, error: e.message || 'Network error' };
    }
  }

  async function getLocalApiKey() {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
    const o = await chrome.storage.local.get(STORAGE_KEY);
    const k = o[STORAGE_KEY];
    return typeof k === 'string' && k.trim() ? k.trim() : null;
  }

  /**
   * Create a user profile under the given API key (POST /uploadposts/users).
   * @param {string} apiKey
   * @param {string} username — unique id for the user on your platform
   * @returns {Promise<{ ok: boolean, profile?: object, error?: string, status?: number, json?: object }>}
   */
  async function createUserProfileWithKey(apiKey, username) {
    const key = typeof apiKey === 'string' ? apiKey.trim() : '';
    const u = typeof username === 'string' ? username.trim() : '';
    if (!key) return { ok: false, error: 'API key not set' };
    if (!u) return { ok: false, error: 'username required' };
    try {
      const res = await fetch(BASE + '/uploadposts/users', {
        method: 'POST',
        headers: {
          Authorization: 'Apikey ' + key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: u }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 201 || res.ok) return { ok: true, profile: json.profile, json };
      if (res.status === 409) return { ok: false, error: json.error || json.message || 'Profile already exists', status: 409, json };
      return { ok: false, error: json.error || json.message || res.statusText, status: res.status, json };
    } catch (e) {
      return { ok: false, error: e.message || 'Network error' };
    }
  }

  /**
   * Generate a JWT access URL for a user profile.
   * @param {{ username: string, redirect_url?: string, platforms?: string[] }} params
   */
  async function generateJwt(params) {
    const apiKey = await getApiKey();
    if (!apiKey) return { ok: false, error: 'API key not set' };
    if (!params || !params.username) return { ok: false, error: 'username required' };
    try {
      const res = await fetch(BASE + '/uploadposts/users/generate-jwt', {
        method: 'POST',
        headers: {
          Authorization: 'Apikey ' + apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json.error || json.message || res.statusText, json };
      return { ok: true, access_url: json.access_url, duration: json.duration, json };
    } catch (e) {
      return { ok: false, error: e.message || 'Network error' };
    }
  }

  /**
   * Submit an FFmpeg conversion job.
   * @param {{ file: File|Blob, command: string, outputExtension: string }} params
   * @returns {Promise<{ ok: boolean, job_id?: string, error?: string }>}
   */
  async function ffmpegSubmit(params) {
    const apiKey = await getApiKey();
    if (!apiKey) return { ok: false, error: 'API key not set' };
    const form = new FormData();
    const file = params.file instanceof File ? params.file : new File([params.file], 'input.webm', { type: params.file.type || 'video/webm' });
    form.append('file', file);
    form.append('full_command', params.command);
    form.append('output_extension', params.outputExtension);
    try {
      const res = await fetch(BASE + '/uploadposts/ffmpeg/jobs/upload', {
        method: 'POST',
        headers: { Authorization: 'Apikey ' + apiKey },
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json.message || json.error || res.statusText, json };
      return { ok: true, job_id: json.job_id, json };
    } catch (e) {
      return { ok: false, error: e.message || 'Network error' };
    }
  }

  /**
   * Poll FFmpeg job status.
   * @param {string} jobId
   * @returns {Promise<{ ok: boolean, status?: string, json?: object, error?: string }>}
   */
  async function ffmpegStatus(jobId) {
    const apiKey = await getApiKey();
    if (!apiKey) return { ok: false, error: 'API key not set' };
    try {
      const res = await fetch(BASE + '/uploadposts/ffmpeg/jobs/' + encodeURIComponent(jobId), {
        headers: { Authorization: 'Apikey ' + apiKey },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json.message || json.error || res.statusText, json };
      return { ok: true, status: json.status, json };
    } catch (e) {
      return { ok: false, error: e.message || 'Network error' };
    }
  }

  /**
   * Download the finished FFmpeg output as a Blob.
   * @param {string} jobId
   * @returns {Promise<{ ok: boolean, blob?: Blob, contentType?: string, error?: string }>}
   */
  async function ffmpegDownload(jobId) {
    const apiKey = await getApiKey();
    if (!apiKey) return { ok: false, error: 'API key not set' };
    try {
      const res = await fetch(BASE + '/uploadposts/ffmpeg/jobs/' + encodeURIComponent(jobId) + '/download', {
        headers: { Authorization: 'Apikey ' + apiKey },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, error: text || res.statusText };
      }
      const blob = await res.blob();
      const ct = res.headers.get('content-type') || 'video/mp4';
      return { ok: true, blob, contentType: ct };
    } catch (e) {
      return { ok: false, error: e.message || 'Network error' };
    }
  }

  /**
   * Convert a video/audio blob to MP4 via the Upload Post FFmpeg API.
   * Submits, polls until done, downloads the result.
   * @param {File|Blob} file
   * @param {function} [onProgress] - optional callback(statusString)
   * @returns {Promise<{ ok: boolean, blob?: Blob, error?: string }>}
   */
  async function convertToMp4(file, onProgress) {
    const report = typeof onProgress === 'function' ? onProgress : function () {};

    report('Submitting to FFmpeg...');
    const submit = await ffmpegSubmit({
      file: file,
      command: 'ffmpeg -y -i {input} -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k {output}',
      outputExtension: 'mp4',
    });
    if (!submit.ok) return { ok: false, error: 'FFmpeg submit failed: ' + (submit.error || 'unknown') };

    const jobId = submit.job_id;
    report('Converting (job ' + jobId.slice(0, 8) + '...)');

    const maxPolls = 60;
    const pollInterval = 3000;
    for (let i = 0; i < maxPolls; i++) {
      await new Promise(r => setTimeout(r, pollInterval));
      const status = await ffmpegStatus(jobId);
      if (!status.ok) return { ok: false, error: 'FFmpeg status check failed: ' + (status.error || 'unknown') };

      if (status.status === 'FINISHED') {
        report('Downloading converted MP4...');
        const dl = await ffmpegDownload(jobId);
        if (!dl.ok) return { ok: false, error: 'FFmpeg download failed: ' + (dl.error || 'unknown') };
        return { ok: true, blob: dl.blob };
      }
      if (status.status === 'ERROR') {
        return { ok: false, error: 'FFmpeg conversion failed on server' };
      }
      report('Converting... (' + status.status + ')');
    }
    return { ok: false, error: 'FFmpeg conversion timed out after ' + (maxPolls * pollInterval / 1000) + 's' };
  }

  if (typeof window !== 'undefined') {
    window.UploadPost = {
      getApiKey,
      getLocalApiKey,
      setApiKey,
      submitVideo,
      submitPhotos,
      submitText,
      checkStatus,
      listScheduled,
      cancelScheduled,
      getHistory,
      getUserProfiles,
      getUserProfilesWithKey,
      createUserProfileWithKey,
      generateJwt,
      ffmpegSubmit,
      ffmpegStatus,
      ffmpegDownload,
      convertToMp4,
    };
  }
})();
