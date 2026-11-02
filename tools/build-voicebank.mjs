// Records the host's fixed lines with a stock Gemini voice, one mp3 per line.
// Local dev tool: needs GEMINI_API_KEY in the environment, outputs are committed.
// Safe to stop and rerun: finished lines are skipped. Waits out rate limits.
// Usage: node --experimental-strip-types tools/build-voicebank.mjs <VoiceName> [maxLines]
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { allLines } from '../src/host/lines.ts';

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public/voice');
const BANK = path.join(ROOT, 'src/host/voice-bank.json');
const VOICE = process.argv[2];
const MAX = Number(process.argv[3] || Infinity);
const KEY = process.env.GEMINI_API_KEY;
if (!VOICE || !KEY) throw new Error('usage: build-voicebank <VoiceName> [maxLines], with GEMINI_API_KEY set');

const DIRECTION =
  'Read this like a late night radio host alone in a small studio: low, warm, unhurried, close to the microphone, a little smile in it. Never announcer-y. Say only: ';
const MODEL = 'gemini-3.8-flash-tts';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tracks = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/catalog.json'), 'utf8'));
const lines = [...new Set(allLines(tracks))];
fs.mkdirSync(OUT, { recursive: true });
const bank = fs.existsSync(BANK) ? JSON.parse(fs.readFileSync(BANK, 'utf8')) : {};

async function record(line, file) {
  for (;;) {
    let response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: 'POST',
        signal: AbortSignal.timeout(60000),
        headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: DIRECTION + line }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
          },
        }),
      });
    } catch {
      await sleep(15000);
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      console.log('waiting', response.status);
      await sleep(65000);
      continue;
    }
    const json = await response.json();
    const part = json.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!part) throw new Error(`no audio for "${line}": ${response.status}`);
    const tmp = `${file}.bin`;
    fs.writeFileSync(tmp, Buffer.from(part.data, 'base64'));
    const input = part.mimeType.includes('wav') ? ['-i', tmp] : ['-f', 's16le', '-ar', '24000', '-ac', '1', '-i', tmp];
    await run(
      'ffmpeg',
      ['-y', '-hide_banner', '-loglevel', 'error', ...input, '-af', 'loudnorm=I=-16:TP=-1.5', '-ar', '44100', '-ac', '1', '-b:a', '80k', file],
      { windowsHide: true },
    );
    fs.unlinkSync(tmp);
    return;
  }
}

let done = 0;
for (const line of lines) {
  if (done >= MAX) break;
  const name = `${createHash('sha1').update(`${VOICE}|${line}`).digest('hex').slice(0, 12)}.mp3`;
  if (bank[line] === `voice/${name}` && fs.existsSync(path.join(OUT, name))) continue;
  await record(line, path.join(OUT, name));
  bank[line] = `voice/${name}`;
  fs.writeFileSync(BANK, `${JSON.stringify(bank, null, 2)}\n`);
  done++;
  console.log(`${Object.keys(bank).length}/${lines.length}`, line);
}
console.log('done', Object.keys(bank).length, 'of', lines.length);
