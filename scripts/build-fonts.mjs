#!/usr/bin/env node
/*
 * build-fonts.mjs — produce the self-hosted Public Sans subset
 * -----------------------------------------------------------------------------
 * Takes the "latin" Public Sans woff2 files shipped by @fontsource/public-sans
 * and subsets each weight down to the glyphs the site's own pages actually use,
 * re-emitting woff2. No Google Fonts, no CDN: the output in assets/fonts/ is the
 * only thing the site loads.
 *
 *   npm install --no-save @fontsource/public-sans subset-font
 *   node scripts/build-fonts.mjs
 *
 * Re-run whenever the visible copy on the static pages changes. If a glyph is
 * missing the browser falls back to the system sans (font-display: swap), so a
 * stale subset degrades rather than breaks — but keep it current.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import subsetFont from 'subset-font';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'assets', 'fonts');

// Pages whose visible text is set in Public Sans. index.html (prototype) and web/* use the
// system font stack and are deliberately excluded.
const PAGES = ['index.html', 'charter.html', 'impressum.html', 'datenschutz.html'];

function textFromHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rarr;/g, '→')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&hellip;/g, '…')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

const chars = new Set();

// Everything printable ASCII, so minor copy edits don't need a rebuild.
for (let c = 0x20; c <= 0x7e; c++) chars.add(String.fromCharCode(c));

// Typographic + accented characters the pages and the CSS use.
for (const c of ' £§·°«»–—‘’“”…→✓äöüßéèàÄÖÜ') {
  chars.add(c);
}

for (const page of PAGES) {
  const raw = readFileSync(join(ROOT, page), 'utf8');
  for (const ch of textFromHtml(raw)) chars.add(ch);
}
// site.css pseudo-element content (e.g. the check mark)
for (const ch of readFileSync(join(ROOT, 'assets', 'site.css'), 'utf8')) {
  if (ch.charCodeAt(0) > 0x7e) chars.add(ch);
}

const text = [...chars].join('');
console.log(`Subsetting to ${chars.size} glyphs.`);

const WEIGHTS = [
  ['400', 'public-sans-latin-400-normal.woff2'],
  ['600', 'public-sans-latin-600-normal.woff2'],
  ['700', 'public-sans-latin-700-normal.woff2'],
];

mkdirSync(OUT_DIR, { recursive: true });

for (const [weight, file] of WEIGHTS) {
  const src = join(ROOT, 'node_modules', '@fontsource', 'public-sans', 'files', file);
  const input = readFileSync(src);
  const out = await subsetFont(input, text, { targetFormat: 'woff2' });
  const dest = join(OUT_DIR, `public-sans-${weight}.woff2`);
  writeFileSync(dest, out);
  console.log(`  ${weight}: ${input.length} -> ${out.length} bytes  ${dest}`);
}
