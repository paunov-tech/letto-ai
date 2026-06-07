// scripts/extract-homepage-css.mjs — v44-B P1: extract the homepage's inline
// CSS to a hashed, immutable-cached external file + minify (esbuild) + drop
// Cormorant (E2).
//
// Safe approach (no critical-CSS guessing → no FOUC): the THREE inline <style>
// blocks (2 in <head>, 1 in <body>) are concatenated IN DOCUMENT ORDER so the
// cascade is preserved (the body block stays last = still wins ties), minified,
// and written to public/css/home.{hash}.css. The first block is replaced by a
// single <link> in <head>; the other two are removed. Repeat visits serve the
// CSS from cache (immutable) and the HTML shrinks ~110KB.
//
// Idempotent: aborts if index.html already references /css/home.* .
// Re-run after any homepage CSS edit. Run: node scripts/extract-homepage-css.mjs

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const idxPath = path.resolve('public/index.html');
let html = fs.readFileSync(idxPath, 'utf8');

if (/\/css\/home\.[a-f0-9]+\.css/.test(html)) {
  console.log('· index.html already references /css/home.*.css — nothing to do.');
  process.exit(0);
}

// Line-anchored: real <style>/</style> tags sit alone at column 0. A naive
// /<style>...<\/style>/ is fooled by the literal text "<style>" inside an HTML
// comment BETWEEN blocks ("...the main <style>."), which leaks comment+tag junk
// into the CSS. ^<style>$ / ^</style>$ (multiline) match only the real tags.
const styleRe = /^<style>$([\s\S]*?)^<\/style>$/gm;
const blocks = [...html.matchAll(styleRe)];
if (blocks.length !== 3) {
  console.error(`FATAL · expected 3 <style> blocks, found ${blocks.length}. Aborting (no changes).`);
  process.exit(1);
}

// concat in document order (preserves cascade) + drop Cormorant (E2)
let css = blocks.map(b => b[1]).join('\n');
const cormBefore = (css.match(/Cormorant Garamond/g) || []).length;
css = css.replace(/Cormorant Garamond/g, 'Instrument Serif');

// minify with esbuild (real CSS parser — safe)
const tmpIn = path.join('/tmp', 'home-raw.css');
const tmpOut = path.join('/tmp', 'home-min.css');
fs.writeFileSync(tmpIn, css);
execFileSync('npx', ['--yes', 'esbuild', tmpIn, '--minify', `--outfile=${tmpOut}`], { stdio: ['ignore', 'inherit', 'inherit'] });
const min = fs.readFileSync(tmpOut, 'utf8');

const hash = crypto.createHash('sha256').update(min).digest('hex').slice(0, 10);
const rel = `css/home.${hash}.css`;
fs.mkdirSync(path.resolve('public/css'), { recursive: true });
fs.writeFileSync(path.resolve('public', rel), min);

// rewrite: 1st <style> → <link>, others → removed
let i = 0;
const newHtml = html.replace(styleRe, () => (++i === 1 ? `<link rel="stylesheet" href="/${rel}">` : ''));
fs.writeFileSync(idxPath, newHtml);

const kb = n => (n / 1024).toFixed(1) + 'KB';
console.log(`=== v44-B · homepage CSS extraction ===`);
console.log(`  Cormorant→Instrument Serif: ${cormBefore} swaps`);
console.log(`  raw CSS ${kb(Buffer.byteLength(css))} → minified ${kb(Buffer.byteLength(min))} (${Math.round(min.length / css.length * 100)}%)`);
console.log(`  wrote public/${rel}`);
console.log(`  index.html ${kb(Buffer.byteLength(html))} → ${kb(Buffer.byteLength(newHtml))}`);
