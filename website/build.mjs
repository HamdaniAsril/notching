// Builds the site for GitHub Pages: copies website/ to the output folder and fills in
// the latest published release, so the version, the DMG link and its size follow
// each release without editing index.html.
//
//   node website/build.mjs _site
//
// Elements it fills: <span data-rel="version">, <span data-rel="size"> (MB the way
// Finder and Safari count them, 1 MB = 1,000,000 bytes, so 6,990,372 bytes is "7")
// and <a data-rel="dmg" href="...">. If GitHub can't be reached, the values
// already in index.html stay, so the site still works and links to a real DMG.

import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] ?? '_site');
const repo = process.env.GITHUB_REPOSITORY ?? 'HamdaniAsril/notching';

await rm(out, { recursive: true, force: true });
await cp(here, out, { recursive: true, filter: (src) => path.basename(src) !== 'build.mjs' });

const file = path.join(out, 'index.html');
let html = await readFile(file, 'utf8');

try {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'notching-website-build' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const release = await res.json();
  const dmg = release.assets.find((a) => a.name.endsWith('.dmg'));
  if (!dmg) throw new Error(`release ${release.tag_name} has no .dmg`);

  const version = release.tag_name.replace(/^v/, '');
  const size = (dmg.size / 1e6).toFixed(1).replace(/\.0$/, '');

  html = html
    .replace(/(<span data-rel="version">)[^<]*(<\/span>)/g, `$1${version}$2`)
    .replace(/(<span data-rel="size">)[^<]*(<\/span>)/g, `$1${size}$2`)
    .replace(/(data-rel="dmg" href=")[^"]*(")/g, `$1${dmg.browser_download_url}$2`)
    .replace(/("softwareVersion": ")[^"]*(")/, `$1${version}$2`);
  console.log(`release ${version}: ${dmg.name}, ${size} MB`);
} catch (err) {
  console.log(`::warning::kept the release values in index.html: ${err.message}`);
}

await writeFile(file, html);
console.log(`site written to ${out}`);
