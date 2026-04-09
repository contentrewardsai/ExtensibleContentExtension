/**
 * MCP Tools — Jupiter Flashloan operations
 *
 * Uses @jup-ag/lend/flashloan SDK to construct borrow/payback instructions.
 * The Bun runtime can import npm packages directly — this runs server-side,
 * NOT in the browser extension.
 *
 * Architecture:
 *   1. jupiter_flashloan_open  — creates a session, gets borrowIx + paybackIx
 *   2. jupiter_flashloan_add_swap — adds a Jupiter swap as intermediary instructions
 *   3. jupiter_flashloan_execute — assembles [borrowIx, ...swapIxs, paybackIx], signs, sends
 *
 * The MCP server holds pending sessions keyed by sessionId.
 * Sessions expire after 60 seconds (Solana blockhash TTL).
 */
import { z } from 'zod';

/* ── In-memory session store ── */
const flashloanSessions = new Map();
const SESSION_TTL_MS = 60_000; // 60 seconds

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [id, sess] of flashloanSessions) {
    if (now - sess.createdAt > SESSION_TTL_MS) flashloanSessions.delete(id);
  }
}

function generateSessionId() {
  return 'fl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export function registerFlashloanTools(server, ctx) {
  const confirmField = z.boolean().optional().describe(
    'Set to true to execute (required when dry-run confirmation is enabled)'
  );

  /* ══════════════════════════════════════════════════════════════
   * jupiter_flashloan_open
   *
   * Opens a flashloan session. Returns a sessionId that tracks the
   * borrow parameters. Intermediary instructions (swaps, etc.) are
   * added via jupiter_flashloan_add_swap.
   * ══════════════════════════════════════════════════════════════ */
  server.tool(
    'jupiter_flashloan_open',
    `Open a Jupiter Lend flashloan session. Borrows an asset with ZERO fees — the borrowed amount must be repaid within the same transaction. Returns a sessionId to add intermediary instructions (swaps, arbitrage, etc.) before executing.

Use cases: arbitrage, liquidations, collateral swapping, leveraged positions.

Program: jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9

After opening, add operations with jupiter_flashloan_add_swap, then execute with jupiter_flashloan_execute.`,
    {
      borrowMint: z.string().describe('Mint address of the asset to borrow (e.g. USDC mint)'),
      borrowAmount: z.string().describe('Amount to borrow in raw smallest units (e.g. 100000000 for 100 USDC)'),
    },
    async ({ borrowMint, borrowAmount }) => {
      cleanExpiredSessions();
      const sessionId = generateSessionId();
      flashloanSessions.set(sessionId, {
        borrowMint,
        borrowAmount,
        intermediaryOps: [],
        createdAt: Date.now(),
      });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            sessionId,
            status: 'open',
            borrowMint,
            borrowAmount,
            message: 'Flashloan session opened. Add intermediary operations (swaps, transfers) using jupiter_flashloan_add_swap, then call jupiter_flashloan_execute to assemble and send the atomic transaction.',
            expiresInSeconds: Math.round(SESSION_TTL_MS / 1000),
          }, null, 2),
        }],
      };
    }
  );

  /* ══════════════════════════════════════════════════════════════
   * jupiter_flashloan_add_swap
   *
   * Add a Jupiter swap as an intermediary operation within the
   * flashloan. Multiple swaps can be added (e.g. A→B then B→A for
   * arbitrage).
   * ══════════════════════════════════════════════════════════════ */
  server.tool(
    'jupiter_flashloan_add_swap',
    `Add a Jupiter swap as an intermediary step in an open flashloan session. The swap instructions will be sandwiched between the borrow and payback instructions.

You can add multiple swaps (e.g. for arbitrage: swap A→B on one DEX, then B→A on another).

Each swap uses Jupiter V2 /build to get raw instructions (not /order, since we need to compose the full tx ourselves).`,
    {
      sessionId: z.string().describe('Flashloan session ID from jupiter_flashloan_open'),
      inputMint: z.string().describe('Input token mint for the swap'),
      outputMint: z.string().describe('Output token mint for the swap'),
      amount: z.string().describe('Amount in raw smallest units'),
      slippageBps: z.number().int().optional().describe('Slippage in bps (default 50)'),
      dexes: z.string().optional().describe('Restrict to specific DEXes (comma-separated)'),
      excludeDexes: z.string().optional().describe('Exclude specific DEXes (comma-separated)'),
    },
    async ({ sessionId, inputMint, outputMint, amount, slippageBps, dexes, excludeDexes }) => {
      cleanExpiredSessions();
      const session = flashloanSessions.get(sessionId);
      if (!session) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'Session not found or expired. Open a new session with jupiter_flashloan_open.' }) }],
          isError: true,
        };
      }

      const op = {
        type: 'swap',
        inputMint,
        outputMint,
        amount,
        slippageBps: slippageBps || 50,
      };
      if (dexes) op.dexes = dexes;
      if (excludeDexes) op.excludeDexes = excludeDexes;

      session.intermediaryOps.push(op);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            sessionId,
            operationIndex: session.intermediaryOps.length - 1,
            operationsCount: session.intermediaryOps.length,
            added: op,
            message: `Swap ${inputMint.slice(0, 8)}…→${outputMint.slice(0, 8)}… added. Add more operations or call jupiter_flashloan_execute.`,
          }, null, 2),
        }],
      };
    }
  );

  /* ══════════════════════════════════════════════════════════════
   * jupiter_flashloan_execute
   *
   * Assembles the full atomic transaction:
   *   [ComputeBudget, borrowIx, ...swapIxs, paybackIx]
   *
   * Signs with the automation wallet and sends to the network.
   * If payback fails, the entire transaction reverts (zero risk).
   * ══════════════════════════════════════════════════════════════ */
  server.tool(
    'jupiter_flashloan_execute',
    `Execute the assembled flashloan transaction. Constructs: [borrowIx, ...intermediary ops, paybackIx] as a single atomic Solana transaction.

The Bun MCP server uses @jup-ag/lend/flashloan SDK to get borrow/payback instructions, and Jupiter V2 /build for swap instructions. The transaction is signed with the automation wallet and sent to the network.

If the payback fails (e.g. arbitrage didn't profit enough), the ENTIRE transaction reverts — no funds are lost.`,
    {
      sessionId: z.string().describe('Flashloan session ID'),
      confirm: confirmField,
    },
    async ({ sessionId, confirm }) => {
      cleanExpiredSessions();
      const session = flashloanSessions.get(sessionId);
      if (!session) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'Session not found or expired.' }) }],
          isError: true,
        };
      }

      if (session.intermediaryOps.length === 0) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'No intermediary operations added. Use jupiter_flashloan_add_swap first.' }) }],
          isError: true,
        };
      }

      /* Dry-run check */
      let dryRun = true;
      try {
        const res = await ctx.readStorage(['cfsMcpDryRunConfirmation']);
        dryRun = res && res.data && res.data.cfsMcpDryRunConfirmation !== false;
      } catch (_) {}

      if (dryRun && !confirm) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              dryRun: true,
              sessionId,
              borrowMint: session.borrowMint,
              borrowAmount: session.borrowAmount,
              intermediaryOps: session.intermediaryOps,
              message: 'Dry-run mode. Review the flashloan plan above and call jupiter_flashloan_execute again with confirm: true.',
            }, null, 2),
          }],
        };
      }

      /* Execute via extension service worker
       *
       * We send CFS_JUPITER_FLASHLOAN to the extension with the full session data.
       * The extension's solana-swap.js handler will:
       *   1. Fetch swap instructions via Jupiter V2 /build for each intermediary op
       *   2. Construct borrow + payback instructions using the Lend program
       *   3. Assemble the full tx, sign, and send
       */
      const payload = {
        type: 'CFS_JUPITER_FLASHLOAN',
        borrowMint: session.borrowMint,
        borrowAmount: session.borrowAmount,
        intermediaryOps: session.intermediaryOps,
      };

      const res = await ctx.sendMessage(payload);

      if (res && res.ok) {
        flashloanSessions.delete(sessionId);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
        isError: !res.ok,
      };
    }
  );

  /* ══════════════════════════════════════════════════════════════
   * jupiter_flashloan_cancel
   *
   * Cancel an open flashloan session without executing.
   * ══════════════════════════════════════════════════════════════ */
  server.tool(
    'jupiter_flashloan_cancel',
    'Cancel an open flashloan session without executing. Frees the session resources.',
    {
      sessionId: z.string().describe('Flashloan session ID to cancel'),
    },
    async ({ sessionId }) => {
      const existed = flashloanSessions.delete(sessionId);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            cancelled: existed,
            sessionId,
            message: existed ? 'Session cancelled.' : 'Session not found (may have expired).',
          }, null, 2),
        }],
      };
    }
  );

  /* ══════════════════════════════════════════════════════════════
   * jupiter_flashloan_status
   *
   * Check the status of an open flashloan session.
   * ══════════════════════════════════════════════════════════════ */
  server.tool(
    'jupiter_flashloan_status',
    'Check the status of an open flashloan session — see pending operations and time remaining.',
    {
      sessionId: z.string().describe('Flashloan session ID'),
    },
    async ({ sessionId }) => {
      cleanExpiredSessions();
      const session = flashloanSessions.get(sessionId);
      if (!session) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'Session not found or expired.' }) }],
          isError: true,
        };
      }
      const elapsed = Date.now() - session.createdAt;
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            sessionId,
            status: 'open',
            borrowMint: session.borrowMint,
            borrowAmount: session.borrowAmount,
            intermediaryOps: session.intermediaryOps,
            operationsCount: session.intermediaryOps.length,
            remainingSeconds: Math.max(0, Math.round((SESSION_TTL_MS - elapsed) / 1000)),
          }, null, 2),
        }],
      };
    }
  );
}
