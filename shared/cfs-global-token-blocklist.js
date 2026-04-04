/**
 * Global token blocklist for Following automation / token gates (MV3 SW + Settings).
 * Canonical base assets (SOL/WSOL/BNB/WBNB) cannot be denylisted — they are rejected on save and ignored when building sets.
 *
 * Storage (cfsFollowingAutomationGlobal): globalTokenBlocklist: { solana: string[], evm: string[] }
 */
(function (global) {
  'use strict';

  var WSOL_MINT = 'So11111111111111111111111111111111111111112';
  /** BSC WBNB (Pancake default quote) */
  var WBNB_BSC = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';

  /** Values that must never appear in user blocklists (lowercase for EVM). */
  var CANONICAL_SOLANA_MINTS = Object.create(null);
  CANONICAL_SOLANA_MINTS[WSOL_MINT] = true;

  var CANONICAL_EVM_ADDR = Object.create(null);
  CANONICAL_EVM_ADDR[WBNB_BSC] = true;
  CANONICAL_EVM_ADDR['0x0000000000000000000000000000000000000000'] = true;

  function trimLines(arr) {
    var out = [];
    if (!Array.isArray(arr)) return out;
    for (var i = 0; i < arr.length; i++) {
      var t = String(arr[i] || '').trim();
      if (t) out.push(t);
    }
    return out;
  }

  function blocklistArraysFromGlobal(g) {
    var gtb = g && g.globalTokenBlocklist;
    var sol = [];
    var evm = [];
    if (gtb && typeof gtb === 'object' && !Array.isArray(gtb)) {
      sol = trimLines(gtb.solana);
      evm = trimLines(gtb.evm).map(function (x) {
        return String(x || '').trim().toLowerCase();
      });
    }
    return { solanaLines: sol, evmLines: evm };
  }

  /** @returns {Record<string, boolean>} mint → true */
  function solanaDenySetFromGlobalCfg(g) {
    var merged = blocklistArraysFromGlobal(g);
    var set = Object.create(null);
    merged.solanaLines.forEach(function (m) {
      var t = String(m || '').trim();
      if (!t || CANONICAL_SOLANA_MINTS[t]) return;
      set[t] = true;
    });
    return set;
  }

  /** @returns {Record<string, boolean>} lowercase 0x address → true */
  function evmDenySetFromGlobalCfg(g) {
    var merged = blocklistArraysFromGlobal(g);
    var set = Object.create(null);
    merged.evmLines.forEach(function (m) {
      var s = String(m || '').trim().toLowerCase();
      if (!s || s.indexOf('0x') !== 0 || s.length < 42) return;
      if (CANONICAL_EVM_ADDR[s]) return;
      set[s] = true;
    });
    return set;
  }

  /**
   * @param {string[]} solLines
   * @param {string[]} evmLines
   * @returns {{ solana: string[], evm: string[], rejectedSolana: string[], rejectedEvm: string[] }}
   */
  function sanitizeBlocklistForSave(solLines, evmLines) {
    var solOut = [];
    var rejS = [];
    var seenS = Object.create(null);
    trimLines(solLines).forEach(function (m) {
      var t = String(m || '').trim();
      if (!t) return;
      if (CANONICAL_SOLANA_MINTS[t]) {
        rejS.push(t);
        return;
      }
      if (!seenS[t]) {
        seenS[t] = true;
        solOut.push(t);
      }
    });
    var evOut = [];
    var rejE = [];
    var seenE = Object.create(null);
    trimLines(evmLines).forEach(function (m) {
      var s = String(m || '').trim().toLowerCase();
      if (!s || s.indexOf('0x') !== 0 || s.length < 42) return;
      if (CANONICAL_EVM_ADDR[s]) {
        rejE.push(s);
        return;
      }
      if (!seenE[s]) {
        seenE[s] = true;
        evOut.push(s);
      }
    });
    return { solana: solOut, evm: evOut, rejectedSolana: rejS, rejectedEvm: rejE };
  }

  global.__CFS_GLOBAL_TOKEN_BLOCKLIST = {
    WSOL_MINT: WSOL_MINT,
    WBNB_BSC: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    solanaDenySetFromGlobalCfg: solanaDenySetFromGlobalCfg,
    evmDenySetFromGlobalCfg: evmDenySetFromGlobalCfg,
    sanitizeBlocklistForSave: sanitizeBlocklistForSave,
    blocklistArraysFromGlobal: blocklistArraysFromGlobal,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
