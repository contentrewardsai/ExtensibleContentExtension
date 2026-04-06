/**
 * Meteora DAMM v2 / CP-AMM (pools on https://www.meteora.ag/pools).
 * Requires globalThis.CFS_SOLANA_LIB, CFS_METEORA_CPAMM, __CFS_solana_loadKeypairFromStorage.
 * Compute-budget prepends use **__CFS_try_parse_compute_budget_instructions** from **solana-swap.js** (load order: solana-swap before meteora-cpamm).
 *
 * Messages:
 * - CFS_METEORA_CPAMM_ADD_LIQUIDITY: { pool?, position?, totalTokenARaw, totalTokenBRaw, slippagePercent?, cluster?, rpcUrl?, skipSimulation?, skipPreflight?, computeUnitLimit?, computeUnitPriceMicroLamports? }
 *   **New position:** set **pool** (omit **position**). **Increase:** set **position** (existing PDA); **pool** optional, must match on-chain if set. Same single-/two-sided amount rules.
 * - CFS_METEORA_CPAMM_REMOVE_LIQUIDITY: { pool?, position, slippagePercent?, cluster?, rpcUrl?, skipSimulation?, skipPreflight?, computeUnitLimit?, computeUnitPriceMicroLamports? }
 *   Removes all liquidity, claims fees, closes position. Pool defaults from on-chain position if omitted.
 * - CFS_METEORA_CPAMM_DECREASE_LIQUIDITY: { pool?, position, removeLiquidityBps, slippagePercent?, cluster?, rpcUrl?, skipSimulation?, skipPreflight?, computeUnitLimit?, computeUnitPriceMicroLamports? }
 *   Partial remove only (basis points 1–10000 of position liquidity). Does not close the position or claim fees first.
 * - CFS_METEORA_CPAMM_CLAIM_FEES: { pool?, position, cluster?, rpcUrl?, skipSimulation?, skipPreflight?, computeUnitLimit?, computeUnitPriceMicroLamports? }
 * - CFS_METEORA_CPAMM_CLAIM_REWARD: { pool?, position, rewardIndex?, isSkipReward?, cluster?, rpcUrl?, skipSimulation?, skipPreflight?, computeUnitLimit?, computeUnitPriceMicroLamports? }
 *   Claims pool incentive at rewardIndex (0 or 1). Requires an active reward on the pool.
 * - CFS_METEORA_CPAMM_SWAP: { pool, inputMint, outputMint, amountInRaw, slippagePercent?, minimumAmountOutRaw?, cluster?, rpcUrl?, skipSimulation?, skipPreflight?, computeUnitLimit?, computeUnitPriceMicroLamports? }
 *   Single-hop exact-in swap against the pool. **inputMint** / **outputMint** must be the pool’s token A and B mints (either direction). **slippagePercent** maps to quote basis points for **minimumAmountOut**. Optional **minimumAmountOutRaw** raises the on-chain min out to **max**(quote min, floor) so quote-step values never relax slippage.
 * - CFS_METEORA_CPAMM_QUOTE_SWAP: same fields as **SWAP** except **skipSimulation** / **skipPreflight** ignored. Read-only **getQuote** (no keypair, no transaction).
 *   Quotes pass **inputTokenInfo** / **outputTokenInfo** (mint account + current epoch) so Token-2022 **transfer fees** match on-chain math when extensions are present.
 * - CFS_METEORA_CPAMM_SWAP_EXACT_OUT: { pool, inputMint, outputMint, amountOutRaw, slippagePercent?, maximumAmountInRaw?, cluster?, rpcUrl?, skipSimulation?, skipPreflight?, computeUnitLimit?, computeUnitPriceMicroLamports? }
 *   Exact **output** via SDK **swap2** (swapMode 2) + **getQuote2**. Optional **maximumAmountInRaw** caps max input to **min**(quoted max in, ceiling).
 * - CFS_METEORA_CPAMM_QUOTE_SWAP_EXACT_OUT: same as **SWAP_EXACT_OUT** except no tx / keypair / skip flags. Read-only **getQuote2**.
 */
(function () {
  'use strict';

  var STORAGE_RPC = 'cfs_solana_rpc_url';
  var STORAGE_CLUSTER = 'cfs_solana_cluster';

  function storageLocalGet(keys) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.storage.local.get(keys, function (r) {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(r || {});
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function getLib() {
    return globalThis.CFS_SOLANA_LIB;
  }

  function getPack() {
    return globalThis.CFS_METEORA_CPAMM;
  }

  function defaultRpcForCluster(cluster) {
    return cluster === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com';
  }

  function parseUintString(fieldName, raw) {
    var t = String(raw || '').trim().replace(/,/g, '');
    if (!/^\d+$/.test(t)) throw new Error(fieldName + ' must be a non-negative integer string');
    return t;
  }

  async function rpcClusterFromStorage(msg) {
    var stored = await storageLocalGet([STORAGE_RPC, STORAGE_CLUSTER]);
    var cluster = String((msg.cluster || stored[STORAGE_CLUSTER] || 'mainnet-beta')).trim();
    var rpcUrl = String(msg.rpcUrl || stored[STORAGE_RPC] || '').trim();
    if (!rpcUrl) rpcUrl = defaultRpcForCluster(cluster);
    return { cluster: cluster, rpcUrl: rpcUrl };
  }

  function explorerForSig(cluster, sig) {
    return cluster === 'devnet'
      ? 'https://solscan.io/tx/' + sig + '?cluster=devnet'
      : 'https://solscan.io/tx/' + sig;
  }

  function tokenProgramForFlag(L, flag) {
    var spl = L.splToken;
    if (!spl) return null;
    return Number(flag) === 0 ? spl.TOKEN_PROGRAM_ID : spl.TOKEN_2022_PROGRAM_ID;
  }

  function slipBps(slippagePercent) {
    var s = Math.min(50, Math.max(0, Number(slippagePercent)));
    if (!Number.isFinite(s) || s <= 0) s = 1;
    return Math.round(s * 100);
  }

  function bnMulBpsDown(bn, bpsDelta) {
    return bn.muln(10000 - bpsDelta).divn(10000);
  }

  function bnMulBpsUp(bn, bpsDelta) {
    return bn.muln(10000 + bpsDelta).divn(10000);
  }

  /** Optional lower cap on max input for exact-out (min of SDK max and user ceiling). */
  function meteoraCpammApplyMaxInCeiling(P, maxInBn, msg) {
    if (!maxInBn || (typeof maxInBn.isZero === 'function' && maxInBn.isZero())) {
      return { ok: false, error: 'Quoted maximumAmountIn is zero or missing' };
    }
    var capRaw = String(msg.maximumAmountInRaw != null ? msg.maximumAmountInRaw : '')
      .trim()
      .replace(/,/g, '');
    if (!capRaw) {
      return { ok: true, bn: maxInBn };
    }
    var capBn;
    try {
      var capStr = parseUintString('maximumAmountInRaw', capRaw);
      if (capStr === '0') {
        return { ok: false, error: 'maximumAmountInRaw must be > 0 when set' };
      }
      capBn = new P.BN(capStr, 10);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    return { ok: true, bn: maxInBn.gt(capBn) ? capBn : maxInBn };
  }

  async function finalizeLegacyTx(connection, tx, signers, skipSimulation, skipPreflight, budgetMsg) {
    var L = getLib();
    var cbFn = globalThis.__CFS_try_parse_compute_budget_instructions;
    if (typeof cbFn !== 'function') {
      return { ok: false, error: 'Compute budget helper not loaded (solana-swap.js)' };
    }
    var cb = cbFn(L, budgetMsg || {});
    if (!cb.ok) {
      return { ok: false, error: cb.error };
    }
    if (cb.instructions && cb.instructions.length) {
      tx.instructions = cb.instructions.concat(tx.instructions);
    }
    var bh = await connection.getLatestBlockhash('confirmed');
    if (!tx.recentBlockhash) {
      tx.recentBlockhash = bh.blockhash;
      tx.lastValidBlockHeight = bh.lastValidBlockHeight;
    }
    if (!tx.feePayer && signers.length) tx.feePayer = signers[0].publicKey;
    tx.sign.apply(tx, signers);

    if (!skipSimulation) {
      var sim = await connection.simulateTransaction(tx, {
        sigVerify: false,
        commitment: 'confirmed',
      });
      if (sim.value.err) {
        return {
          ok: false,
          error: 'Simulation failed: ' + JSON.stringify(sim.value.err),
          simulationLogs: sim.value.logs || [],
        };
      }
    }

    var sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: skipPreflight === true,
      maxRetries: 3,
    });
    return { ok: true, signature: sig };
  }

  async function getCpammCurrentPoint(connection, P, poolState) {
    if (poolState.activationType === P.ActivationType.Slot) {
      return new P.BN(await connection.getSlot('confirmed'));
    }
    var slot = await connection.getSlot('confirmed');
    var blockTime = await connection.getBlockTime(slot);
    return new P.BN(blockTime != null ? blockTime : Math.floor(Date.now() / 1000));
  }

  globalThis.__CFS_meteora_cpamm_add_liquidity = async function (msg) {
    var L = getLib();
    var P = getPack();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!P || !P.CpAmm || !P.BN) {
      return { ok: false, error: 'Meteora CP-AMM SDK not loaded (run npm run build:meteora-cpamm)' };
    }

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var poolStr = String(msg.pool || '').trim();
    var positionStr = String(msg.position || '').trim();
    if (!poolStr && !positionStr) {
      return { ok: false, error: 'Set pool (new position) or position (add to existing)' };
    }

    var aRaw;
    var bRaw;
    try {
      aRaw = parseUintString('totalTokenARaw', msg.totalTokenARaw != null ? msg.totalTokenARaw : '0');
      bRaw = parseUintString('totalTokenBRaw', msg.totalTokenBRaw != null ? msg.totalTokenBRaw : '0');
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (aRaw === '0' && bRaw === '0') {
      return { ok: false, error: 'At least one of totalTokenARaw or totalTokenBRaw must be > 0' };
    }

    var sbps = slipBps(msg.slippagePercent);
    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;

    var rc;
    try {
      rc = await rpcClusterFromStorage(msg);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var connection = new L.Connection(rc.rpcUrl, 'confirmed');
    var cp = new P.CpAmm(connection);
    var poolPk;
    var poolState;
    var positionPk;
    var positionState;
    var isIncrease = !!positionStr;

    if (isIncrease) {
      try {
        positionPk = new L.PublicKey(positionStr);
      } catch (e) {
        return { ok: false, error: 'Invalid position address' };
      }
      try {
        positionState = await cp.fetchPositionState(positionPk);
      } catch (e) {
        return { ok: false, error: 'fetchPositionState failed: ' + (e && e.message ? e.message : String(e)) };
      }
      poolPk = positionState.pool;
      if (poolStr) {
        try {
          var explicitPool = new L.PublicKey(poolStr);
          if (!explicitPool.equals(poolPk)) {
            return { ok: false, error: 'pool does not match position.pool on-chain' };
          }
        } catch (e) {
          return { ok: false, error: 'Invalid pool address' };
        }
      }
      if (!positionState.owner.equals(keypair.publicKey)) {
        return { ok: false, error: 'Automation wallet is not the position owner' };
      }
      try {
        poolState = await cp.fetchPoolState(poolPk);
      } catch (e) {
        return { ok: false, error: 'fetchPoolState failed: ' + (e && e.message ? e.message : String(e)) };
      }
    } else {
      try {
        poolPk = new L.PublicKey(poolStr);
      } catch (e) {
        return { ok: false, error: 'Invalid pool address' };
      }
      try {
        poolState = await cp.fetchPoolState(poolPk);
      } catch (e) {
        return { ok: false, error: 'fetchPoolState failed: ' + (e && e.message ? e.message : String(e)) };
      }
    }

    var twoSided = aRaw !== '0' && bRaw !== '0';
    var liquidityDelta;
    var maxAmountTokenA;
    var maxAmountTokenB;
    var tokenAAmountThreshold;
    var tokenBAmountThreshold;

    if (twoSided) {
      var bnA = new P.BN(aRaw, 10);
      var bnB = new P.BN(bRaw, 10);
      try {
        liquidityDelta = cp.getLiquidityDelta({
          maxAmountTokenA: bnA,
          maxAmountTokenB: bnB,
          sqrtPrice: poolState.sqrtPrice,
          sqrtMinPrice: poolState.sqrtMinPrice,
          sqrtMaxPrice: poolState.sqrtMaxPrice,
          collectFeeMode: poolState.collectFeeMode,
          tokenAAmount: poolState.tokenAAmount,
          tokenBAmount: poolState.tokenBAmount,
          liquidity: poolState.liquidity,
        });
      } catch (e) {
        return { ok: false, error: 'getLiquidityDelta failed: ' + (e && e.message ? e.message : String(e)) };
      }
      if (!liquidityDelta || liquidityDelta.isZero()) {
        return { ok: false, error: 'getLiquidityDelta returned zero (check amounts vs pool price)' };
      }
      maxAmountTokenA = bnA;
      maxAmountTokenB = bnB;
      tokenAAmountThreshold = bnMulBpsDown(bnA, sbps);
      tokenBAmountThreshold = bnMulBpsDown(bnB, sbps);
    } else {
      var isTokenA = bRaw === '0';
      var inAmount = new P.BN(isTokenA ? aRaw : bRaw, 10);

      var quote;
      try {
        quote = cp.getDepositQuote({
          inAmount: inAmount,
          isTokenA: isTokenA,
          minSqrtPrice: poolState.sqrtMinPrice,
          maxSqrtPrice: poolState.sqrtMaxPrice,
          sqrtPrice: poolState.sqrtPrice,
          collectFeeMode: poolState.collectFeeMode,
          tokenAAmount: poolState.tokenAAmount,
          tokenBAmount: poolState.tokenBAmount,
          liquidity: poolState.liquidity,
        });
      } catch (e) {
        return { ok: false, error: 'getDepositQuote failed: ' + (e && e.message ? e.message : String(e)) };
      }

      liquidityDelta = quote.liquidityDelta;

      if (isTokenA) {
        maxAmountTokenA = inAmount;
        maxAmountTokenB = bnMulBpsUp(quote.outputAmount, sbps);
        tokenAAmountThreshold = bnMulBpsDown(quote.actualInputAmount, sbps);
        tokenBAmountThreshold = bnMulBpsDown(quote.outputAmount, sbps);
      } else {
        maxAmountTokenB = inAmount;
        maxAmountTokenA = bnMulBpsUp(quote.outputAmount, sbps);
        tokenBAmountThreshold = bnMulBpsDown(quote.actualInputAmount, sbps);
        tokenAAmountThreshold = bnMulBpsDown(quote.outputAmount, sbps);
      }
    }

    var tokenAProgram = tokenProgramForFlag(L, poolState.tokenAFlag);
    var tokenBProgram = tokenProgramForFlag(L, poolState.tokenBFlag);
    if (!tokenAProgram || !tokenBProgram) {
      return { ok: false, error: 'splToken helpers missing from Solana bundle' };
    }

    var tx;
    var signers;
    var outPositionAddr;
    var outNftMint;

    if (isIncrease) {
      var positionNftAccount = P.derivePositionNftAccount(positionState.nftMint);
      var tokenAVault = P.deriveTokenVaultAddress(poolState.tokenAMint, poolPk);
      var tokenBVault = P.deriveTokenVaultAddress(poolState.tokenBMint, poolPk);
      try {
        tx = await cp.addLiquidity({
          owner: keypair.publicKey,
          pool: poolPk,
          position: positionPk,
          positionNftAccount: positionNftAccount,
          liquidityDelta: liquidityDelta,
          maxAmountTokenA: maxAmountTokenA,
          maxAmountTokenB: maxAmountTokenB,
          tokenAAmountThreshold: tokenAAmountThreshold,
          tokenBAmountThreshold: tokenBAmountThreshold,
          tokenAMint: poolState.tokenAMint,
          tokenBMint: poolState.tokenBMint,
          tokenAVault: tokenAVault,
          tokenBVault: tokenBVault,
          tokenAProgram: tokenAProgram,
          tokenBProgram: tokenBProgram,
        });
      } catch (e) {
        return { ok: false, error: 'addLiquidity failed: ' + (e && e.message ? e.message : String(e)) };
      }
      signers = [keypair];
      outPositionAddr = positionPk.toBase58();
      outNftMint = positionState.nftMint.toBase58();
    } else {
      var positionNftKp = L.Keypair.generate();
      var positionAddr = P.derivePositionAddress(positionNftKp.publicKey);
      try {
        tx = await cp.createPositionAndAddLiquidity({
          owner: keypair.publicKey,
          pool: poolPk,
          positionNft: positionNftKp.publicKey,
          liquidityDelta: liquidityDelta,
          maxAmountTokenA: maxAmountTokenA,
          maxAmountTokenB: maxAmountTokenB,
          tokenAAmountThreshold: tokenAAmountThreshold,
          tokenBAmountThreshold: tokenBAmountThreshold,
          tokenAMint: poolState.tokenAMint,
          tokenBMint: poolState.tokenBMint,
          tokenAProgram: tokenAProgram,
          tokenBProgram: tokenBProgram,
        });
      } catch (e) {
        return {
          ok: false,
          error: 'createPositionAndAddLiquidity failed: ' + (e && e.message ? e.message : String(e)),
        };
      }
      signers = [keypair, positionNftKp];
      outPositionAddr = positionAddr.toBase58();
      outNftMint = positionNftKp.publicKey.toBase58();
    }

    var out = await finalizeLegacyTx(connection, tx, signers, skipSimulation, skipPreflight, msg);
    if (!out.ok) return out;
    return {
      ok: true,
      signature: out.signature,
      explorerUrl: explorerForSig(rc.cluster, out.signature),
      positionAddress: outPositionAddr,
      positionNftMint: outNftMint,
      mode: isIncrease ? 'increase' : 'create',
    };
  };

  globalThis.__CFS_meteora_cpamm_remove_liquidity = async function (msg) {
    var L = getLib();
    var P = getPack();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!P || !P.CpAmm || !P.BN) {
      return { ok: false, error: 'Meteora CP-AMM SDK not loaded (run npm run build:meteora-cpamm)' };
    }

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var positionStr = String(msg.position || '').trim();
    if (!positionStr) return { ok: false, error: 'position (CP-AMM position account) required' };

    var sbps = slipBps(msg.slippagePercent);
    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;

    var rc;
    try {
      rc = await rpcClusterFromStorage(msg);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var connection = new L.Connection(rc.rpcUrl, 'confirmed');
    var positionPk = new L.PublicKey(positionStr);
    var cp = new P.CpAmm(connection);

    var positionState;
    try {
      positionState = await cp.fetchPositionState(positionPk);
    } catch (e) {
      return { ok: false, error: 'fetchPositionState failed: ' + (e && e.message ? e.message : String(e)) };
    }

    if (!positionState.owner.equals(keypair.publicKey)) {
      return { ok: false, error: 'Automation wallet is not the position owner' };
    }

    var poolPk = positionState.pool;
    if (msg.pool) {
      var explicitPool = new L.PublicKey(String(msg.pool).trim());
      if (!explicitPool.equals(poolPk)) {
        return { ok: false, error: 'pool does not match position.pool on-chain' };
      }
    }

    var poolState;
    try {
      poolState = await cp.fetchPoolState(poolPk);
    } catch (e) {
      return { ok: false, error: 'fetchPoolState failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var vestingRows;
    try {
      vestingRows = await cp.getAllVestingsByPosition(positionPk);
    } catch (e) {
      return { ok: false, error: 'getAllVestingsByPosition failed: ' + (e && e.message ? e.message : String(e)) };
    }
    var vestings = vestingRows.map(function (v) {
      return { account: v.publicKey, vestingState: v.account };
    });

    var currentPoint;
    try {
      currentPoint = await getCpammCurrentPoint(connection, P, poolState);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var totalLiq = positionState.unlockedLiquidity
      .add(positionState.vestedLiquidity)
      .add(positionState.permanentLockedLiquidity);

    if (totalLiq.isZero()) {
      return { ok: false, error: 'Position has zero liquidity' };
    }

    var wq;
    try {
      wq = cp.getWithdrawQuote({
        liquidityDelta: totalLiq,
        minSqrtPrice: poolState.sqrtMinPrice,
        maxSqrtPrice: poolState.sqrtMaxPrice,
        sqrtPrice: poolState.sqrtPrice,
        collectFeeMode: poolState.collectFeeMode,
        tokenAAmount: poolState.tokenAAmount,
        tokenBAmount: poolState.tokenBAmount,
        liquidity: poolState.liquidity,
      });
    } catch (e) {
      return { ok: false, error: 'getWithdrawQuote failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var tokenAAmountThreshold = bnMulBpsDown(wq.outAmountA, sbps);
    var tokenBAmountThreshold = bnMulBpsDown(wq.outAmountB, sbps);

    var positionNftAccount = P.derivePositionNftAccount(positionState.nftMint);

    var tx;
    try {
      tx = await cp.removeAllLiquidityAndClosePosition({
        owner: keypair.publicKey,
        position: positionPk,
        positionNftAccount: positionNftAccount,
        poolState: poolState,
        positionState: positionState,
        tokenAAmountThreshold: tokenAAmountThreshold,
        tokenBAmountThreshold: tokenBAmountThreshold,
        vestings: vestings,
        currentPoint: currentPoint,
      });
    } catch (e) {
      return {
        ok: false,
        error: 'removeAllLiquidityAndClosePosition failed: ' + (e && e.message ? e.message : String(e)),
      };
    }

    var out = await finalizeLegacyTx(connection, tx, [keypair], skipSimulation, skipPreflight, msg);
    if (!out.ok) return out;
    return {
      ok: true,
      signature: out.signature,
      explorerUrl: explorerForSig(rc.cluster, out.signature),
      poolAddress: poolPk.toBase58(),
    };
  };

  globalThis.__CFS_meteora_cpamm_decrease_liquidity = async function (msg) {
    var L = getLib();
    var P = getPack();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!P || !P.CpAmm || !P.BN) {
      return { ok: false, error: 'Meteora CP-AMM SDK not loaded (run npm run build:meteora-cpamm)' };
    }

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var positionStr = String(msg.position || '').trim();
    if (!positionStr) return { ok: false, error: 'position (CP-AMM position account) required' };

    var bps = parseInt(msg.removeLiquidityBps, 10);
    if (!Number.isFinite(bps) || bps < 1 || bps > 10000) {
      return { ok: false, error: 'removeLiquidityBps must be an integer 1–10000 (basis points; 10000 = 100%)' };
    }

    var sbps = slipBps(msg.slippagePercent);
    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;

    var rc;
    try {
      rc = await rpcClusterFromStorage(msg);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var connection = new L.Connection(rc.rpcUrl, 'confirmed');
    var positionPk = new L.PublicKey(positionStr);
    var cp = new P.CpAmm(connection);

    var positionState;
    try {
      positionState = await cp.fetchPositionState(positionPk);
    } catch (e) {
      return { ok: false, error: 'fetchPositionState failed: ' + (e && e.message ? e.message : String(e)) };
    }

    if (!positionState.owner.equals(keypair.publicKey)) {
      return { ok: false, error: 'Automation wallet is not the position owner' };
    }

    var poolPk = positionState.pool;
    if (msg.pool) {
      var explicitPoolD = new L.PublicKey(String(msg.pool).trim());
      if (!explicitPoolD.equals(poolPk)) {
        return { ok: false, error: 'pool does not match position.pool on-chain' };
      }
    }

    var poolState;
    try {
      poolState = await cp.fetchPoolState(poolPk);
    } catch (e) {
      return { ok: false, error: 'fetchPoolState failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var vestingRowsD;
    try {
      vestingRowsD = await cp.getAllVestingsByPosition(positionPk);
    } catch (e) {
      return { ok: false, error: 'getAllVestingsByPosition failed: ' + (e && e.message ? e.message : String(e)) };
    }
    var vestingsD = vestingRowsD.map(function (v) {
      return { account: v.publicKey, vestingState: v.account };
    });

    var currentPointD;
    try {
      currentPointD = await getCpammCurrentPoint(connection, P, poolState);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var totalLiqD = positionState.unlockedLiquidity
      .add(positionState.vestedLiquidity)
      .add(positionState.permanentLockedLiquidity);

    if (totalLiqD.isZero()) {
      return { ok: false, error: 'Position has zero liquidity' };
    }

    var liquidityDeltaD = totalLiqD.muln(bps).divn(10000);
    if (liquidityDeltaD.isZero()) {
      return { ok: false, error: 'removeLiquidityBps rounds to zero liquidity for this position (increase bps)' };
    }

    var wqD;
    try {
      wqD = cp.getWithdrawQuote({
        liquidityDelta: liquidityDeltaD,
        minSqrtPrice: poolState.sqrtMinPrice,
        maxSqrtPrice: poolState.sqrtMaxPrice,
        sqrtPrice: poolState.sqrtPrice,
        collectFeeMode: poolState.collectFeeMode,
        tokenAAmount: poolState.tokenAAmount,
        tokenBAmount: poolState.tokenBAmount,
        liquidity: poolState.liquidity,
      });
    } catch (e) {
      return { ok: false, error: 'getWithdrawQuote failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var tokenAAmountThresholdD = bnMulBpsDown(wqD.outAmountA, sbps);
    var tokenBAmountThresholdD = bnMulBpsDown(wqD.outAmountB, sbps);

    var tokenAProgramD = tokenProgramForFlag(L, poolState.tokenAFlag);
    var tokenBProgramD = tokenProgramForFlag(L, poolState.tokenBFlag);
    if (!tokenAProgramD || !tokenBProgramD) {
      return { ok: false, error: 'splToken helpers missing from Solana bundle' };
    }

    var positionNftAccountD = P.derivePositionNftAccount(positionState.nftMint);
    var tokenAVaultD = P.deriveTokenVaultAddress(poolState.tokenAMint, poolPk);
    var tokenBVaultD = P.deriveTokenVaultAddress(poolState.tokenBMint, poolPk);

    var txD;
    try {
      txD = await cp.removeLiquidity({
        owner: keypair.publicKey,
        pool: poolPk,
        position: positionPk,
        positionNftAccount: positionNftAccountD,
        liquidityDelta: liquidityDeltaD,
        tokenAAmountThreshold: tokenAAmountThresholdD,
        tokenBAmountThreshold: tokenBAmountThresholdD,
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAVault: tokenAVaultD,
        tokenBVault: tokenBVaultD,
        tokenAProgram: tokenAProgramD,
        tokenBProgram: tokenBProgramD,
        vestings: vestingsD,
        currentPoint: currentPointD,
      });
    } catch (e) {
      return { ok: false, error: 'removeLiquidity failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var outD = await finalizeLegacyTx(connection, txD, [keypair], skipSimulation, skipPreflight);
    if (!outD.ok) return outD;
    return {
      ok: true,
      signature: outD.signature,
      explorerUrl: explorerForSig(rc.cluster, outD.signature),
      poolAddress: poolPk.toBase58(),
      removeLiquidityBps: bps,
    };
  };

  globalThis.__CFS_meteora_cpamm_claim_fees = async function (msg) {
    var L = getLib();
    var P = getPack();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!P || !P.CpAmm || !P.BN) {
      return { ok: false, error: 'Meteora CP-AMM SDK not loaded (run npm run build:meteora-cpamm)' };
    }

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var positionStr = String(msg.position || '').trim();
    if (!positionStr) return { ok: false, error: 'position (CP-AMM position account) required' };

    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;

    var rc;
    try {
      rc = await rpcClusterFromStorage(msg);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var connection = new L.Connection(rc.rpcUrl, 'confirmed');
    var positionPk = new L.PublicKey(positionStr);
    var cp = new P.CpAmm(connection);

    var positionState;
    try {
      positionState = await cp.fetchPositionState(positionPk);
    } catch (e) {
      return { ok: false, error: 'fetchPositionState failed: ' + (e && e.message ? e.message : String(e)) };
    }

    if (!positionState.owner.equals(keypair.publicKey)) {
      return { ok: false, error: 'Automation wallet is not the position owner' };
    }

    var poolPk = positionState.pool;
    if (msg.pool) {
      var explicitPool = new L.PublicKey(String(msg.pool).trim());
      if (!explicitPool.equals(poolPk)) {
        return { ok: false, error: 'pool does not match position.pool on-chain' };
      }
    }

    var poolState;
    try {
      poolState = await cp.fetchPoolState(poolPk);
    } catch (e) {
      return { ok: false, error: 'fetchPoolState failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var tokenAProgram = tokenProgramForFlag(L, poolState.tokenAFlag);
    var tokenBProgram = tokenProgramForFlag(L, poolState.tokenBFlag);
    if (!tokenAProgram || !tokenBProgram) {
      return { ok: false, error: 'splToken helpers missing from Solana bundle' };
    }

    var positionNftAccount = P.derivePositionNftAccount(positionState.nftMint);
    var tokenAVault = P.deriveTokenVaultAddress(poolState.tokenAMint, poolPk);
    var tokenBVault = P.deriveTokenVaultAddress(poolState.tokenBMint, poolPk);

    var tx;
    try {
      tx = await cp.claimPositionFee({
        owner: keypair.publicKey,
        pool: poolPk,
        position: positionPk,
        positionNftAccount: positionNftAccount,
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAVault: tokenAVault,
        tokenBVault: tokenBVault,
        tokenAProgram: tokenAProgram,
        tokenBProgram: tokenBProgram,
      });
    } catch (e) {
      return { ok: false, error: 'claimPositionFee failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var out = await finalizeLegacyTx(connection, tx, [keypair], skipSimulation, skipPreflight, msg);
    if (!out.ok) return out;
    return {
      ok: true,
      signature: out.signature,
      explorerUrl: explorerForSig(rc.cluster, out.signature),
      poolAddress: poolPk.toBase58(),
    };
  };

  globalThis.__CFS_meteora_cpamm_claim_reward = async function (msg) {
    var L = getLib();
    var P = getPack();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!P || !P.CpAmm || !P.BN) {
      return { ok: false, error: 'Meteora CP-AMM SDK not loaded (run npm run build:meteora-cpamm)' };
    }

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var positionStr = String(msg.position || '').trim();
    if (!positionStr) return { ok: false, error: 'position (CP-AMM position account) required' };

    var rewardIndex = parseInt(msg.rewardIndex, 10);
    if (!Number.isFinite(rewardIndex) || rewardIndex < 0 || rewardIndex > 1) rewardIndex = 0;

    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;

    var rc;
    try {
      rc = await rpcClusterFromStorage(msg);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var connection = new L.Connection(rc.rpcUrl, 'confirmed');
    var positionPk = new L.PublicKey(positionStr);
    var cp = new P.CpAmm(connection);

    var positionState;
    try {
      positionState = await cp.fetchPositionState(positionPk);
    } catch (e) {
      return { ok: false, error: 'fetchPositionState failed: ' + (e && e.message ? e.message : String(e)) };
    }

    if (!positionState.owner.equals(keypair.publicKey)) {
      return { ok: false, error: 'Automation wallet is not the position owner' };
    }

    var poolPk = positionState.pool;
    if (msg.pool) {
      var explicitPool2 = new L.PublicKey(String(msg.pool).trim());
      if (!explicitPool2.equals(poolPk)) {
        return { ok: false, error: 'pool does not match position.pool on-chain' };
      }
    }

    var poolState;
    try {
      poolState = await cp.fetchPoolState(poolPk);
    } catch (e) {
      return { ok: false, error: 'fetchPoolState failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var positionNftAccount = P.derivePositionNftAccount(positionState.nftMint);

    var tx;
    try {
      tx = await cp.claimReward({
        user: keypair.publicKey,
        position: positionPk,
        poolState: poolState,
        positionState: positionState,
        positionNftAccount: positionNftAccount,
        rewardIndex: rewardIndex,
        isSkipReward: msg.isSkipReward === true,
      });
    } catch (e) {
      return { ok: false, error: 'claimReward failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var out = await finalizeLegacyTx(connection, tx, [keypair], skipSimulation, skipPreflight);
    if (!out.ok) return out;
    return {
      ok: true,
      signature: out.signature,
      explorerUrl: explorerForSig(rc.cluster, out.signature),
      poolAddress: poolPk.toBase58(),
      rewardIndex: rewardIndex,
    };
  };

  /** Shared exact-in quote path for swap and quote-only message (no keypair). */
  async function meteoraCpammExactInQuoteCore(msg) {
    var L = getLib();
    var P = getPack();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!P || !P.CpAmm || !P.BN) {
      return { ok: false, error: 'Meteora CP-AMM SDK not loaded (run npm run build:meteora-cpamm)' };
    }

    var poolStr = String(msg.pool || '').trim();
    var inputMintStr = String(msg.inputMint || '').trim();
    var outputMintStr = String(msg.outputMint || '').trim();
    if (!poolStr || !inputMintStr || !outputMintStr) {
      return { ok: false, error: 'pool, inputMint, and outputMint required' };
    }

    var amountRaw;
    try {
      amountRaw = parseUintString('amountInRaw', msg.amountInRaw != null ? msg.amountInRaw : '0');
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (amountRaw === '0') {
      return { ok: false, error: 'amountInRaw must be > 0' };
    }

    var sbps = slipBps(msg.slippagePercent);

    var rc;
    try {
      rc = await rpcClusterFromStorage(msg);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var connection = new L.Connection(rc.rpcUrl, 'confirmed');
    var cp = new P.CpAmm(connection);
    var poolPk;
    try {
      poolPk = new L.PublicKey(poolStr);
    } catch (e) {
      return { ok: false, error: 'Invalid pool address' };
    }

    var inputMintPk;
    var outputMintPk;
    try {
      inputMintPk = new L.PublicKey(inputMintStr);
      outputMintPk = new L.PublicKey(outputMintStr);
    } catch (e) {
      return { ok: false, error: 'Invalid inputMint or outputMint' };
    }

    var poolState;
    try {
      poolState = await cp.fetchPoolState(poolPk);
    } catch (e) {
      return { ok: false, error: 'fetchPoolState failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var isInputA = inputMintPk.equals(poolState.tokenAMint);
    var isInputB = inputMintPk.equals(poolState.tokenBMint);
    if (!isInputA && !isInputB) {
      return { ok: false, error: 'inputMint must be the pool token A or B mint' };
    }
    var otherMint = isInputA ? poolState.tokenBMint : poolState.tokenAMint;
    if (!outputMintPk.equals(otherMint)) {
      return { ok: false, error: 'outputMint must be the other pool token mint' };
    }

    var spl = L.splToken;
    if (!spl || typeof spl.getMint !== 'function') {
      return { ok: false, error: 'splToken.getMint missing from Solana bundle' };
    }

    var tokenAProgram = tokenProgramForFlag(L, poolState.tokenAFlag);
    var tokenBProgram = tokenProgramForFlag(L, poolState.tokenBFlag);
    if (!tokenAProgram || !tokenBProgram) {
      return { ok: false, error: 'splToken helpers missing from Solana bundle' };
    }

    var mintAData;
    var mintBData;
    var decA;
    var decB;
    try {
      mintAData = await spl.getMint(connection, poolState.tokenAMint, 'confirmed', tokenAProgram);
      mintBData = await spl.getMint(connection, poolState.tokenBMint, 'confirmed', tokenBProgram);
      decA = mintAData.decimals;
      decB = mintBData.decimals;
    } catch (e) {
      return { ok: false, error: 'getMint failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var epochInfo;
    try {
      epochInfo = await connection.getEpochInfo('confirmed');
    } catch (e) {
      return { ok: false, error: 'getEpochInfo failed: ' + (e && e.message ? e.message : String(e)) };
    }
    var currentEpoch = epochInfo.epoch;

    var inputMintData = isInputA ? mintAData : mintBData;
    var outputMintData = isInputA ? mintBData : mintAData;

    var slotSw = await connection.getSlot('confirmed');
    var blockTimeSw = await connection.getBlockTime(slotSw);
    var currentTimeSw = blockTimeSw != null ? blockTimeSw : Math.floor(Date.now() / 1000);
    var currentSlotSw = slotSw;

    var amountInBn = new P.BN(amountRaw, 10);
    var quote;
    try {
      quote = cp.getQuote({
        inAmount: amountInBn,
        inputTokenMint: inputMintPk,
        slippage: sbps,
        poolState: poolState,
        currentTime: currentTimeSw,
        currentSlot: currentSlotSw,
        tokenADecimal: decA,
        tokenBDecimal: decB,
        hasReferral: false,
        inputTokenInfo: { mint: inputMintData, currentEpoch: currentEpoch },
        outputTokenInfo: { mint: outputMintData, currentEpoch: currentEpoch },
      });
    } catch (e) {
      return { ok: false, error: 'getQuote failed: ' + (e && e.message ? e.message : String(e)) };
    }

    return {
      ok: true,
      L: L,
      P: P,
      cp: cp,
      connection: connection,
      rc: rc,
      poolPk: poolPk,
      poolState: poolState,
      inputMintPk: inputMintPk,
      outputMintPk: outputMintPk,
      amountInBn: amountInBn,
      quote: quote,
      tokenAProgram: tokenAProgram,
      tokenBProgram: tokenBProgram,
      sbps: sbps,
    };
  }

  /** Shared exact-out quote path (getQuote2 swapMode 2). No keypair. */
  async function meteoraCpammExactOutQuoteCore(msg) {
    var L = getLib();
    var P = getPack();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!P || !P.CpAmm || !P.BN) {
      return { ok: false, error: 'Meteora CP-AMM SDK not loaded (run npm run build:meteora-cpamm)' };
    }

    var poolStr = String(msg.pool || '').trim();
    var inputMintStr = String(msg.inputMint || '').trim();
    var outputMintStr = String(msg.outputMint || '').trim();
    if (!poolStr || !inputMintStr || !outputMintStr) {
      return { ok: false, error: 'pool, inputMint, and outputMint required' };
    }

    var amountOutRaw;
    try {
      amountOutRaw = parseUintString('amountOutRaw', msg.amountOutRaw != null ? msg.amountOutRaw : '0');
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (amountOutRaw === '0') {
      return { ok: false, error: 'amountOutRaw must be > 0' };
    }

    var sbps = slipBps(msg.slippagePercent);

    var rc;
    try {
      rc = await rpcClusterFromStorage(msg);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var connection = new L.Connection(rc.rpcUrl, 'confirmed');
    var cp = new P.CpAmm(connection);
    var poolPk;
    try {
      poolPk = new L.PublicKey(poolStr);
    } catch (e) {
      return { ok: false, error: 'Invalid pool address' };
    }

    var inputMintPk;
    var outputMintPk;
    try {
      inputMintPk = new L.PublicKey(inputMintStr);
      outputMintPk = new L.PublicKey(outputMintStr);
    } catch (e) {
      return { ok: false, error: 'Invalid inputMint or outputMint' };
    }

    var poolState;
    try {
      poolState = await cp.fetchPoolState(poolPk);
    } catch (e) {
      return { ok: false, error: 'fetchPoolState failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var isInputA = inputMintPk.equals(poolState.tokenAMint);
    var isInputB = inputMintPk.equals(poolState.tokenBMint);
    if (!isInputA && !isInputB) {
      return { ok: false, error: 'inputMint must be the pool token A or B mint' };
    }
    var otherMint = isInputA ? poolState.tokenBMint : poolState.tokenAMint;
    if (!outputMintPk.equals(otherMint)) {
      return { ok: false, error: 'outputMint must be the other pool token mint' };
    }

    var spl = L.splToken;
    if (!spl || typeof spl.getMint !== 'function') {
      return { ok: false, error: 'splToken.getMint missing from Solana bundle' };
    }

    var tokenAProgram = tokenProgramForFlag(L, poolState.tokenAFlag);
    var tokenBProgram = tokenProgramForFlag(L, poolState.tokenBFlag);
    if (!tokenAProgram || !tokenBProgram) {
      return { ok: false, error: 'splToken helpers missing from Solana bundle' };
    }

    var mintAData;
    var mintBData;
    var decA;
    var decB;
    try {
      mintAData = await spl.getMint(connection, poolState.tokenAMint, 'confirmed', tokenAProgram);
      mintBData = await spl.getMint(connection, poolState.tokenBMint, 'confirmed', tokenBProgram);
      decA = mintAData.decimals;
      decB = mintBData.decimals;
    } catch (e) {
      return { ok: false, error: 'getMint failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var epochInfo;
    try {
      epochInfo = await connection.getEpochInfo('confirmed');
    } catch (e) {
      return { ok: false, error: 'getEpochInfo failed: ' + (e && e.message ? e.message : String(e)) };
    }
    var currentEpoch = epochInfo.epoch;

    var inputMintData = isInputA ? mintAData : mintBData;
    var outputMintData = isInputA ? mintBData : mintAData;

    var currentPointEo;
    try {
      currentPointEo = await getCpammCurrentPoint(connection, P, poolState);
    } catch (e) {
      return { ok: false, error: 'getCpammCurrentPoint failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var amountOutBn = new P.BN(amountOutRaw, 10);
    var quoteEo;
    try {
      quoteEo = cp.getQuote2({
        inputTokenMint: inputMintPk,
        slippage: sbps,
        poolState: poolState,
        currentPoint: currentPointEo,
        inputTokenInfo: { mint: inputMintData, currentEpoch: currentEpoch },
        outputTokenInfo: { mint: outputMintData, currentEpoch: currentEpoch },
        hasReferral: false,
        tokenADecimal: decA,
        tokenBDecimal: decB,
        swapMode: 2,
        amountOut: amountOutBn,
      });
    } catch (e) {
      return { ok: false, error: 'getQuote2 (exact out) failed: ' + (e && e.message ? e.message : String(e)) };
    }

    return {
      ok: true,
      L: L,
      P: P,
      cp: cp,
      connection: connection,
      rc: rc,
      poolPk: poolPk,
      poolState: poolState,
      inputMintPk: inputMintPk,
      outputMintPk: outputMintPk,
      amountOutBn: amountOutBn,
      quote: quoteEo,
      tokenAProgram: tokenAProgram,
      tokenBProgram: tokenBProgram,
      sbps: sbps,
    };
  }

  globalThis.__CFS_meteora_cpamm_quote_swap_exact_out = async function (msg) {
    var q = await meteoraCpammExactOutQuoteCore(msg);
    if (!q.ok) return q;
    var P = q.P;
    var cap = meteoraCpammApplyMaxInCeiling(P, q.quote.maximumAmountIn, msg);
    if (!cap.ok) return cap;
    var expIn = q.quote.includedFeeInputAmount ? q.quote.includedFeeInputAmount.toString(10) : '';
    var maxIn = cap.bn ? cap.bn.toString(10) : '';
    return {
      ok: true,
      quote: true,
      poolAddress: q.poolPk.toBase58(),
      cluster: q.rc.cluster,
      amountOutRaw: q.amountOutBn.toString(10),
      expectedInAmountRaw: expIn,
      maxInAmountRaw: maxIn,
      slippageBps: q.sbps,
    };
  };

  globalThis.__CFS_meteora_cpamm_quote_swap = async function (msg) {
    var q = await meteoraCpammExactInQuoteCore(msg);
    if (!q.ok) return q;
    var exp = q.quote.swapOutAmount ? q.quote.swapOutAmount.toString(10) : '';
    var minO = q.quote.minSwapOutAmount ? q.quote.minSwapOutAmount.toString(10) : '';
    return {
      ok: true,
      quote: true,
      poolAddress: q.poolPk.toBase58(),
      cluster: q.rc.cluster,
      expectedOutAmountRaw: exp,
      minOutAmountRaw: minO,
      slippageBps: q.sbps,
    };
  };

  globalThis.__CFS_meteora_cpamm_swap = async function (msg) {
    var q = await meteoraCpammExactInQuoteCore(msg);
    if (!q.ok) return q;

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var L = q.L;
    var P = q.P;
    var cp = q.cp;
    var poolPk = q.poolPk;
    var poolState = q.poolState;
    var inputMintPk = q.inputMintPk;
    var outputMintPk = q.outputMintPk;
    var amountInBn = q.amountInBn;
    var quote = q.quote;
    var tokenAProgram = q.tokenAProgram;
    var tokenBProgram = q.tokenBProgram;
    var rc = q.rc;
    var connection = q.connection;
    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;

    var minOutBn = quote.minSwapOutAmount;
    var floorRaw = String(msg.minimumAmountOutRaw != null ? msg.minimumAmountOutRaw : '')
      .trim()
      .replace(/,/g, '');
    if (floorRaw) {
      var floorBn;
      try {
        var floorStr = parseUintString('minimumAmountOutRaw', floorRaw);
        if (floorStr === '0') {
          return { ok: false, error: 'minimumAmountOutRaw must be > 0 when set' };
        }
        floorBn = new P.BN(floorStr, 10);
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
      minOutBn = minOutBn.gt(floorBn) ? minOutBn : floorBn;
    }

    var tokenAVaultSw = P.deriveTokenVaultAddress(poolState.tokenAMint, poolPk);
    var tokenBVaultSw = P.deriveTokenVaultAddress(poolState.tokenBMint, poolPk);

    var txSw;
    try {
      txSw = await cp.swap({
        payer: keypair.publicKey,
        pool: poolPk,
        inputTokenMint: inputMintPk,
        outputTokenMint: outputMintPk,
        amountIn: amountInBn,
        minimumAmountOut: minOutBn,
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAVault: tokenAVaultSw,
        tokenBVault: tokenBVaultSw,
        tokenAProgram: tokenAProgram,
        tokenBProgram: tokenBProgram,
        referralTokenAccount: null,
        poolState: poolState,
      });
    } catch (e) {
      return { ok: false, error: 'swap failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var outSw = await finalizeLegacyTx(connection, txSw, [keypair], skipSimulation, skipPreflight, msg);
    if (!outSw.ok) return outSw;
    return {
      ok: true,
      signature: outSw.signature,
      explorerUrl: explorerForSig(rc.cluster, outSw.signature),
      poolAddress: poolPk.toBase58(),
      expectedOutAmountRaw: quote.swapOutAmount ? quote.swapOutAmount.toString(10) : '',
      minOutAmountRaw: minOutBn ? minOutBn.toString(10) : '',
    };
  };

  globalThis.__CFS_meteora_cpamm_swap_exact_out = async function (msg) {
    var q = await meteoraCpammExactOutQuoteCore(msg);
    if (!q.ok) return q;

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var P = q.P;
    var cp = q.cp;
    var poolPk = q.poolPk;
    var poolState = q.poolState;
    var inputMintPk = q.inputMintPk;
    var outputMintPk = q.outputMintPk;
    var amountOutBn = q.amountOutBn;
    var quoteEo = q.quote;
    var tokenAProgram = q.tokenAProgram;
    var tokenBProgram = q.tokenBProgram;
    var rc = q.rc;
    var connection = q.connection;
    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;

    var cap = meteoraCpammApplyMaxInCeiling(P, quoteEo.maximumAmountIn, msg);
    if (!cap.ok) return cap;
    var maxInBn = cap.bn;

    var tokenAVaultEo = P.deriveTokenVaultAddress(poolState.tokenAMint, poolPk);
    var tokenBVaultEo = P.deriveTokenVaultAddress(poolState.tokenBMint, poolPk);

    var txEo;
    try {
      txEo = await cp.swap2({
        payer: keypair.publicKey,
        pool: poolPk,
        inputTokenMint: inputMintPk,
        outputTokenMint: outputMintPk,
        tokenAVault: tokenAVaultEo,
        tokenBVault: tokenBVaultEo,
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAProgram: tokenAProgram,
        tokenBProgram: tokenBProgram,
        referralTokenAccount: null,
        poolState: poolState,
        swapMode: 2,
        amountOut: amountOutBn,
        maximumAmountIn: maxInBn,
      });
    } catch (e) {
      return { ok: false, error: 'swap2 (exact out) failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var outEo = await finalizeLegacyTx(connection, txEo, [keypair], skipSimulation, skipPreflight, msg);
    if (!outEo.ok) return outEo;
    return {
      ok: true,
      signature: outEo.signature,
      explorerUrl: explorerForSig(rc.cluster, outEo.signature),
      poolAddress: poolPk.toBase58(),
      amountOutRaw: amountOutBn.toString(10),
      expectedInAmountRaw: quoteEo.includedFeeInputAmount ? quoteEo.includedFeeInputAmount.toString(10) : '',
      maxInAmountRaw: maxInBn ? maxInBn.toString(10) : '',
    };
  };
})();
