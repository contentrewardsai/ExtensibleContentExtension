/**
 * MCP Tools — Raydium DeFi operations
 */
import { z } from 'zod';

const confirmField = z.boolean().optional().describe('Set to true to execute (required when dry-run is enabled)');

export function registerRaydiumTools(server, ctx) {
  /** Helper for Raydium write tools */
  function raydiumWrite(name, desc, schema, buildPayload) {
    server.tool(name, desc, { ...schema, confirm: confirmField }, async (args) => {
      const dryRunRes = await ctx.readStorage(['cfsMcpDryRunConfirmation']);
      const dryRun = !(dryRunRes && dryRunRes.data && dryRunRes.data.cfsMcpDryRunConfirmation === false);
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
      amountIn: z.string().describe('Amount in raw units'),
      minAmountOut: z.string().optional().describe('Minimum output amount'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolId, inputMint, amountIn, minAmountOut, extra }) => {
      const p = { type: 'CFS_RAYDIUM_SWAP_STANDARD', poolId, inputMint, amountIn };
      if (minAmountOut) p.minAmountOut = minAmountOut;
      if (extra) Object.assign(p, extra);
      return p;
    }
  );

  raydiumWrite(
    'raydium_add_liquidity', 'Add liquidity to a Raydium standard pool. WARNING: Real transaction.',
    {
      poolId: z.string().describe('Raydium pool ID'),
      amountA: z.string().describe('Amount of token A'),
      amountB: z.string().optional().describe('Amount of token B (auto-calculated if omitted)'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolId, amountA, amountB, extra }) => {
      const p = { type: 'CFS_RAYDIUM_ADD_LIQUIDITY', poolId, amountA };
      if (amountB) p.amountB = amountB;
      if (extra) Object.assign(p, extra);
      return p;
    }
  );

  raydiumWrite(
    'raydium_remove_liquidity', 'Remove liquidity from a Raydium standard pool. WARNING: Real transaction.',
    {
      poolId: z.string().describe('Raydium pool ID'),
      lpAmount: z.string().describe('LP token amount to remove'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolId, lpAmount, extra }) => {
      const p = { type: 'CFS_RAYDIUM_REMOVE_LIQUIDITY', poolId, lpAmount };
      if (extra) Object.assign(p, extra);
      return p;
    }
  );

  raydiumWrite(
    'raydium_clmm_swap', 'Raydium CLMM concentrated liquidity swap (base in). WARNING: Real transaction.',
    {
      poolId: z.string().describe('CLMM pool ID'),
      inputMint: z.string().describe('Input token mint'),
      amountIn: z.string().describe('Input amount in raw units'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolId, inputMint, amountIn, extra }) => {
      const p = { type: 'CFS_RAYDIUM_CLMM_SWAP_BASE_IN', poolId, inputMint, amountIn };
      if (extra) Object.assign(p, extra);
      return p;
    }
  );

  raydiumWrite(
    'raydium_clmm_open_position', 'Open a CLMM concentrated liquidity position. WARNING: Real transaction.',
    {
      poolId: z.string().describe('CLMM pool ID'),
      priceLower: z.string().describe('Lower price bound'),
      priceUpper: z.string().describe('Upper price bound'),
      amountA: z.string().optional().describe('Amount of token A'),
      amountB: z.string().optional().describe('Amount of token B'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolId, priceLower, priceUpper, amountA, amountB, extra }) => {
      const p = { type: 'CFS_RAYDIUM_CLMM_OPEN_POSITION', poolId, priceLower, priceUpper };
      if (amountA) p.amountA = amountA;
      if (amountB) p.amountB = amountB;
      if (extra) Object.assign(p, extra);
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
      if (extra) Object.assign(p, extra);
      return p;
    }
  );

  raydiumWrite(
    'raydium_clmm_collect_rewards', 'Collect rewards from a CLMM position. WARNING: Real transaction.',
    {
      positionNftMint: z.string().describe('Position NFT mint address'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ positionNftMint, extra }) => {
      const p = { type: 'CFS_RAYDIUM_CLMM_COLLECT_REWARDS', positionNftMint };
      if (extra) Object.assign(p, extra);
      return p;
    }
  );

  raydiumWrite(
    'raydium_cpmm_add_liquidity', 'Add liquidity to a Raydium CPMM pool. WARNING: Real transaction.',
    {
      poolId: z.string().describe('CPMM pool ID'),
      amountA: z.string().describe('Amount of token A'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolId, amountA, extra }) => {
      const p = { type: 'CFS_RAYDIUM_CPMM_ADD_LIQUIDITY', poolId, amountA };
      if (extra) Object.assign(p, extra);
      return p;
    }
  );

  raydiumWrite(
    'raydium_cpmm_remove_liquidity', 'Remove liquidity from a Raydium CPMM pool. WARNING: Real transaction.',
    {
      poolId: z.string().describe('CPMM pool ID'),
      lpAmount: z.string().describe('LP token amount to remove'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolId, lpAmount, extra }) => {
      const p = { type: 'CFS_RAYDIUM_CPMM_REMOVE_LIQUIDITY', poolId, lpAmount };
      if (extra) Object.assign(p, extra);
      return p;
    }
  );
}
