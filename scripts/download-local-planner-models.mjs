/**
 * Download Qwen3 4B GGUF and/or Qwen 2.5 7B weights into models/ (gitignored).
 * Usage: node scripts/download-local-planner-models.mjs [qwen34b|qwen7b|both]
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MODELS = path.join(ROOT, 'models');
const which = (process.argv[2] || 'both').toLowerCase();

const QWEN34B = {
  key: 'qwen34b',
  dest: path.join(MODELS, 'Qwen', 'Qwen3-4B-GGUF'),
  files: [
    ['https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf', 'Qwen3-4B-Q4_K_M.gguf'],
  ],
};

function qwenFiles() {
  const base = 'https://huggingface.co/mlc-ai/Qwen2.5-7B-Instruct-q4f16_1-MLC/resolve/main';
  const dest = path.join(MODELS, 'mlc-ai', 'Qwen2.5-7B-Instruct-q4f16_1-MLC');
  const files = [
    'mlc-chat-config.json',
    'ndarray-cache.json',
    'tensor-cache.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'merges.txt',
    'vocab.json',
  ].map((f) => [base + '/' + f, f]);
  for (let i = 0; i < 88; i++) {
    const name = 'params_shard_' + i + '.bin';
    files.push([base + '/' + name, name]);
  }
  return {
    key: 'qwen7b',
    dest,
    files: files.concat([
      [
        'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/Qwen2-7B-Instruct-q4f16_1_cs1k-webgpu.wasm',
        path.join('..', '..', 'mlc-libs', 'Qwen2-7B-Instruct-q4f16_1_cs1k-webgpu.wasm'),
      ],
    ]),
  };
}

function request(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('http://') ? http : https;
    const req = lib.get(url, { timeout: 120000, headers: opts.headers || {} }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        res.resume();
        resolve(request(next, opts));
        return;
      }
      resolve(res);
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout ' + url));
    });
  });
}

async function downloadFile(url, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const tmp = destPath + '.part';
  let existing = 0;
  if (fs.existsSync(destPath)) {
    existing = fs.statSync(destPath).size;
  } else if (fs.existsSync(tmp)) {
    existing = fs.statSync(tmp).size;
  }
  const headers = {
    'User-Agent': 'cfs-local-planner-download/1.0',
  };
  if (existing > 0 && !fs.existsSync(destPath)) headers.Range = 'bytes=' + existing + '-';
  if (fs.existsSync(destPath) && existing > 0) {
    const head = await request(url, { headers: { 'User-Agent': headers['User-Agent'] } });
    const total = Number(head.headers['content-length'] || 0);
    head.resume();
    if (total && existing >= total) {
      console.error('skip', path.relative(ROOT, destPath), existing);
      return;
    }
    fs.unlinkSync(destPath);
    existing = 0;
  }
  const res = await request(url, { headers });
  if (res.statusCode !== 200 && res.statusCode !== 206) {
    res.resume();
    throw new Error('HTTP ' + res.statusCode + ' ' + url);
  }
  const out = fs.createWriteStream(tmp, { flags: existing && res.statusCode === 206 ? 'a' : 'w' });
  await new Promise((resolve, reject) => {
    res.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    res.on('error', reject);
  });
  fs.renameSync(tmp, destPath);
  console.error('done', path.relative(ROOT, destPath), fs.statSync(destPath).size);
}

async function runPool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function downloadSpec(spec) {
  console.error('== downloading', spec.key, 'to', spec.dest);
  await runPool(spec.files, 3, async ([url, rel]) => {
    const destPath = path.isAbsolute(rel) ? rel : path.join(spec.dest, rel);
    await downloadFile(url, destPath);
  });
  console.error('== finished', spec.key);
}

async function main() {
  const jobs = [];
  if (which === 'qwen34b' || which === 'qwen3' || which === 'olmo7b' || which === 'olmo' || which === 'both') jobs.push(QWEN34B);
  if (which === 'qwen7b' || which === 'qwen' || which === 'both') jobs.push(qwenFiles());
  if (!jobs.length) throw new Error('usage: qwen34b | qwen7b | both');
  for (const spec of jobs) await downloadSpec(spec);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
