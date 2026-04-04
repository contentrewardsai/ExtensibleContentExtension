/**
 * After esbuild --supported:exponent-operator=false, the bundle uses
 * `var __pow = Math.pow` for both numbers and BigInts; Math.pow throws on BigInt.
 * Replace with a helper that exponentiates bigints without using `**` (hosts that
 * reject `**` in SW scripts still need numeric code lowered via esbuild).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKER = 'var __pow = Math.pow;';
const REPLACEMENT =
  'var __pow = function(a,b){' +
  'if(typeof a==="bigint"&&typeof b==="bigint"){' +
  'if(b<0n)throw new RangeError("bigint exponent negative");' +
  'var r=1n,x=a,e=b;' +
  'while(e>0n){if(e&1n)r*=x;x*=x;e>>=1n;}' +
  'return r;}' +
  'return Math.pow(a,b);' +
  '};';

/**
 * Buffer's ERR_OUT_OF_RANGE templates embed ` ** ` between `${…}` chunks. Some SW
 * parsers treat that as the exponent token; use string concat so `**` only appears in quotes.
 */
/** Emit `\u002a` twice in output JS (not a literal `**` token in source). */
const USTAR2 = '\\' + 'u002a' + '\\' + 'u002a';

function stripBufferRangePowTemplates(code) {
  const pairs = [
    [
      'range = `>= 0${n} and < 2${n} ** ${(byteLength2 + 1) * 8}${n}`;',
      `range = ">= 0" + n + " and < 2" + n + " ${USTAR2} " + String((byteLength2 + 1) * 8) + n;`,
    ],
    [
      'range = `>= -(2${n} ** ${(byteLength2 + 1) * 8 - 1}${n}) and < 2 ** ${(byteLength2 + 1) * 8 - 1}${n}`;',
      `range = ">= -(2" + n + " ${USTAR2} " + String((byteLength2 + 1) * 8 - 1) + n + ") and < 2 ${USTAR2} " + String((byteLength2 + 1) * 8 - 1) + n;`,
    ],
    [
      'range2 = `>= 0${n} and < 2${n} ** ${(byteLength2 + 1) * 8}${n}`;',
      `range2 = ">= 0" + n + " and < 2" + n + " ${USTAR2} " + String((byteLength2 + 1) * 8) + n;`,
    ],
    [
      'range2 = `>= -(2${n} ** ${(byteLength2 + 1) * 8 - 1}${n}) and < 2 ** ${(byteLength2 + 1) * 8 - 1}${n}`;',
      `range2 = ">= -(2" + n + " ${USTAR2} " + String((byteLength2 + 1) * 8 - 1) + n + ") and < 2 ${USTAR2} " + String((byteLength2 + 1) * 8 - 1) + n;`,
    ],
  ];
  let out = code;
  for (const [from, to] of pairs) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

/** Solana error string embeds `2n ** 63n` — strip a literal `**` token from source. */
function escapeSolanaTimestampErrorPow(code) {
  return code.split('2n ** 63n').join('2n\\u002a\\u002a63n');
}

/** Already-patched buffer lines used " ** " in string literals; remove raw `**` there too. */
function escapeBufferRangeConcatStars(code) {
  return code
    .split('" ** "')
    .join('" \\u002a\\u002a "')
    .split('") and < 2 ** "')
    .join('") and < 2 \\u002a\\u002a "');
}

const rel = process.argv[2];
if (!rel) {
  console.error('Usage: node scripts/patch-bundle-pow-helper.mjs <path-to-bundle.js>');
  process.exit(1);
}
const file = path.isAbsolute(rel) ? rel : path.resolve(__dirname, '..', rel);
const initial = fs.readFileSync(file, 'utf8');
let code = initial;
let powN = 0;
while (code.includes(MARKER)) {
  code = code.replace(MARKER, REPLACEMENT);
  powN++;
}
code = stripBufferRangePowTemplates(code);
code = escapeSolanaTimestampErrorPow(code);
code = escapeBufferRangeConcatStars(code);
code = code.split('RangeError("bigint ** negative")').join('RangeError("bigint exponent negative")');
if (code === initial) {
  console.log('patch-bundle-pow-helper: no changes', rel);
  process.exit(0);
}
fs.writeFileSync(file, code);
const parts = ['patch-bundle-pow-helper: wrote', rel];
if (powN) parts.push(String(powN) + ' __pow');
parts.push('no-raw-pow-tokens');
console.log(parts.join(' '));
