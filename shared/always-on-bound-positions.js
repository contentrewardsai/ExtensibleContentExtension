/**
 * Always-on multi-position boundRows helpers (V3 + Infinity).
 * CFS_ALWAYS_ON_BOUND_POSITIONS — loaded via importScripts / side panel script tags.
 */
(function (global) {
  'use strict';

  function trimStr(v) {
    return v == null ? '' : String(v).trim();
  }

  function cloneRow(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return {};
    var out = {};
    var keys = Object.keys(row);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = row[k];
      if (v === undefined) continue;
      out[k] = v == null ? '' : (typeof v === 'boolean' || typeof v === 'number' ? v : String(v));
    }
    return out;
  }

  function positionIdKey(kind, row) {
    var r = row || {};
    if (kind === 'infi') {
      return trimStr(r.positionNftId || r.infiPositionTokenId || r.v3PositionTokenId);
    }
    return trimStr(r.v3PositionTokenId || r.positionNftId || r.infiPositionTokenId);
  }

  /**
   * Normalize alwaysOn into a positions array.
   * Legacy: scalar boundRow with an id → one-element list.
   * If boundRows is an explicit array (including []), use it only — do not
   * rehydrate from boundRow (empty [] means intentionally no positions).
   */
  function normalizeBoundPositions(alwaysOn, kind) {
    var k = kind === 'infi' ? 'infi' : 'v3';
    var ao = alwaysOn && typeof alwaysOn === 'object' ? alwaysOn : {};
    var rows = [];
    if (Array.isArray(ao.boundRows)) {
      for (var i = 0; i < ao.boundRows.length; i++) {
        var r = cloneRow(ao.boundRows[i]);
        var id = positionIdKey(k, r);
        if (!id) continue;
        rows.push(r);
      }
      return rows;
    }
    if (ao.boundRow && typeof ao.boundRow === 'object' && !Array.isArray(ao.boundRow)) {
      var legacy = cloneRow(ao.boundRow);
      if (positionIdKey(k, legacy)) rows.push(legacy);
    }
    return rows;
  }

  function syncPrimaryBoundRow(alwaysOn, kind) {
    var ao = alwaysOn && typeof alwaysOn === 'object' ? alwaysOn : {};
    var rows = normalizeBoundPositions(ao, kind);
    if (!Array.isArray(ao.boundRows)) ao.boundRows = rows.slice();
    else ao.boundRows = rows;
    ao.boundRow = rows.length ? cloneRow(rows[0]) : Object.assign({}, ao.boundRow || {}, {
      v3PositionTokenId: '',
      positionNftId: '',
      infiPositionTokenId: '',
    });
    if (rows.length === 0) {
      if (kind === 'infi') {
        ao.boundRow.positionNftId = '';
        ao.boundRow.infiPositionTokenId = '';
      } else {
        ao.boundRow.v3PositionTokenId = '';
      }
    }
    return ao;
  }

  function upsertBoundPosition(alwaysOn, row, kind) {
    var ao = alwaysOn && typeof alwaysOn === 'object' ? alwaysOn : {};
    var k = kind === 'infi' ? 'infi' : 'v3';
    var next = cloneRow(row);
    var id = positionIdKey(k, next);
    if (!id) throw new Error('upsertBoundPosition: position id required');
    var rows = normalizeBoundPositions(ao, k);
    var found = false;
    for (var i = 0; i < rows.length; i++) {
      if (positionIdKey(k, rows[i]) === id) {
        rows[i] = Object.assign({}, rows[i], next);
        found = true;
        break;
      }
    }
    if (!found) rows.push(next);
    ao.boundRows = rows;
    syncPrimaryBoundRow(ao, k);
    return { alwaysOn: ao, row: next, created: !found };
  }

  function removeBoundPosition(alwaysOn, tokenId, kind) {
    var ao = alwaysOn && typeof alwaysOn === 'object' ? alwaysOn : {};
    var k = kind === 'infi' ? 'infi' : 'v3';
    var id = trimStr(tokenId);
    if (!id) return { alwaysOn: ao, removed: false };
    var rows = normalizeBoundPositions(ao, k);
    var next = [];
    var removed = false;
    for (var i = 0; i < rows.length; i++) {
      if (positionIdKey(k, rows[i]) === id) {
        removed = true;
        continue;
      }
      next.push(rows[i]);
    }
    ao.boundRows = next;
    syncPrimaryBoundRow(ao, k);
    return { alwaysOn: ao, removed: removed };
  }

  function replaceBoundPositionTokenId(alwaysOn, oldTokenId, newRow, kind) {
    var ao = alwaysOn && typeof alwaysOn === 'object' ? alwaysOn : {};
    var k = kind === 'infi' ? 'infi' : 'v3';
    var oldId = trimStr(oldTokenId);
    var next = cloneRow(newRow);
    var newId = positionIdKey(k, next);
    if (!newId) throw new Error('replaceBoundPositionTokenId: new position id required');
    var rows = normalizeBoundPositions(ao, k);
    var out = [];
    var replaced = false;
    for (var i = 0; i < rows.length; i++) {
      var rid = positionIdKey(k, rows[i]);
      if (oldId && rid === oldId) {
        out.push(Object.assign({}, rows[i], next));
        replaced = true;
        continue;
      }
      if (rid === newId) continue;
      out.push(rows[i]);
    }
    if (!replaced) out.push(next);
    ao.boundRows = out;
    syncPrimaryBoundRow(ao, k);
    return { alwaysOn: ao, row: next, replaced: replaced };
  }

  function mergeFieldsIntoRow(base, fields) {
    var merged = cloneRow(base);
    if (!fields || typeof fields !== 'object') return merged;
    var keys = Object.keys(fields);
    for (var i = 0; i < keys.length; i++) {
      var key = trimStr(keys[i]);
      if (!key) continue;
      var v = fields[keys[i]];
      if (v === undefined) continue;
      if (key === 'enabled') {
        merged.enabled = v === true || v === 'true' || v === true;
        if (v === false || v === 'false') merged.enabled = false;
        else if (v === true || v === 'true') merged.enabled = true;
        else merged.enabled = !(String(v).toLowerCase() === 'false' || v === 0 || v === '0');
        continue;
      }
      merged[key] = v == null ? '' : String(v);
    }
    return merged;
  }

  function isRowWatchEnabled(row) {
    if (!row || typeof row !== 'object') return false;
    if (row.enabled === false || row.enabled === 'false' || row.enabled === 0 || row.enabled === '0') return false;
    return true;
  }

  function activeWatchPositions(alwaysOn, kind) {
    var rows = normalizeBoundPositions(alwaysOn, kind);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      if (!isRowWatchEnabled(rows[i])) continue;
      if (!positionIdKey(kind, rows[i])) continue;
      out.push(rows[i]);
    }
    return out;
  }

  function reconcilePositions(boundRows, onChainPositions, kind) {
    var k = kind === 'infi' ? 'infi' : 'v3';
    var tracked = Array.isArray(boundRows) ? boundRows : [];
    var chain = Array.isArray(onChainPositions) ? onChainPositions : [];
    var trackedIds = Object.create(null);
    var chainIds = Object.create(null);
    var untracked = [];
    var closed = [];
    var ok = [];

    for (var c = 0; c < chain.length; c++) {
      var cp = chain[c] || {};
      var cid = positionIdKey(k, cp) || trimStr(cp.tokenId || cp.v3PositionTokenId);
      if (!cid) continue;
      var liq = cp.liquidity != null ? String(cp.liquidity) : '0';
      var active = false;
      try {
        active = BigInt(liq) > 0n;
      } catch (_) {
        active = Number(liq) > 0;
      }
      chainIds[cid] = { row: cp, active: active };
    }

    for (var t = 0; t < tracked.length; t++) {
      var tr = tracked[t] || {};
      var tid = positionIdKey(k, tr);
      if (!tid) continue;
      trackedIds[tid] = tr;
      var ch = chainIds[tid];
      if (!ch || !ch.active) closed.push(cloneRow(tr));
      else ok.push({ bound: cloneRow(tr), onChain: ch.row });
    }

    var chainKeys = Object.keys(chainIds);
    for (var u = 0; u < chainKeys.length; u++) {
      var id = chainKeys[u];
      if (!chainIds[id].active) continue;
      if (trackedIds[id]) continue;
      untracked.push(chainIds[id].row);
    }

    return { untracked: untracked, closed: closed, ok: ok };
  }

  var api = {
    trimStr: trimStr,
    cloneRow: cloneRow,
    positionIdKey: positionIdKey,
    normalizeBoundPositions: normalizeBoundPositions,
    syncPrimaryBoundRow: syncPrimaryBoundRow,
    upsertBoundPosition: upsertBoundPosition,
    removeBoundPosition: removeBoundPosition,
    replaceBoundPositionTokenId: replaceBoundPositionTokenId,
    mergeFieldsIntoRow: mergeFieldsIntoRow,
    isRowWatchEnabled: isRowWatchEnabled,
    activeWatchPositions: activeWatchPositions,
    reconcilePositions: reconcilePositions,
  };

  global.CFS_ALWAYS_ON_BOUND_POSITIONS = api;
  global.__CFS_alwaysOnBoundPositions = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
