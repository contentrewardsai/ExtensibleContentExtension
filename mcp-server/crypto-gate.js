/**
 * Crypto Gate — shared helper for checking cfsCryptoWeb3Enabled toggle
 *
 * Reads the toggle from extension storage via the relay WebSocket.
 * Caches the value for 10 seconds to avoid excessive relay round-trips.
 *
 * Usage in tool files:
 *   const gateErr = await ctx.cryptoGate.guard('tool_name');
 *   if (gateErr) return gateErr;
 */

const CACHE_TTL_MS = 10_000; // 10 seconds

/** Standard error message when crypto is disabled. */
export const CRYPTO_DISABLED_MSG =
  'Crypto & Web3 functionality is disabled in extension settings. ' +
  'Enable "Enable Crypto & Web3 Functionality" in Settings → Crypto to use this tool.';

/**
 * Create a crypto gate attached to the given ctx.
 * @param {{ readStorage: Function }} ctx  MCP server context with readStorage
 * @returns {{ isCryptoEnabled: () => Promise<boolean>, guard: (toolName?: string) => Promise<object|null> }}
 */
export function createCryptoGate(ctx) {
  let _cached = null;   // { value: boolean, ts: number }

  /**
   * Check whether crypto is enabled. Cached for CACHE_TTL_MS.
   * If relay is disconnected or storage read fails, defaults to false (disabled).
   */
  async function isCryptoEnabled() {
    const now = Date.now();
    if (_cached && (now - _cached.ts) < CACHE_TTL_MS) {
      return _cached.value;
    }
    try {
      const res = await ctx.readStorage(['cfsCryptoWeb3Enabled']);
      const enabled = !!(res && res.data && res.data.cfsCryptoWeb3Enabled === true);
      _cached = { value: enabled, ts: now };
      return enabled;
    } catch (_) {
      /* Relay disconnected or error — default to disabled for safety */
      _cached = { value: false, ts: now };
      return false;
    }
  }

  /**
   * Guard check for a crypto tool. Returns an MCP error content object if
   * crypto is disabled, or null if the tool is allowed to proceed.
   * @param {string} [toolName]  Tool name for the error message
   * @returns {Promise<{ content: Array, isError: boolean } | null>}
   */
  async function guard(toolName) {
    const enabled = await isCryptoEnabled();
    if (enabled) return null;
    const msg = toolName
      ? `Tool "${toolName}" is unavailable: ${CRYPTO_DISABLED_MSG}`
      : CRYPTO_DISABLED_MSG;
    return {
      content: [{ type: 'text', text: JSON.stringify({ ok: false, error: msg, cryptoGated: true }, null, 2) }],
      isError: true,
    };
  }

  return { isCryptoEnabled, guard };
}
