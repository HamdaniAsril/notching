// Builds every module in modules/index.json into its own self-contained folder in
// dist-modules/, which the app bundles as its original module packages.
import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(repo, 'modules');
const out = join(repo, 'dist-modules');
const ids = JSON.parse(await readFile(join(src, 'index.json'), 'utf8'));

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const id of ids) {
  const manifest = JSON.parse(await readFile(join(src, id, 'manifest.json'), 'utf8'));
  const dest = join(out, id);
  await build({
    configFile: false,
    root: join(src, id),
    base: './',
    logLevel: 'warn',
    build: { outDir: dest, emptyOutDir: true },
  });
  await cp(join(src, id, 'manifest.json'), join(dest, 'manifest.json'));
  await cp(join(src, id, manifest.icon), join(dest, manifest.icon));
  await cp(join(src, id, 'locales'), join(dest, 'locales'), { recursive: true });
  try {
    await stat(join(dest, manifest.entry));
  } catch {
    throw new Error(`module ${id}: entry ${manifest.entry} is missing after the build`);
  }
  console.log(`module ${id} built`);
}
await cp(join(src, 'index.json'), join(out, 'index.json'));
