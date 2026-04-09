/**
 * MCP Tools — Raydium DeFi operations
 */
import { z } from 'zod';

const confirmField = z.boolean().optional().describe('Set to true to execute (required when dry-run is enabled)');

export function registerRaydiumTools(server, ctx) {
  /** Helper for Raydium write tools */
  function raydiumWrite(name, desc, schema, buildPayload) {
    server.tool(name, desc, { ...schema, confirm: confirmField }, async (args) => {
      let dryRun = true;
      try {
        const dryRunRes = await ctx.readStorage(['cfsMcpDryRunConfirmation']);
        dryRun = !(dryRunRes && dryRunRes.data && dryRunRes.data.cfsMcpDryRunConfirmation === false);
      } catch (_) { /* default to safe */ }
      const payload = buildPayload(args);
      if (dryRun && !args.confirm) {
        return { content: [{ type: 'text', text: JSON.stringify({ dryRun: true, message: 'Review and call again with confirm: true.', payload }, null, 2) }] };
      }
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    });
  }

  raydiumWrite(
    'raydium_swap_standard', 'Raydium standard AMM pool swap. WARNING: Real transaction.',
    {
      poolId: z.string().describe('Raydium pool ID'),
      inputMint: z.string().describe('Input token mint'),
      outputMint: z.string().describe('Output token mint'),
      amountIn: z.string().describe('Amount in raw units'),
      minAmountOut: z.string().optional().describe('Minimum output amount'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolId, inputMint, outputMint, amountIn, minAmountOut, extra }) => {
      const p = { type: 'CFS_RAYDIUM_SWAP_STANDARD', poolId, inputMint, outputMint, amountInRaw: amountIn };
      if (minAmountOut) p.minAmountOut = minAmountOut;
      if (extra) { const { type: _drop, ...rest } = extra; Object.assign(p, rest); }
      return p;
    }
  );

  raydiumWrite(
    'raydium_add_liquidity', 'Add liquidity to a Raydium standard pool. WARNING: Real transaction.',
    {
      poolId: z.string().describe('Raydium pool ID'),
      amountIn: z.string().describe('Amount of the fixed-side token in raw units'),
      fixedSide: z.enum(['a', 'b']).optional().describe('Which token side is fixed (default "a")'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolId, amountIn, fixedSide, extra }) => {
      const p = { type: 'CFS_RAYDIUM_ADD_LIQUIDITY', poolId, amountInRaw: amountIn };
      if (fixedSide) p.fixedSide = fixedSide;
      if (extra) { const { type: _drop, ...rest } = extra; Object.assign(p, rest); }
      return p;
    }
  );

  raydiumWrite(
    'raydium_remove_liquidity', 'Remove liquidity from a Raydium standard pool. WARNING: Real transaction.',
    {
      poolId: z.string().describe('Raydium pool ID'),
      lpAmount: z.string().describe('LP token amount to remove in raw units'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolId, lpAmount, extra }) => {
      const p = { type: 'CFS_RAYDIUM_REMOVE_LIQUIDITY', poolId, lpAmountRaw: lpAmount };
      if (extra) { const { type: _drop, ...rest } = extra; Object.assign(p, rest); }
      return p;
    }
  );

  raydiumWrite(
    'raydium_clmm_swap', 'Raydium CLMM concentrated liquidity swap (base in). WARNING: Real transaction.',
    {
      poolId: z.string().describe('CLMM pool ID'),
      inputMint: z.string().describe('Input token mint'),
      outputMint: z.string().describe('Output token mint'),
      amountIn: z.string().describe('Input amount in raw units'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolId, inputMint, outputMint, amountIn, extra }) => {
      const p = { type: 'CFS_RAYDIUM_CLMM_SWAP_BASE_IN', poolId, inputMint, outputMint, amountInRaw: amountIn };
      if (extra) { const { type: _drop, ...rest } = extra; Object.assign(p, rest); }
      return p;
    }
  );

  raydiumWrite(
    'raydium_clmm_open_position', 'Open a CLMM concentrated liquidity position. WARNING: Real transaction.',
    {
      poolId: z.string().describe('CLMM pool ID'),
      tickLower: z.number().int().describe('Lower tick index'),
      tickUpper: z.number().int().describe('Upper tick index'),
      baseAmountRaw: z.string().describe('Base token amount in raw units'),
      otherAmountMaxRaw: z.string().describe('Max amount of the other token in raw units (slippage bound)'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolId, tickLower, tickUpper, baseAmountRaw, otherAmountMaxRaw, extra }) => {
      const p = { type: 'CFS_RAYDIUM_CLMM_OPEN_POSITION', poolId, tickLower, tickUpper, baseAmountRaw, otherAmountMaxRaw };
      if (extra) { const { type: _drop, ...rest } = extra; Object.assign(p, rest); }
      return p;
    }
  );

  raydiumWrite(
    'raydium_clmm_close_position', 'Close a CLMM concentrated liquidity position. WARNING: Real transaction.',
    {
      positionNftMint: z.string().describe('Position NFT mint address'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ positionNftMint, extra }) => {
      const p = { type: 'CFS_RAYDIUM_CLMM_CLOSE_POSITION', positionNftMint };
      if (extra) { const { type: _drop, ...rest } = extra; Object.assign(p, rest); }
      return p;
    }
  );

  raydiumWrite(
    'raydium_clmm_collect_rewards', 'Collect rewards from a CLMM position. WARNING: Real transaction.',
    {
      poolId: z.string().describe('CLMM pool ID'),
      rewardMints: z.array(z.string()).describe('Array of reward mint addresses to collect'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolId, rewardMints, extra }) => {
      const p = { type: 'CFS_RAYDIUM_CLMM_COLLECT_REWARDS', poolId, rewardMints };
      if (extra) { const { type: _drop, ...rest } = extra; Object.assign(p, rest); }
      return p;
    }
  );

  raydiumWrite(
    'raydium_cpmm_add_liquidity', 'Add liquidity to a Raydium CPMM pool. WARNING: Real transaction.',
    {
      poolId: z.string().describe('CPMM pool ID'),
      amountIn: z.string().describe('Amount in raw units for the fixed-side token'),
      fixedSide: z.enum(['a', 'b']).optional().describe('Which token side is fixed (default "a")'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolId, amountIn, fixedSide, extra }) => {
      const p = { type: 'CFS_RAYDIUM_CPMM_ADD_LIQUIDITY', poolId, amountInRaw: amountIn };
      if (fixedSide) p.fixedSide = fixedSide;
      if (extra) { const { type: _drop, ...rest } = extra; Object.assign(p, rest); }
      return p;
    }
  );

  raydiumWrite(
    'raydium_cpmm_remove_liquidity', 'Remove liquidity from a Raydium CPMM pool. WARNING: Real transaction.',
    {
      poolId: z.string().describe('CPMM pool ID'),
      lpAmount: z.string().describe('LP token amount to remove in raw units'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolId, lpAmount, extra }) => {
      const p = { type: 'CFS_RAYDIUM_CPMM_REMOVE_LIQUIDITY', poolId, lpAmountRaw: lpAmount };
      if (extra) { const { type: _drop, ...rest } = extra; Object.assign(p, rest); }
      return p;
    }
  );
}
