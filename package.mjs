#!/usr/bin/env node
/**
 * Assemble `dist/` — everything needed to serve the player, nothing else.
 *
 * The player is plain static files, so `dist/` drops onto any static host
 * (here.now, Netlify, S3, GitHub Pages, an intranet nginx) with no build step
 * and no server. Courses are read in the visitor's browser, so nothing is
 * uploaded and the host never sees course content.
 *
 * The sample course is deliberately excluded: it is real course data used for
 * local smoke-testing, not something to publish.
 */
import { cp, mkdir, rm, readdir, stat, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, 'dist');

const INCLUDE = ['index.html', 'player.js', 'audio-check.html', 'vendor'];

async function size(path) {
  const s = await stat(path);
  if (!s.isDirectory()) return s.size;
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    total += await size(join(path, entry.name));
  }
  return total;
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

let total = 0;
for (const item of INCLUDE) {
  const from = resolve(here, item);
  await cp(from, join(dist, item), { recursive: true });
  const bytes = await size(from);
  total += bytes;
  console.log(`  ${item.padEnd(14)} ${(bytes / 1e6).toFixed(2)} MB`);
}
// Fingerprint the assets index.html loads.
//
// The host serves them with `Cache-Control: max-age=3600`, so after a deploy a
// returning visitor keeps running the previous build for up to an hour — which
// is exactly how a shipped audio fix appeared not to work on a device that had
// opened the page before. A content hash in the URL makes a changed file a new
// URL, so a fix is picked up on the next load instead of an hour later.
const FINGERPRINT = ['player.js', 'vendor/maic-renderer.js', 'vendor/maic-app.css'];
let html = await readFile(join(dist, 'index.html'), 'utf8');
for (const asset of FINGERPRINT) {
  const bytes = await readFile(join(dist, asset));
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
  html = html.replaceAll(asset, `${asset}?v=${hash}`);
  console.log(`  fingerprint     ${asset} -> ?v=${hash}`);
}
await writeFile(join(dist, 'index.html'), html);

console.log(`dist/ ready — ${(total / 1e6).toFixed(1)} MB total`);
