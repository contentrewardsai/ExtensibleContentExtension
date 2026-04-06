/**
 * MCP Tools — Meteora DeFi operations
 */
import { z } from 'zod';

const confirmField = z.boolean().optional().describe('Set to true to execute (required when dry-run is enabled)');

export function registerMeteoraTools(server, ctx) {
  function meteoraWrite(name, desc, schema, buildPayload) {
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

  meteoraWrite(
    'meteora_dlmm_add_liquidity', 'Add liquidity to a Meteora DLMM pool. WARNING: Real transaction.',
    {
      poolAddress: z.string().describe('DLMM pool address'),
      strategy: z.string().optional().describe('Strategy type (spot, curve, bidAsk)'),
      amountX: z.string().optional().describe('Amount of token X'),
      amountY: z.string().optional().describe('Amount of token Y'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolAddress, strategy, amountX, amountY, extra }) => {
      const p = { type: 'CFS_METEORA_DLMM_ADD_LIQUIDITY', poolAddress };
      if (strategy) p.strategy = strategy;
      if (amountX) p.amountX = amountX;
      if (amountY) p.amountY = amountY;
      if (extra) Object.assign(p, extra);
      return p;
    }
  );

  meteoraWrite(
    'meteora_dlmm_remove_liquidity', 'Remove liquidity from a Meteora DLMM pool. WARNING: Real transaction.',
    {
      poolAddress: z.string().describe('DLMM pool address'),
      positionAddress: z.string().optional().describe('Specific position to remove from'),
      bps: z.number().int().optional().describe('Percentage in basis points to remove (10000 = 100%)'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolAddress, positionAddress, bps, extra }) => {
      const p = { type: 'CFS_METEORA_DLMM_REMOVE_LIQUIDITY', poolAddress };
      if (positionAddress) p.positionAddress = positionAddress;
      if (bps != null) p.bps = bps;
      if (extra) Object.assign(p, extra);
      return p;
    }
  );

  meteoraWrite(
    'meteora_dlmm_claim_rewards', 'Claim rewards from a Meteora DLMM position. WARNING: Real transaction.',
    {
      poolAddress: z.string().describe('DLMM pool address'),
      positionAddress: z.string().optional().describe('Specific position'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolAddress, positionAddress, extra }) => {
      const p = { type: 'CFS_METEORA_DLMM_CLAIM_REWARDS', poolAddress };
      if (positionAddress) p.positionAddress = positionAddress;
      if (extra) Object.assign(p, extra);
      return p;
    }
  );

  meteoraWrite(
    'meteora_cpamm_swap', 'Swap on a Meteora CPAMM pool. WARNING: Real transaction.',
    {
      poolAddress: z.string().describe('CPAMM pool address'),
      inputMint: z.string().describe('Input token mint'),
      amountIn: z.string().describe('Input amount in raw units'),
      minAmountOut: z.string().optional().describe('Minimum output amount'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolAddress, inputMint, amountIn, minAmountOut, extra }) => {
      const p = { type: 'CFS_METEORA_CPAMM_SWAP', poolAddress, inputMint, amountIn };
      if (minAmountOut) p.minAmountOut = minAmountOut;
      if (extra) Object.assign(p, extra);
      return p;
    }
  );

  meteoraWrite(
    'meteora_cpamm_add_liquidity', 'Add liquidity to a Meteora CPAMM pool. WARNING: Real transaction.',
    {
      poolAddress: z.string().describe('CPAMM pool address'),
      amountA: z.string().describe('Amount of token A'),
      amountB: z.string().optional().describe('Amount of token B'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolAddress, amountA, amountB, extra }) => {
      const p = { type: 'CFS_METEORA_CPAMM_ADD_LIQUIDITY', poolAddress, amountA };
      if (amountB) p.amountB = amountB;
      if (extra) Object.assign(p, extra);
      return p;
    }
  );

  meteoraWrite(
    'meteora_cpamm_remove_liquidity', 'Remove liquidity from a Meteora CPAMM pool. WARNING: Real transaction.',
    {
      poolAddress: z.string().describe('CPAMM pool address'),
      lpAmount: z.string().describe('LP token amount to remove'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolAddress, lpAmount, extra }) => {
      const p = { type: 'CFS_METEORA_CPAMM_REMOVE_LIQUIDITY', poolAddress, lpAmount };
      if (extra) Object.assign(p, extra);
      return p;
    }
  );

  meteoraWrite(
    'meteora_cpamm_claim_fees', 'Claim trading fees from a Meteora CPAMM position. WARNING: Real transaction.',
    {
      poolAddress: z.string().describe('CPAMM pool address'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ poolAddress, extra }) => {
      const p = { type: 'CFS_METEORA_CPAMM_CLAIM_FEES', poolAddress };
      if (extra) Object.assign(p, extra);
      return p;
    }
  );
}
