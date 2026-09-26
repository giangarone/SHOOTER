// GitHub Pages has no server process, so its item manifests and opaque module
// URLs are generated into the deployment artifact. Generated files never land
// in source control: parallel item branches still add only their independent
// definition files, and the merged main branch builds the combined catalogue.
import { createHash } from 'node:crypto';
import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = path.join(ROOT, '.pages');
const ITEM_DEFINITION = /^[A-Za-z_$][\w$]*\.js$/;
const ITEM_CATALOGUES = {
  passive: 'passive',
  active: 'active',
  donation: 'donation',
};
const SITE_ENTRIES = [
  'assets',
  'css',
  'js',
  'enemy-viewer.html',
  'index.html',
  'pixel-icon-sheet.html',
  'pixel-icon-viewer.html',
];

export async function buildPages() {
  const destination = DEFAULT_OUTPUT;
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const entry of SITE_ENTRIES) {
    await cp(path.join(ROOT, entry), path.join(destination, entry), { recursive: true });
  }

  const manifestDir = path.join(destination, '__item_manifest__');
  await mkdir(manifestDir, { recursive: true });
  const counts = {};

  for (const [kind, relative] of Object.entries(ITEM_CATALOGUES)) {
    const sourceDir = path.join(ROOT, 'js', 'items', relative, 'definitions');
    const moduleDir = path.join(destination, 'js', 'items', relative, 'modules');
    const files = (await readdir(sourceDir)).filter((file) => ITEM_DEFINITION.test(file)).sort();
    const manifest = [];
    await mkdir(moduleDir, { recursive: true });

    for (const file of files) {
      const source = await readFile(path.join(sourceDir, file));
      const token = createHash('sha256').update(source).digest('hex');
      await copyFile(path.join(sourceDir, file), path.join(moduleDir, `${token}.js`));
      manifest.push({ file, token });
    }

    // Named definitions are source inputs, not deployed URLs. Leaving them in
    // the artifact would make it too easy to accidentally reintroduce a URL
    // that an extension blocks based on an innocent item name.
    await rm(path.join(destination, 'js', 'items', relative, 'definitions'), { recursive: true });
    await writeFile(path.join(manifestDir, `${kind}.json`), JSON.stringify(manifest));
    counts[kind] = manifest.length;
  }

  return { output: destination, counts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { output, counts } = await buildPages();
  console.log(`Pages artifact: ${output}`);
  console.log(`${counts.passive} passive items / ${counts.active} active items / `
    + `${counts.donation} donation items`);
}
