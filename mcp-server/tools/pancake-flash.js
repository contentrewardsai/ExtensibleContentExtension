/**
 * MCP Tools — PancakeSwap V3 Flash Loan + CfsFlashReceiver Deployment
 *
 * deploy_flash_receiver: Deploys the CFS flash callback contract to BSC
 *   (pre-compiled bytecode, no Foundry/solc needed). Relays to extension.
 *
 * pancake_flash_execute: Executes a PancakeSwap V3 flash loan via a deployed
 *   CFS flash receiver contract. Relays to extension.
 */
import { z } from 'zod';

async function isDryRunEnabled(ctx) {
  try {
    const res = await ctx.readStorage(['cfsMcpDryRunConfirmation']);
    return res && res.data && res.data.cfsMcpDryRunConfirmation !== false;
  } catch (_) {
    return true;
  }
}

export function registerPancakeFlashTools(server, ctx) {
  const confirmField = z.boolean().optional().describe(
    'Set to true to execute (required when dry-run confirmation is enabled)'
  );

  /* ══════════════════════════════════════════════════════════════
   * deploy_flash_receiver
   *
   * Deploys the CfsFlashReceiver contract to BSC. The contract is
   * pre-compiled — no Foundry or solc is needed. Uses the BSC
   * automation wallet to deploy.
   * ══════════════════════════════════════════════════════════════ */
  server.tool(
    'deploy_flash_receiver',
    `Deploy the CFS PancakeSwap V3 flash loan callback contract to BSC. The contract bytecode is pre-compiled (Solidity 0.8.28) and embedded — no Foundry, solc, or build tools are needed.

The deployed contract:
- Receives flash-loaned tokens from a PancakeSwap V3 pool
- Executes configurable swap calldata (e.g. arbitrage)
- Repays the pool (borrowed + fee)
- Sends any profit to the caller
- Is owned by the deployer (only owner can call executeFlash)

After deployment, use the returned contract address as the callbackContract in pancake_flash_execute or the pancakeFlash workflow step.

WARNING: This is a real on-chain deployment that costs gas (~0.003 BNB on BSC).`,
    {
      swapRouter: z.string().optional().describe(
        'PancakeSwap V3 SwapRouter address (default: 0x13f4EA83D0bd40E75C8222255bc855a974568Dd4 on BSC mainnet)'
      ),
      rpcUrl: z.string().optional().describe('RPC URL override'),
      chainId: z.number().int().optional().describe('56 for BSC mainnet (default), 97 for Chapel testnet'),
      confirm: confirmField,
    },
    async ({ swapRouter, rpcUrl, chainId, confirm }) => {
      const gateErr = await ctx.cryptoGate.guard('deploy_flash_receiver');
      if (gateErr) return gateErr;
      const dryRun = await isDryRunEnabled(ctx);

      const payload = {
        type: 'CFS_DEPLOY_FLASH_RECEIVER',
        swapRouter: swapRouter || undefined,
        rpcUrl: rpcUrl || undefined,
        chainId: chainId || 56,
      };

      if (dryRun && !confirm) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              dryRun: true,
              message: 'Dry-run mode. This will deploy the CfsFlashReceiver contract to BSC. Gas cost: ~0.003 BNB. Call again with confirm: true to proceed.',
              payload,
              contractSource: 'contracts/CfsFlashReceiver.sol',
              compiler: 'solc 0.8.28, optimized (200 runs)',
            }, null, 2),
          }],
        };
      }

      const res = await ctx.sendMessage(payload);
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
        isError: !res.ok,
      };
    }
  );

  /* ══════════════════════════════════════════════════════════════
   * pancake_flash_execute
   *
   * Execute a PancakeSwap V3 flash loan via a deployed CFS flash
   * receiver contract.
   * ══════════════════════════════════════════════════════════════ */
  server.tool(
    'pancake_flash_execute',
    `Execute a PancakeSwap V3 flash loan on BSC. Borrows tokens from a V3 pool, executes a swap via the deployed CFS flash callback contract, then repays — all atomically. If the callback cannot repay, the entire transaction reverts (zero risk of fund loss).

Requires a deployed CfsFlashReceiver contract (use deploy_flash_receiver first).

Flow: pool.flash() → callback receives tokens → swap via router → repay pool → profit to wallet.

WARNING: Real on-chain transaction that costs gas.`,
    {
      poolAddress: z.string().describe('PancakeSwap V3 pool address to flash from'),
      borrowToken0: z.boolean().optional().describe('Borrow token0 (true, default) or token1 (false)'),
      borrowAmount: z.string().describe('Amount to borrow in smallest units'),
      callbackContract: z.string().describe('Deployed CfsFlashReceiver contract address'),
      swapOutputToken: z.string().optional().describe('Token address to swap into (for arbitrage)'),
      slippageBps: z.number().int().optional().describe('Slippage tolerance in basis points (default 50)'),
      rpcUrl: z.string().optional().describe('RPC URL override'),
      chainId: z.number().int().optional().describe('56 (BSC mainnet) or 97 (Chapel)'),
      confirm: confirmField,
    },
    async ({ poolAddress, borrowToken0, borrowAmount, callbackContract, swapOutputToken, slippageBps, rpcUrl, chainId, confirm }) => {
      const gateErr = await ctx.cryptoGate.guard('pancake_flash_execute');
      if (gateErr) return gateErr;
      const dryRun = await isDryRunEnabled(ctx);

      const payload = {
        type: 'CFS_PANCAKE_FLASH',
        poolAddress,
        borrowToken0: borrowToken0 !== false,
        borrowAmount,
        callbackContract,
        swapOutputToken: swapOutputToken || undefined,
        slippageBps: slippageBps || 50,
        rpcUrl: rpcUrl || undefined,
        chainId: chainId || 56,
      };

      if (dryRun && !confirm) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              dryRun: true,
              message: 'Dry-run mode. This will execute a PancakeSwap V3 flash loan. The transaction is atomic — if repayment fails, everything reverts. Call again with confirm: true to proceed.',
              payload,
            }, null, 2),
          }],
        };
      }

      const res = await ctx.sendMessage(payload);
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
        isError: !res.ok,
      };
    }
  );
}
