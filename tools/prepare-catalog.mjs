// Builds public/catalog from NoBanks Nearby masters and album art.
// Local dev tool: source files live on the artist's machine, outputs are committed.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const CSV = 'C:/Users/machi/OneDrive/Documents/Hackathons/Kiroween_Dead_Air/mstr_tracks.csv';
const ART = 'C:/Users/machi/OneDrive/Documents/AI Music/Album Art';
const OUT = path.join(ROOT, 'public/catalog');

// First entry is the record that teaches the room.
const SHELF = [
  'Wildflowers', 'Listening Time', 'Warm Tape', 'Downtown Nightlight',
  'Cafe Opens At Midnight', 'The Long Drive Home', "Let's Stay In Tonight", 'On A Different Frequency',
  'Velvet & Brass', 'Junkyard Jazz', 'The Keys Just Know Me',
  'Falling In Love With The Light', 'Hummingbird', 'Kintsugi',
];

const parseLine = (line) => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"'));
const rows = fs.readFileSync(CSV, 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map(parseLine);
const byTitle = new Map(rows.map((r) => [r[0].toLowerCase(), r]));
const slug = (t) => t.toLowerCase().replace(/&/g, 'and').replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

fs.mkdirSync(path.join(OUT, 'audio'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'covers'), { recursive: true });

const ff = (args) => run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { windowsHide: true, maxBuffer: 1 << 24 });
// Hand-written fields (moods, intro) survive a rebuild of the catalog.
const CATALOG = path.join(ROOT, 'src/catalog.json');
const previous = new Map((fs.existsSync(CATALOG) ? JSON.parse(fs.readFileSync(CATALOG, 'utf8')) : []).map((t) => [t.id, t]));
const tracks = [];
for (const title of SHELF) {
  const row = byTitle.get(title.toLowerCase());
  const cover = path.join(ART, `${title}.png`);
  if (!row) throw new Error(`no master for ${title}`);
  if (!fs.existsSync(row[6])) throw new Error(`master missing on disk: ${row[6]}`);
  if (!fs.existsSync(cover)) throw new Error(`no cover for ${title}`);
  const id = slug(title);
  const mp3 = path.join(OUT, 'audio', `${id}.mp3`);
  const jpg = path.join(OUT, 'covers', `${id}.jpg`);
  if (!fs.existsSync(mp3)) await ff(['-i', row[6], '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', mp3]);
  if (!fs.existsSync(jpg)) await ff(['-i', cover, '-vf', 'scale=512:512:flags=lanczos', '-q:v', '3', jpg]);
  tracks.push({
    ...previous.get(id),
    id,
    title,
    artist: 'NoBanks Nearby',
    audio: `catalog/audio/${id}.mp3`,
    art: `catalog/covers/${id}.jpg`,
    seconds: Number(row[1]),
  });
  console.log('ok', title, Math.round(fs.statSync(mp3).size / 1e5) / 10, 'MB');
}
fs.writeFileSync(CATALOG, `${JSON.stringify(tracks, null, 2)}\n`);
console.log('done', tracks.length);
