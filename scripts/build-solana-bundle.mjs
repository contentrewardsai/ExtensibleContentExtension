import * as esbuild from 'esbuild';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const bannerPath = path.join(__dirname, 'browser-sw-process-shim.js');
const banner = fs.readFileSync(bannerPath, 'utf8');
const outFile = path.join(root, 'background/solana-lib.bundle.js');

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [path.join(root, 'scripts/solana-bundle-entry.js')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  legalComments: 'none',
  alias: { stream: 'stream-browserify', events: 'events' },
  outfile: outFile,
  banner: { js: banner },
  supported: { 'exponent-operator': false },
});

const patch = spawnSync(process.execPath, [path.join(__dirname, 'patch-bundle-pow-helper.mjs'), outFile], {
  stdio: 'inherit',
});
if (patch.status !== 0) process.exit(patch.status ?? 1);
