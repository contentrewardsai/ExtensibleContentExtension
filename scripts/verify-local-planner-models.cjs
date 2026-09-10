#!/usr/bin/env node
'use strict';

/**
 * HEAD-check public files for Qwen3 4B GGUF and Qwen 2.5 7B MLC.
 * Does not download weights.
 */
const https = require('https');
const http = require('http');

function head(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('http://') ? http : https;
    const req = lib.request(url, { method: 'HEAD', timeout: 20000 }, (res) => {
      const loc = res.headers.location;
      if (res.statusCode >= 300 && res.statusCode < 400 && loc) {
        const next = loc.startsWith('http') ? loc : new URL(loc, url).href;
        resolve(head(next));
        return;
      }
      resolve({
        url,
        status: res.statusCode,
        length: Number(res.headers['content-length'] || 0) || 0,
      });
    });
    req.on('error', (e) => resolve({ url, status: 0, error: e.message, length: 0 }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ url, status: 0, error: 'timeout', length: 0 });
    });
    req.end();
  });
}

async function main() {
  const checks = [
    {
      key: 'qwen34b',
      urls: [
        'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf',
      ],
    },
    {
      key: 'qwen7b',
      urls: [
        'https://huggingface.co/mlc-ai/Qwen2.5-7B-Instruct-q4f16_1-MLC/resolve/main/mlc-chat-config.json',
        'https://huggingface.co/mlc-ai/Qwen2.5-7B-Instruct-q4f16_1-MLC/resolve/main/tokenizer.json',
        'https://huggingface.co/mlc-ai/Qwen2.5-7B-Instruct-q4f16_1-MLC/resolve/main/params_shard_0.bin',
        'https://huggingface.co/mlc-ai/Qwen2.5-7B-Instruct-q4f16_1-MLC/resolve/main/params_shard_87.bin',
        'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/Qwen2-7B-Instruct-q4f16_1_cs1k-webgpu.wasm',
      ],
    },
  ];
  let failed = 0;
  for (const group of checks) {
    console.log('==', group.key);
    for (const url of group.urls) {
      const r = await head(url);
      const ok = r.status >= 200 && r.status < 400;
      if (!ok) failed += 1;
      console.log((ok ? 'OK ' : 'FAIL'), r.status, r.length, url.split('/').slice(-2).join('/'), r.error || '');
    }
  }
  if (failed) {
    console.error('verify-local-planner-models: failed', failed);
    process.exit(1);
  }
  console.log('verify-local-planner-models: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
