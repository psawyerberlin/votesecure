#!/usr/bin/env node
/*
 * build-charter.mjs — render CHARTER.md to charter.html
 * -----------------------------------------------------------------------------
 * CHARTER.md is the single source of truth. charter.html is generated and must
 * never be hand-edited.
 *
 *   node scripts/build-charter.mjs            regenerate charter.html
 *   node scripts/build-charter.mjs --check    exit 1 if charter.html is stale
 *
 * The --check mode is meant for a pre-deploy / CI gate: it fails loudly when
 * CHARTER.md has changed but charter.html was not rebuilt, so a stale Charter
 * can never be published silently.
 *
 * No dependencies. The Markdown subset supported is exactly what CHARTER.md
 * uses: ATX headings, paragraphs (with single-newline line breaks, as GitHub
 * renders .md), `---` rules, `>` blockquotes, `-` bullet lists, `1.` ordered
 * lists, pipe tables, and inline `**bold**`, `*italic*`, `` `code` ``,
 * `[text](url)` and the literal `#TO_BE_IMPROVED#` marker. Anything outside
 * that subset should make the build fail rather than emit wrong HTML.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'CHARTER.md');
const OUT = join(ROOT, 'charter.html');

/* ----------------------------- inline markdown ---------------------------- */

const SENT = '￼'; // OBJECT REPLACEMENT CHARACTER — code-span placeholder marker

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(src) {
  // Protect code spans first so their contents are not further parsed.
  const codes = [];
  let s = src.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `${SENT}${codes.length - 1}${SENT}`;
  });

  s = escapeHtml(s);

  // Literal open-item marker (used outside backticks, if ever).
  s = s.replace(/#TO_BE_IMPROVED#/g, '<span class="tbi">To be improved</span>');

  // Links: [text](url). External links open in a new tab, with a screen-reader hint.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
    const safe = url.replace(/"/g, '%22');
    if (/^https?:\/\//i.test(url)) {
      return `<a href="${safe}" target="_blank" rel="noopener">${text}` +
             '<span class="visually-hidden"> (opens in a new tab)</span></a>';
    }
    return `<a href="${safe}">${text}</a>`;
  });

  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  // Restore code spans.
  s = s.replace(new RegExp(SENT + '(\\d+)' + SENT, 'g'), (_, i) => {
    const c = codes[Number(i)];
    // The Charter marks unresolved items with a backticked #TO_BE_IMPROVED#.
    // Render those as open-item flags, consistent with the site's colour language.
    if (c === '#TO_BE_IMPROVED#') return '<span class="tbi">To be improved</span>';
    return `<code>${escapeHtml(c)}</code>`;
  });

  return s;
}

/* ------------------------------ block parsing ---------------------------- */

function parseBlocks(md) {
  const lines = md.replace(/\r\n/g, '\n').replace(/\t/g, '    ').split('\n');
  const out = [];
  let i = 0;

  const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const isTableSep = (l) => /^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(l);

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') { i++; continue; }

    // Horizontal rule
    if (/^\s*---+\s*$/.test(line)) { out.push({ type: 'hr' }); i++; continue; }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { out.push({ type: 'heading', level: h[1].length, text: h[2].trim() }); i++; continue; }

    // Blockquote (consecutive '>' lines, blank '>' lines allowed inside)
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push({ type: 'blockquote', blocks: parseBlocks(buf.join('\n')) });
      continue;
    }

    // Table
    if (isTableRow(line) && isTableSep(lines[i + 1] || '')) {
      const header = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      out.push({ type: 'table', header, rows });
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        let item = lines[i].replace(/^\s*[-*]\s+/, '');
        i++;
        while (i < lines.length && lines[i].trim() !== '' && /^\s+\S/.test(lines[i]) &&
               !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
          item += ' ' + lines[i].trim();
          i++;
        }
        items.push(item);
      }
      out.push({ type: 'list', ordered: false, items });
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        let item = lines[i].replace(/^\s*\d+\.\s+/, '');
        i++;
        while (i < lines.length && lines[i].trim() !== '' && /^\s+\S/.test(lines[i]) &&
               !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
          item += ' ' + lines[i].trim();
          i++;
        }
        items.push(item);
      }
      out.push({ type: 'list', ordered: true, items });
      continue;
    }

    // Paragraph
    const para = [];
    while (i < lines.length && lines[i].trim() !== '' &&
           !/^\s*---+\s*$/.test(lines[i]) &&
           !/^(#{1,6})\s+/.test(lines[i]) &&
           !/^>\s?/.test(lines[i]) &&
           !/^\s*[-*]\s+/.test(lines[i]) &&
           !/^\s*\d+\.\s+/.test(lines[i]) &&
           !(isTableRow(lines[i]) && isTableSep(lines[i + 1] || ''))) {
      para.push(lines[i]);
      i++;
    }
    out.push({ type: 'paragraph', text: para.join('\n') });
  }

  return out;
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/* ------------------------------ rendering ------------------------------- */

function renderBlocks(blocks) {
  return blocks.map(renderBlock).join('\n');
}

function renderBlock(b) {
  switch (b.type) {
    case 'hr':
      return '<hr>';
    case 'heading': {
      const lvl = Math.min(b.level + 1, 6); // shift down: Charter's # becomes page h2
      return `<h${lvl}>${inline(b.text)}</h${lvl}>`;
    }
    case 'paragraph':
      return `<p>${b.text.split('\n').map((l) => inline(l.trim())).join('<br>\n')}</p>`;
    case 'blockquote':
      return `<blockquote>\n${renderBlocks(b.blocks)}\n</blockquote>`;
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      const items = b.items.map((it) => `  <li>${inline(it)}</li>`).join('\n');
      return `<${tag}>\n${items}\n</${tag}>`;
    }
    case 'table': {
      const head = b.header.map((c) => `<th>${inline(c)}</th>`).join('');
      const body = b.rows
        .map((r) => `    <tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
        .join('\n');
      return `<div class="table-scroll">\n<table>\n  <thead><tr>${head}</tr></thead>\n  <tbody>\n${body}\n  </tbody>\n</table>\n</div>`;
    }
    default:
      throw new Error(`unknown block type: ${b.type}`);
  }
}

/* -------------------------------- page --------------------------------- */

function buildPage(md) {
  const body = renderBlocks(parseBlocks(md));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Contributor Charter — VoteSecure</title>
  <meta name="description" content="The VoteSecure Contributor Charter: Merit-Voice governance and distribution rules. Draft v0.1.">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preload" as="font" type="font/woff2" href="assets/fonts/public-sans-400.woff2" crossorigin>
  <link rel="preload" as="font" type="font/woff2" href="assets/fonts/public-sans-700.woff2" crossorigin>
  <link rel="stylesheet" href="assets/site.css">
</head>
<body>
  <!-- Generated from CHARTER.md by scripts/build-charter.mjs. Do not edit this file. -->
  <a class="skip" href="#main">Skip to content</a>

  <header class="masthead">
    <div class="wrap masthead__inner">
      <a class="nav-brand" href="/">
        <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="M9 11l3 3L22 4"></path>
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
        </svg>
        <span class="logo-text">VoteSecure</span>
      </a>
      <nav class="jump" aria-label="Site">
        <a href="/">Home</a>
        <a href="index.html#unsolved">Open problems</a>
        <a href="index.html#apply">Apply</a>
      </nav>
    </div>
  </header>

  <main id="main" class="doc">
    <div class="wrap">
      <p class="doc-note">This page is generated from
        <a href="https://github.com/psawyerberlin/votesecure/blob/main/CHARTER.md" target="_blank" rel="noopener">CHARTER.md<span class="visually-hidden"> (opens in a new tab)</span></a>
        in the repository, which is the single source of truth. The Charter is a draft and
        is not yet adopted.</p>
${body}
    </div>
  </main>

  <footer class="colophon">
    <div class="wrap">
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="https://github.com/psawyerberlin/votesecure" target="_blank" rel="noopener">Repository<span class="visually-hidden"> (opens in a new tab)</span></a></li>
        <li><a href="impressum.html">Impressum</a></li>
        <li><a href="datenschutz.html">Datenschutz</a></li>
        <li><a href="https://github.com/psawyerberlin/votesecure/blob/main/LICENSE" target="_blank" rel="noopener">MIT Licence<span class="visually-hidden"> (opens in a new tab)</span></a></li>
      </ul>
      <p class="repeat">No token. No investment round. Ever.</p>
    </div>
  </footer>
</body>
</html>
`;
}

/* -------------------------------- main --------------------------------- */

const md = readFileSync(SRC, 'utf8');
const html = buildPage(md);
const check = process.argv.includes('--check');

if (check) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
  if (current === html) {
    console.log('charter.html is up to date with CHARTER.md');
    process.exit(0);
  }
  console.error(
    'ERROR: charter.html is out of sync with CHARTER.md.\n' +
    '       Run  node scripts/build-charter.mjs  and commit the result.'
  );
  process.exit(1);
}

writeFileSync(OUT, html);
console.log(`Wrote ${OUT} (${html.length} bytes) from CHARTER.md`);
