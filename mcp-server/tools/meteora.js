/**
 * MCP Tools — Meteora DeFi operations
 */
import { z } from 'zod';

const confirmField = z.boolean().optional().describe('Set to true to execute (required when dry-run is enabled)');

export function registerMeteoraTools(server, ctx) {
  function meteoraWrite(name, desc, schema, buildPayload) {
    server.tool(name, desc, { ...schema, confirm: confirmField }, async (args) => {
      const gateErr = await ctx.cryptoGate.guard(name);
      if (gateErr) return gateErr;
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

  meteoraWrite(
    'meteora_dlmm_add_liquidity', 'Add liquidity to a Meteora DLMM pool. WARNING: Real transaction.',
    {
      lbPair: z.string().describe('DLMM lb-pair address'),
      strategyType: z.string().optional().describe('Strategy type (spot, curve, bidAsk)'),
      totalXAmountRaw: z.string().optional().describe('Amount of token X in raw units'),
      totalYAmountRaw: z.string().optional().describe('Amount of token Y in raw units'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ lbPair, strategyType, totalXAmountRaw, totalYAmountRaw, extra }) => {
      const p = { type: 'CFS_METEORA_DLMM_ADD_LIQUIDITY', lbPair };
      if (strategyType) p.strategyType = strategyType;
      if (totalXAmountRaw) p.totalXAmountRaw = totalXAmountRaw;
      if (totalYAmountRaw) p.totalYAmountRaw = totalYAmountRaw;
      if (extra) { const { type: _drop, ...rest } = extra; Object.assign(p, rest); }
      return p;
    }
  );

  meteoraWrite(
    'meteora_dlmm_remove_liquidity', 'Remove liquidity from a Meteora DLMM pool. WARNING: Real transaction.',
    {
      lbPair: z.string().describe('DLMM lb-pair address'),
      position: z.string().describe('Position account address'),
      bps: z.number().int().optional().describe('Percentage in basis points to remove (10000 = 100%)'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ lbPair, position, bps, extra }) => {
      const p = { type: 'CFS_METEORA_DLMM_REMOVE_LIQUIDITY', lbPair, position };
      if (bps != null) p.bps = bps;
      if (extra) { const { type: _drop, ...rest } = extra; Object.assign(p, rest); }
      return p;
    }
  );

  meteoraWrite(
    'meteora_dlmm_claim_rewards', 'Claim rewards from a Meteora DLMM position. WARNING: Real transaction.',
    {
      lbPair: z.string().describe('DLMM lb-pair address'),
      position: z.string().describe('Position account address'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ lbPair, position, extra }) => {
      const p = { type: 'CFS_METEORA_DLMM_CLAIM_REWARDS', lbPair, position };
      if (extra) { const { type: _drop, ...rest } = extra; Object.assign(p, rest); }
      return p;
    }
  );

  meteoraWrite(
    'meteora_cpamm_swap', 'Swap on a Meteora CPAMM pool. WARNING: Real transaction.',
    {
      pool: z.string().describe('CPAMM pool address'),
      inputMint: z.string().describe('Input token mint'),
      outputMint: z.string().describe('Output token mint'),
      amountIn: z.string().describe('Input amount in raw units'),
      minAmountOut: z.string().optional().describe('Minimum output amount'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ pool, inputMint, outputMint, amountIn, minAmountOut, extra }) => {
      const p = { type: 'CFS_METEORA_CPAMM_SWAP', pool, inputMint, outputMint, amountInRaw: amountIn };
      if (minAmountOut) p.minAmountOut = minAmountOut;
      if (extra) { const { type: _drop, ...rest } = extra; Object.assign(p, rest); }
      return p;
    }
  );

  meteoraWrite(
    'meteora_cpamm_add_liquidity', 'Add liquidity to a Meteora CPAMM pool. WARNING: Real transaction.',
    {
      pool: z.string().optional().describe('CPAMM pool address (for new position)'),
      position: z.string().optional().describe('Existing position address (to increase)'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ pool, position, extra }) => {
      const p = { type: 'CFS_METEORA_CPAMM_ADD_LIQUIDITY' };
      if (pool) p.pool = pool;
      if (position) p.position = position;
      if (extra) { const { type: _drop, ...rest } = extra; Object.assign(p, rest); }
      return p;
    }
  );

  meteoraWrite(
    'meteora_cpamm_remove_liquidity', 'Remove liquidity from a Meteora CPAMM position. WARNING: Real transaction.',
    {
      position: z.string().describe('Position account address'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ position, extra }) => {
      const p = { type: 'CFS_METEORA_CPAMM_REMOVE_LIQUIDITY', position };
      if (extra) { const { type: _drop, ...rest } = extra; Object.assign(p, rest); }
      return p;
    }
  );

  meteoraWrite(
    'meteora_cpamm_claim_fees', 'Claim trading fees from a Meteora CPAMM position. WARNING: Real transaction.',
    {
      position: z.string().describe('Position account address'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    ({ position, extra }) => {
      const p = { type: 'CFS_METEORA_CPAMM_CLAIM_FEES', position };
      if (extra) { const { type: _drop, ...rest } = extra; Object.assign(p, rest); }
      return p;
    }
  );
}
