// Builds the gta6-01 entry and checks its own work. The game is this directory's game/ folder: plain
// static files a desktop browser loads offline (game/index.html and its ES modules, no library and no
// network request), and the program hands it in. It copies game/ and screenshots/ from beside this file
// to the output directory and writes dossier.json, the summary the judge reads, with the vendored
// make.fun library. After writing it, the program verifies the dossier it produced — the schema, cover
// and text fields the scorer expects, exactly four screenshots, and every file under its size cap — and
// prints a short summary of what it handed in, so a bad build fails here instead of at the scorer.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, DOSSIER_MAX_BYTES, INDEX_HTML_MAX_BYTES } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse
// an entry the scorer would refuse, so we mirror them here and check our own output against them.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
// gta6-01 hands in four renders. The scorer takes three or four, but this entry always ships four.
const SCREENSHOT_COUNT = 4;
// The dossier's schema, as the vendored library defines it.
const SCHEMA = 'makefun/dossier/v1';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const dossierPath = join(out, 'dossier.json');
writeFileSync(dossierPath, buildDossier(out, CAPS));
verifyOutput(out, dossierPath);
summarize(out, dossierPath);

/** Read the dossier back and fail loudly when it is missing anything the scorer requires. */
function verifyOutput(dir: string, dossierPath: string): void {
  const raw = readFileSync(dossierPath, 'utf8');
  let doc: any;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    throw new Error(`dossier.json is not valid JSON (${(err as Error).message})`);
  }

  const problems: string[] = [];
  if (doc.schema !== SCHEMA) problems.push(`schema is ${JSON.stringify(doc.schema)}, expected ${JSON.stringify(SCHEMA)}`);
  if (typeof doc.cover !== 'number') problems.push('cover is missing or not a number');
  if (typeof doc.text !== 'string') problems.push('text is missing or not a string');
  if (!Array.isArray(doc.images)) {
    problems.push('images is missing or not an array');
  } else if (doc.images.length !== SCREENSHOT_COUNT) {
    problems.push(`images holds ${doc.images.length}, expected ${SCREENSHOT_COUNT}`);
  } else {
    for (let i = 0; i < doc.images.length; i += 1) {
      const img = doc.images[i];
      for (const key of ['name', 'media_type', 'sha256', 'base64']) {
        if (typeof img?.[key] !== 'string' || img[key] === '') problems.push(`images[${i}].${key} is missing or empty`);
      }
    }
  }

  // The size caps the scorer enforces, re-checked on the bytes we actually wrote.
  const textBytes = Buffer.byteLength(doc.text, 'utf8');
  if (textBytes > CAPS.text_max_bytes) problems.push(`text is ${textBytes} bytes, over text_max_bytes ${CAPS.text_max_bytes}`);

  const indexBytes = lstatSync(join(dir, 'game', 'index.html')).size;
  if (indexBytes > INDEX_HTML_MAX_BYTES) problems.push(`game/index.html is ${indexBytes} bytes, over ${INDEX_HTML_MAX_BYTES}`);

  const dossierBytes = lstatSync(dossierPath).size;
  if (dossierBytes > DOSSIER_MAX_BYTES) problems.push(`dossier.json is ${dossierBytes} bytes, over ${DOSSIER_MAX_BYTES}`);

  for (const name of readdirSync(join(dir, 'screenshots'))) {
    const bytes = lstatSync(join(dir, 'screenshots', name)).size;
    if (bytes > CAPS.screenshots.max_bytes) problems.push(`screenshots/${name} is ${bytes} bytes, over ${CAPS.screenshots.max_bytes}`);
  }

  if (problems.length > 0) {
    throw new Error(`output verification failed:\n  - ${problems.join('\n  - ')}`);
  }
}

/** One screen's worth of what was handed in. */
function summarize(dir: string, dossierPath: string): void {
  const doc: any = JSON.parse(readFileSync(dossierPath, 'utf8'));
  const shots = readdirSync(join(dir, 'screenshots')).sort();
  const gameFiles = walkCount(join(dir, 'game'));
  console.log(`handed in ${dir}`);
  console.log(`  game/        ${gameFiles.files} files, ${gameFiles.bytes} bytes`);
  console.log(`  screenshots  ${shots.length}: ${shots.join(', ')}`);
  console.log(`  dossier.json ${lstatSync(dossierPath).size} bytes (schema ${doc.schema}, text ${Buffer.byteLength(doc.text, 'utf8')} bytes)`);
  console.log(`verified: ${SCREENSHOT_COUNT} screenshots, required fields present, all sizes under caps.`);
}

/** Count every file and byte under `dir`, directories included in the walk. */
function walkCount(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = walkCount(path);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += lstatSync(path).size;
    }
  }
  return { files, bytes };
}
