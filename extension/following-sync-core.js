/**
 * Pure helpers for Following local ↔ API sync (unit-testable, no chrome.*).
 * Loaded before sidepanel.js; exposes global FollowingSyncCore.
 */
(function (global) {
  'use strict';

  function toProfileIdStr(val) {
    if (val == null) return '';
    if (typeof val === 'string') {
      const s = val.trim();
      return s === '[object Object]' ? '' : s;
    }
    if (typeof val === 'object') {
      for (const key of ['id', 'ID', 'value', 'uuid', 'guid', '_id', '_serialized']) {
        const sub = val[key];
        if (typeof sub === 'string') return sub.trim();
        if (typeof sub === 'object' && sub != null) {
          const inner = toProfileIdStr(sub);
          if (inner && inner !== '[object Object]') return inner;
        }
      }
      return '';
    }
    return String(val).trim();
  }

  function toAccountIdStr(val) {
    if (val == null) return '';
    if (typeof val === 'string') {
      const s = val.trim();
      return s === '[object Object]' ? '' : s;
    }
    if (typeof val === 'object') {
      for (const key of ['id', 'ID', 'value', 'uuid', 'guid', '_id', '_serialized']) {
        const sub = val[key];
        if (typeof sub === 'string') return sub.trim();
        if (typeof sub === 'object' && sub != null) {
          const inner = toAccountIdStr(sub);
          if (inner && inner !== '[object Object]') return inner;
        }
      }
      const str = String(val).trim();
      if (str === '[object Object]') return '';
      return str;
    }
    return String(val).trim();
  }

  /** @returns {number|null} ms since epoch, or null if missing/unparseable */
  function parseUpdatedAtMs(isoOrString) {
    if (isoOrString == null) return null;
    const s = String(isoOrString).trim();
    if (!s) return null;
    const ms = Date.parse(s);
    return Number.isNaN(ms) ? null : ms;
  }

  function normalizeProfile(row) {
    const serverRaw = row.server_updated_at != null ? String(row.server_updated_at).trim() : '';
    const server_updated_at = serverRaw || undefined;
    const out = {
      id: toProfileIdStr(row.id ?? row.ID),
      name: String(row.name ?? '').trim(),
      user: String(row.user ?? '').trim(),
      birthday: String(row.birthday ?? '').trim(),
      deleted: row.deleted === true || row.deleted === 'true',
    };
    if (server_updated_at) out.server_updated_at = server_updated_at;
    if (typeof row.local_edited_at === 'number' && !Number.isNaN(row.local_edited_at)) {
      out.local_edited_at = row.local_edited_at;
    }
    return out;
  }

  function normalizeAccount(row) {
    const profileVal = row.profile;
    const profileId = profileVal && typeof profileVal === 'object' ? String(profileVal.id ?? profileVal.ID ?? '').trim() : String(profileVal ?? '').trim();
    return {
      id: toAccountIdStr(row.id ?? row.ID),
      handle: String(row.handle ?? '').trim(),
      platform: String(row.platform ?? '').trim(),
      url: String(row.url ?? '').trim(),
      profile: profileId,
      deleted: row.deleted === true || row.deleted === 'true',
    };
  }

  /** API row: ensure accounts array (mirrors ExtensionApi.normalizeFollowingItem). */
  function normalizeFollowingApiRow(row) {
    if (!row || typeof row !== 'object') return row;
    const accounts = row.accounts ?? row.following_accounts ?? [];
    return { ...row, accounts: Array.isArray(accounts) ? accounts : [] };
  }

  /** Backend following rows use UUID ids; fp_* is offline UI; any other non-UUID string is legacy/local-only (e.g. slug filenames). */
  function isUuidLikeFollowingId(id) {
    const s = (id != null && String(id).trim()) || '';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
  }

  function isLocalFollowingId(id) {
    const s = (id != null && String(id).trim()) || '';
    if (!s) return false;
    if (s.startsWith('fp_')) return true;
    return !isUuidLikeFollowingId(s);
  }

  /** slug / lowercased name -> platform row */
  function buildPlatformsBySlugMap(platformsList) {
    const platformsBySlug = {};
    (platformsList || []).forEach((p) => {
      if (p?.slug) platformsBySlug[String(p.slug).toLowerCase()] = p;
      if (p?.name) platformsBySlug[String(p.name).toLowerCase()] = p;
    });
    return platformsBySlug;
  }

  /**
   * Resolve platform_id for API. Returns { platform_id: string|null, skipped?: { platform: string, reason: string } }
   */
  function resolveAccountPlatformId(platformSlug, platformsBySlug) {
    const s = (platformSlug || '').toLowerCase().trim();
    const p = platformsBySlug[s] || platformsBySlug[String(platformSlug)];
    const id = p && p.id != null ? String(p.id).trim() : '';
    if (id) return { platform_id: id };
    return { platform_id: null, skipped: { platform: platformSlug || '', reason: 'unknown_platform' } };
  }

  /**
   * @param {string} profileId
   * @param {{ profiles: Array, accounts: Array, phones: Array, emails: Array, addresses: Array, notes: Array }} caches
   * @param {Object} platformsBySlug
   * @returns {{ payload: object|null, skippedAccounts: Array<{platform:string,reason:string}> }}
   */
  function buildFollowingPayloadForProfile(profileId, caches, platformsBySlug) {
    const prof = (caches.profiles || []).find((p) => (p.id || '').trim() === (profileId || '').trim());
    if (!prof) return { payload: null, skippedAccounts: [] };
    const accs = (caches.accounts || []).filter((a) => (a.profile || '').trim() === (profileId || '').trim() && !a.deleted);
    const phones = (caches.phones || []).filter((r) => (r.following || '').trim() === (profileId || '').trim() && !r.deleted);
    const emails = (caches.emails || []).filter((r) => (r.following || '').trim() === (profileId || '').trim() && !r.deleted);
    const addrs = (caches.addresses || []).filter((r) => (r.following || '').trim() === (profileId || '').trim() && !r.deleted);
    const noteList = (caches.notes || []).filter((r) => (r.following || '').trim() === (profileId || '').trim() && !r.deleted);
    const skippedAccounts = [];
    const accounts = [];
    accs.forEach((a) => {
      const { platform_id, skipped } = resolveAccountPlatformId(a.platform, platformsBySlug || {});
      if (platform_id) {
        accounts.push({ handle: a.handle, url: a.url, platform_id });
      } else if (skipped) skippedAccounts.push(skipped);
    });
    const payload = {
      name: prof.name || 'Unnamed',
      birthday: prof.birthday || null,
      accounts,
      emails: emails.map((r) => ({ email: r.email })),
      phones: phones.map((r) => ({ phone_number: r.phone })),
      addresses: addrs.map((r) => ({
        address: r.address,
        address_2: r.address_2,
        city: r.city,
        state: r.state,
        zip: r.zip,
        country: r.country,
      })),
      notes: noteList.map((r) => ({ note: r.note, access: r.access || undefined, scheduled: r.scheduled || undefined })),
    };
    return { payload, skippedAccounts };
  }

  /**
   * Convert API following[] to extension-shaped caches.
   * @param {Array} followingList
   * @param {Object} platformsMap - id -> { slug, name }
   */
  function supabaseFollowingToExtensionCaches(followingList, platformsMap) {
    const platformsMapSafe = platformsMap && typeof platformsMap === 'object' ? platformsMap : {};
    const profiles = [];
    const accounts = [];
    const phones = [];
    const emails = [];
    const addresses = [];
    const notes = [];
    const toPlatformSlug = (platformId, platformObj) => {
      if (platformObj?.slug) return String(platformObj.slug).toLowerCase();
      if (platformObj?.name) return String(platformObj.name).toLowerCase();
      const p = platformsMapSafe[platformId] || platformsMapSafe[String(platformId)];
      return p ? (p.slug || p.name || '').toLowerCase() : '';
    };
    (Array.isArray(followingList) ? followingList : []).forEach((f) => {
      const row = normalizeFollowingApiRow(f);
      if (!row || row.deleted) return;
      const pId = row.id || '';
      const updatedIso = row.updated_at != null ? String(row.updated_at).trim() : (row.updatedAt != null ? String(row.updatedAt).trim() : '');
      profiles.push(
        normalizeProfile({
          id: pId,
          name: row.name || '',
          user: row.user_id || '',
          birthday: row.birthday || '',
          deleted: false,
          server_updated_at: updatedIso,
        }),
      );
      (row.accounts || []).forEach((a) => {
        if (a.deleted) return;
        const platformSlug = toPlatformSlug(a.platform_id, a.platform) || (a.platform?.slug || a.platform?.name || '').toLowerCase();
        accounts.push(normalizeAccount({ id: a.id, handle: a.handle || '', platform: platformSlug, url: a.url || '', profile: pId, deleted: false }));
      });
      (row.phones || []).forEach((r) => {
        if (r.deleted) return;
        phones.push({ id: r.id, phone: r.phone_number || r.phone || '', following: pId, added_by: r.added_by || '', deleted: false });
      });
      (row.emails || []).forEach((r) => {
        if (r.deleted) return;
        emails.push({ id: r.id, email: r.email || '', following: pId, added_by: r.added_by || '', deleted: false });
      });
      (row.addresses || []).forEach((r) => {
        if (r.deleted) return;
        addresses.push({
          id: r.id,
          following: pId,
          added_by: r.added_by || '',
          address: r.address || '',
          address_2: r.address_2 || '',
          city: r.city || '',
          state: r.state || '',
          zip: r.zip || '',
          country: r.country || '',
          deleted: false,
        });
      });
      (row.notes || []).forEach((r) => {
        if (r.deleted) return;
        notes.push({ id: r.id, following: pId, deleted: false, access: r.access || '', added_by: r.added_by || '', note: r.note || '', scheduled: r.scheduled || '' });
      });
    });
    return { profiles, accounts, phones, emails, addresses, notes };
  }

  /**
   * @param {{ onFollowingStatus?: (msg: string) => void }} [options]
   * @returns {{ merged: object, profilesToSync: string[], profilesNeedingUpload: string[] }}
   */
  function mergeLocalAndOnlineFollowing(local, online, options) {
    const onFollowingStatus = options && typeof options.onFollowingStatus === 'function' ? options.onFollowingStatus : null;
    const localProfiles = (local.profiles || []).filter((p) => p && !p.deleted);
    const onlineProfiles = (online.profiles || []).filter((p) => p && !p.deleted);
    const onlineProfileIds = new Set();
    onlineProfiles.forEach((p) => {
      const id = (p.id || '').trim();
      if (id) onlineProfileIds.add(id);
    });
    const localAccounts = (local.accounts || []).filter((a) => a && !a.deleted);
    const onlineAccounts = (online.accounts || []).filter((a) => a && !a.deleted);
    const localPhones = (local.phones || []).filter((r) => r && !r.deleted);
    const onlinePhones = (online.phones || []).filter((r) => r && !r.deleted);
    const localEmails = (local.emails || []).filter((r) => r && !r.deleted);
    const onlineEmails = (online.emails || []).filter((r) => r && !r.deleted);
    const localAddresses = (local.addresses || []).filter((r) => r && !r.deleted);
    const onlineAddresses = (online.addresses || []).filter((r) => r && !r.deleted);
    const localNotes = (local.notes || []).filter((r) => r && !r.deleted);
    const onlineNotes = (online.notes || []).filter((r) => r && !r.deleted);

    const byProfile = (arr, key) => {
      const m = {};
      (arr || []).forEach((r) => {
        const p = (r[key] || r.following || '').trim();
        if (p) {
          if (!m[p]) m[p] = [];
          m[p].push(r);
        }
      });
      return m;
    };
    const localAccountsByProfile = byProfile(localAccounts, 'profile');
    const onlineAccountsByProfile = byProfile(onlineAccounts, 'profile');
    const localPhonesByProfile = byProfile(localPhones, 'following');
    const onlinePhonesByProfile = byProfile(onlinePhones, 'following');
    const localEmailsByProfile = byProfile(localEmails, 'following');
    const onlineEmailsByProfile = byProfile(onlineEmails, 'following');
    const localAddressesByProfile = byProfile(localAddresses, 'following');
    const onlineAddressesByProfile = byProfile(onlineAddresses, 'following');
    const localNotesByProfile = byProfile(localNotes, 'following');
    const onlineNotesByProfile = byProfile(onlineNotes, 'following');

    const accKey = (a) => `${(a.handle || '').toLowerCase()}|${(a.platform || '').toLowerCase()}|${(a.url || '').toLowerCase()}`;
    const phoneKey = (r, pid) => `ph|${(r.phone || r.phone_number || '').trim().toLowerCase()}|${pid}`;
    const emailKey = (r, pid) => `em|${(r.email || '').trim().toLowerCase()}|${pid}`;
    const addrKey = (r, pid) => `ad|${(r.address || '').trim()}|${(r.city || '').trim()}|${(r.country || '').trim()}|${pid}`;
    const noteKey = (r, pid) => `nt|${(r.note || '').trim().slice(0, 200)}|${pid}`;

    const accountUrls = (accs) => new Set((accs || []).map((a) => (a.url || '').trim().toLowerCase()).filter(Boolean));
    const profileKey = (p) => `${(p.name || '').toLowerCase()}|${(p.user || '').toLowerCase()}`;

    const matchLocalToOnline = (localProf) => {
      const lid = (localProf.id || '').trim();
      const lkey = profileKey(localProf);
      const lUrls = accountUrls(localAccountsByProfile[lid] || []);
      for (const op of onlineProfiles) {
        const oid = (op.id || '').trim();
        if (lid && oid && lid === oid) return op;
        if (lkey && lkey === profileKey(op)) return op;
        const oUrls = accountUrls(onlineAccountsByProfile[oid] || []);
        for (const u of lUrls) {
          if (oUrls.has(u)) return op;
        }
      }
      return null;
    };

    function localHasChildNotOnServer(localPid, oid) {
      const oAcc = onlineAccountsByProfile[oid] || [];
      const lAcc = localAccountsByProfile[localPid] || [];
      const oAccKeys = new Set(oAcc.map((a) => accKey(a)));
      for (const a of lAcc) {
        if (!oAccKeys.has(accKey(a))) return true;
      }
      const oPh = onlinePhonesByProfile[oid] || [];
      const lPh = localPhonesByProfile[localPid] || [];
      const oPhKeys = new Set(oPh.map((r) => phoneKey(r, oid)));
      for (const r of lPh) {
        if (!oPhKeys.has(phoneKey(r, oid))) return true;
      }
      const oEm = onlineEmailsByProfile[oid] || [];
      const lEm = localEmailsByProfile[localPid] || [];
      const oEmKeys = new Set(oEm.map((r) => emailKey(r, oid)));
      for (const r of lEm) {
        if (!oEmKeys.has(emailKey(r, oid))) return true;
      }
      const oAd = onlineAddressesByProfile[oid] || [];
      const lAd = localAddressesByProfile[localPid] || [];
      const oAdKeys = new Set(oAd.map((r) => addrKey(r, oid)));
      for (const r of lAd) {
        if (!oAdKeys.has(addrKey(r, oid))) return true;
      }
      const oNt = onlineNotesByProfile[oid] || [];
      const lNt = localNotesByProfile[localPid] || [];
      const oNtKeys = new Set(oNt.map((r) => noteKey(r, oid)));
      for (const r of lNt) {
        if (!oNtKeys.has(noteKey(r, oid))) return true;
      }
      return false;
    }

    const mergedProfiles = [];
    const localIdToOnlineId = {};
    const profilesToSync = [];
    /** @type {Map<string, 'baseline'|'serverWins'|'localWins'>} */
    const lwwByPid = new Map();

    for (const op of onlineProfiles) {
      const oid = (op.id || '').trim();
      const localMatch = localProfiles.find((lp) => matchLocalToOnline(lp) === op);
      const srvMs = parseUpdatedAtMs(op.server_updated_at);
      const locMs = localMatch && typeof localMatch.local_edited_at === 'number' && !Number.isNaN(localMatch.local_edited_at)
        ? localMatch.local_edited_at
        : null;

      let lwwMode = 'baseline';
      if (srvMs != null) {
        if (locMs == null || srvMs > locMs) lwwMode = 'serverWins';
        else lwwMode = 'localWins';
      }
      lwwByPid.set(oid, lwwMode);

      const onlineIso = op.server_updated_at != null && String(op.server_updated_at).trim() ? String(op.server_updated_at).trim() : '';

      let merged;
      if (lwwMode === 'serverWins') {
        merged = normalizeProfile({
          id: oid,
          name: String(op.name ?? '').trim(),
          user: String(op.user ?? '').trim(),
          birthday: String(op.birthday ?? '').trim(),
          deleted: false,
          server_updated_at: onlineIso,
        });
        if (localMatch && onFollowingStatus) {
          const lpId = (localMatch.id || '').trim();
          if (localHasChildNotOnServer(lpId, oid)) {
            const label = merged.name || 'profile';
            onFollowingStatus(`Some local changes were replaced by newer server data for "${label}".`);
          }
        }
      } else if (lwwMode === 'localWins') {
        merged = normalizeProfile({
          id: oid,
          name: (localMatch.name != null && String(localMatch.name).trim()) ? String(localMatch.name).trim() : String(op.name ?? '').trim(),
          user: (localMatch.user != null && String(localMatch.user).trim()) ? String(localMatch.user).trim() : String(op.user ?? '').trim(),
          birthday: (localMatch.birthday != null && String(localMatch.birthday).trim()) ? String(localMatch.birthday).trim() : String(op.birthday ?? '').trim(),
          deleted: false,
          local_edited_at: localMatch.local_edited_at,
          server_updated_at: onlineIso,
        });
      } else {
        merged = normalizeProfile({
          id: oid,
          name: (op.name != null && String(op.name).trim()) ? String(op.name).trim() : String(localMatch?.name || '').trim() || '',
          user: (op.user != null && String(op.user).trim()) ? String(op.user).trim() : String(localMatch?.user || '').trim() || '',
          birthday: (op.birthday != null && String(op.birthday).trim()) ? String(op.birthday).trim() : String(localMatch?.birthday || '').trim() || '',
          deleted: false,
          local_edited_at: localMatch?.local_edited_at,
          server_updated_at: onlineIso,
        });
      }

      mergedProfiles.push(merged);
      if (localMatch) {
        localIdToOnlineId[(localMatch.id || '').trim()] = oid;
        const hadGaps = (!op.name && localMatch.name) || (!op.user && localMatch.user) || (!op.birthday && localMatch.birthday);
        if (hadGaps) profilesToSync.push(oid);
      }
    }

    for (const lp of localProfiles) {
      const lid = (lp.id || '').trim();
      if (localIdToOnlineId[lid]) continue;
      mergedProfiles.push(normalizeProfile({ ...lp, id: lp.id, deleted: false }));
    }

    const mergedAccounts = [];
    for (const p of mergedProfiles) {
      const pid = (p.id || '').trim();
      const localPid = Object.entries(localIdToOnlineId).find(([, v]) => v === pid)?.[0] || pid;
      const lacc = localAccountsByProfile[pid] || localAccountsByProfile[localPid] || [];
      const oacc = onlineAccountsByProfile[pid] || [];
      const mode = lwwByPid.get(pid) || 'baseline';
      const accSeen = new Set();
      if (mode === 'serverWins') {
        oacc.forEach((a) => {
          const k = accKey(a);
          if (accSeen.has(k)) return;
          accSeen.add(k);
          mergedAccounts.push(normalizeAccount({ ...a, profile: pid, deleted: false }));
        });
      } else {
        [...oacc, ...lacc].forEach((a) => {
          const k = accKey(a);
          if (accSeen.has(k)) return;
          accSeen.add(k);
          mergedAccounts.push(normalizeAccount({ ...a, profile: pid, deleted: false }));
        });
      }
    }

    const mergeSimple = (localArr, onlineArr, keyFn, modeForPid) => {
      const seen = new Set();
      const out = [];
      for (const p of mergedProfiles) {
        const pid = (p.id || '').trim();
        const localPid = Object.entries(localIdToOnlineId).find(([, v]) => v === pid)?.[0] || pid;
        const localForP = (localArr || []).filter((r) => (r.following || '').trim() === pid || (r.following || '').trim() === localPid);
        const onlineForP = (onlineArr || []).filter((r) => (r.following || '').trim() === pid);
        const mode = modeForPid(pid);
        const rows = mode === 'serverWins' ? onlineForP : [...onlineForP, ...localForP];
        rows.forEach((r) => {
          const k = keyFn(r, pid);
          if (seen.has(k)) return;
          seen.add(k);
          out.push({ ...r, following: pid, deleted: false });
        });
      }
      return out;
    };

    const modeFn = (pid) => lwwByPid.get(pid) || 'baseline';
    const mergedPhones = mergeSimple(localPhones, onlinePhones, phoneKey, modeFn);
    const mergedEmails = mergeSimple(localEmails, onlineEmails, emailKey, modeFn);
    const mergedAddresses = mergeSimple(localAddresses, onlineAddresses, addrKey, modeFn);
    const mergedNotes = mergeSimple(localNotes, onlineNotes, noteKey, modeFn);

    const merged = {
      profiles: mergedProfiles,
      accounts: mergedAccounts,
      phones: mergedPhones,
      emails: mergedEmails,
      addresses: mergedAddresses,
      notes: mergedNotes,
    };

    const profilesNeedingUploadSet = new Set(profilesToSync);
    Object.values(localIdToOnlineId).forEach((oid) => {
      if (oid) profilesNeedingUploadSet.add(oid);
    });
    mergedProfiles.forEach((p) => {
      const pid = (p.id || '').trim();
      if (pid && isLocalFollowingId(pid)) profilesNeedingUploadSet.add(pid);
    });
    /** UUID from another account's server not in current GET — must POST to this account. */
    mergedProfiles.forEach((p) => {
      const pid = (p.id || '').trim();
      if (!pid) return;
      if (isUuidLikeFollowingId(pid) && !isLocalFollowingId(pid) && !onlineProfileIds.has(pid)) {
        profilesNeedingUploadSet.add(pid);
      }
    });

    return {
      merged,
      profilesToSync,
      profilesNeedingUpload: [...profilesNeedingUploadSet],
    };
  }

  global.FollowingSyncCore = {
    normalizeFollowingApiRow,
    normalizeProfile,
    normalizeAccount,
    isLocalFollowingId,
    isUuidLikeFollowingId,
    buildPlatformsBySlugMap,
    resolveAccountPlatformId,
    buildFollowingPayloadForProfile,
    supabaseFollowingToExtensionCaches,
    mergeLocalAndOnlineFollowing,
    parseUpdatedAtMs,
    toProfileIdStr,
    toAccountIdStr,
  };
})(typeof window !== 'undefined' ? window : self);
