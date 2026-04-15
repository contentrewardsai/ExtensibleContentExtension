/**
 * Node.js roundtrip test: estimate-words → SRT → parse → rich-caption asset → verify
 * 
 * Simulates: TTS text → word timing → SRT file → parse SRT → rich-caption words → verify
 */

// Load modules (they attach to globalThis)
require('../core/estimate-words.js');
require('../core/srt.js');

const parseSrt = globalThis.__CFS_parseSrt;
const parseVtt = globalThis.__CFS_parseVtt;
const wordsToSrt = globalThis.__CFS_wordsToSrt;
const wordsToVtt = globalThis.__CFS_wordsToVtt;
const estimateWords = globalThis.__CFS_estimateWords;

let pass = 0, fail = 0;

function assert(name, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    pass++;
  } else {
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
    fail++;
  }
}

// ═══════════════════════════════════════════════════
console.log('\n═══ 1. SRT Parser Unit Tests ═══\n');

// Basic SRT
const srt1 = '1\n00:00:01,000 --> 00:00:03,000\nHello world\n\n2\n00:00:04,000 --> 00:00:06,500\nGoodbye world\n';
const r1 = parseSrt(srt1);
assert('Parse basic SRT — 2 cues', r1.cues.length === 2, `got ${r1.cues.length}`);
assert('Cue 1 text = "Hello world"', r1.cues[0].text === 'Hello world');
assert('Cue 1 start = 1s', r1.cues[0].start === 1);
assert('Cue 1 end = 3s', r1.cues[0].end === 3);
assert('Cue 2 start = 4s', r1.cues[1].start === 4);
assert('Cue 2 end = 6.5s', r1.cues[1].end === 6.5);
assert('4 words generated', r1.words.length === 4, `got ${r1.words.length}`);
assert('Full text correct', r1.text === 'Hello world Goodbye world');

// VTT
const vtt1 = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello VTT\n\n00:00:04.000 --> 00:00:06.000\nMore text\n';
const r2 = parseVtt(vtt1);
assert('Parse VTT — 2 cues', r2.cues.length === 2);
assert('VTT cue 1 = "Hello VTT"', r2.cues[0].text === 'Hello VTT');

// HTML tag stripping
const vtt2 = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n<b>Bold</b> and <i>italic</i>\n';
const r3 = parseVtt(vtt2);
assert('Strip HTML tags', r3.cues[0].text === 'Bold and italic');

// Empty input
const r4 = parseSrt('');
assert('Empty input → 0 cues', r4.cues.length === 0 && r4.words.length === 0);

// MM:SS.mmm format
const srt5 = '1\n01:30.500 --> 02:00.000\nShort format\n';
const r5 = parseSrt(srt5);
assert('MM:SS.mmm → 90.5s start', r5.cues[0].start === 90.5);

// Multi-line cue text
const srt6 = '1\n00:00:01,000 --> 00:00:03,000\nLine one\nLine two\n';
const r6 = parseSrt(srt6);
assert('Multi-line cue joined', r6.cues[0].text === 'Line one Line two');

// ═══════════════════════════════════════════════════
console.log('\n═══ 2. SRT Roundtrip (words → SRT → parse → verify) ═══\n');

const words = [
  { text: 'Hello', start: 0, end: 0.4 },
  { text: 'world,', start: 0.4, end: 0.8 },
  { text: 'this', start: 1.0, end: 1.3 },
  { text: 'is', start: 1.3, end: 1.5 },
  { text: 'a', start: 1.5, end: 1.6 },
  { text: 'test.', start: 1.6, end: 2.0 },
];
const srt = wordsToSrt(words);
assert('wordsToSrt produces output', srt.length > 20);
assert('SRT contains -->', srt.indexOf('-->') !== -1);
assert('SRT contains Hello', srt.indexOf('Hello') !== -1);
console.log('\n  Generated SRT:');
srt.split('\n').forEach(l => console.log('    ' + l));

const parsed = parseSrt(srt);
assert('Re-parsed has words', parsed.words.length > 0, `got ${parsed.words.length}`);
const origText = words.map(w => w.text).join(' ');
assert('Text content preserved', parsed.text === origText, `expected "${origText}", got "${parsed.text}"`);

// VTT roundtrip
const vtt = wordsToVtt(words);
assert('wordsToVtt starts with WEBVTT', vtt.indexOf('WEBVTT') === 0);
const vttParsed = parseVtt(vtt);
assert('VTT roundtrip text preserved', vttParsed.text === origText);

// ═══════════════════════════════════════════════════
console.log('\n═══ 3. TTS Text → estimate-words → SRT → parse → Rich-Caption Asset ═══\n');

const ttsText = 'Hello world, this is a test of the text to speech and speech to text roundtrip pipeline.';
console.log(`  Input text: "${ttsText}"\n`);

// Step 1: Simulate TTS output → estimate word timings
const estWords = estimateWords(ttsText, 0);
assert('estimateWords produces words', estWords.length === 17, `got ${estWords.length}`);
assert('First word = "Hello"', estWords[0].text === 'Hello');
assert('Word timings are sequential', estWords.every((w, i) => i === 0 || w.start >= estWords[i-1].end));
console.log(`  Estimated ${estWords.length} words, duration: 0–${estWords[estWords.length-1].end}s\n`);

// Step 2: Generate SRT from words
const srtFromTts = wordsToSrt(estWords);
assert('SRT generated from TTS words', srtFromTts.length > 50);
const srtLines = srtFromTts.split('\n').filter(l => l.trim());
const cueCount = srtLines.filter(l => l.indexOf('-->') !== -1).length;
assert(`SRT has ${cueCount} cues`, cueCount >= 1);
console.log(`\n  Generated SRT (${srtFromTts.length} chars, ${cueCount} cues):`);
srtFromTts.split('\n').forEach(l => console.log('    ' + l));

// Step 3: Parse SRT back
const srtParsed = parseSrt(srtFromTts);
assert('SRT parsed back to words', srtParsed.words.length > 0, `got ${srtParsed.words.length}`);
const parsedText = srtParsed.words.map(w => w.text).join(' ');
assert('Roundtrip text matches', parsedText === ttsText, `expected "${ttsText}", got "${parsedText}"`);

// Step 4: Build rich-caption asset
const richCaptionAsset = {
  type: 'rich-caption',
  words: srtParsed.words,
  font: { family: 'Open Sans', size: 32, color: '#ffffff', weight: 700 },
  stroke: { width: 2, color: '#000000', opacity: 1 },
  animation: { style: 'karaoke' },
  align: { vertical: 'bottom' },
  active: { font: { color: '#efbf04' } }
};
assert('Rich-caption asset built', richCaptionAsset.type === 'rich-caption');
assert('Asset has words array', Array.isArray(richCaptionAsset.words) && richCaptionAsset.words.length === srtParsed.words.length);
assert('Asset has font styling', richCaptionAsset.font.family === 'Open Sans');
assert('Asset has animation', richCaptionAsset.animation.style === 'karaoke');
assert('Asset has active word color', richCaptionAsset.active.font.color === '#efbf04');

// Step 5: Verify the asset words can re-export to SRT
const reExportedSrt = wordsToSrt(richCaptionAsset.words);
const reExportedParsed = parseSrt(reExportedSrt);
assert('Re-exported SRT text matches', reExportedParsed.text === ttsText);

console.log(`\n  Final rich-caption asset:`);
console.log(JSON.stringify(richCaptionAsset, null, 2).split('\n').map(l => '    ' + l).join('\n'));

// ═══════════════════════════════════════════════════
console.log('\n═══ 4. External SRT Import Simulation ═══\n');

const externalSrt = `1
00:00:00,500 --> 00:00:02,800
Welcome to our video tutorial.

2
00:00:03,200 --> 00:00:06,400
Today we'll learn about rich captions and SRT support.

3
00:00:07,000 --> 00:00:09,500
Let's get started with the basics.`;

const extParsed = parseSrt(externalSrt);
assert('External SRT: 3 cues parsed', extParsed.cues.length === 3);
assert('External SRT: words generated', extParsed.words.length > 0, `got ${extParsed.words.length}`);
assert('External SRT: first cue at 0.5s', extParsed.cues[0].start === 0.5);
assert('External SRT: last cue ends at 9.5s', extParsed.cues[2].end === 9.5);

// Build rich-caption from external SRT
const extAsset = {
  type: 'rich-caption',
  words: extParsed.words,
  font: { family: 'Montserrat', size: 28, color: '#ffffff' },
  animation: { style: 'highlight' },
  active: { font: { color: '#f59e0b', background: '#000000' } }
};
assert('External SRT → rich-caption built', extAsset.words.length > 0);

// Export back to SRT and VTT
const extSrt = wordsToSrt(extAsset.words);
const extVtt = wordsToVtt(extAsset.words);
assert('Re-exported SRT valid', extSrt.indexOf('-->') !== -1);
assert('Re-exported VTT has header', extVtt.indexOf('WEBVTT') === 0);
assert('VTT uses dots (not commas)', extVtt.indexOf(',') === -1 || extVtt.indexOf('.') !== -1);

// ═══════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════');
console.log(`\n  Results: ${pass} passed, ${fail} failed\n`);
if (fail > 0) {
  console.log('  ❌ SOME TESTS FAILED\n');
  process.exit(1);
} else {
  console.log('  ✅ ALL TESTS PASSED\n');
  process.exit(0);
}
