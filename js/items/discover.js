// Directory-driven item discovery. Node imports definitions directly. The
// browser uses opaque server URLs because content blockers can reject innocent
// item names (for example magpie.js) before the module reaches game code. In
// both environments a new branch only adds its item module, so independently-
// created items merge as independent Git paths instead of registry edits.

export async function discoverItems(kind, catalogueUrl) {
  let files;
  let moduleUrls;
  if (typeof window === 'undefined') {
    const [{ readdir }, { fileURLToPath }] = await Promise.all([
      import('node:fs/promises'),
      import('node:url'),
    ]);
    const directory = new URL('./definitions/', catalogueUrl);
    files = (await readdir(fileURLToPath(directory)))
      .filter((name) => /^[A-Za-z_$][\w$]*\.js$/.test(name))
      .sort();
    moduleUrls = files.map((file) => new URL(`./definitions/${file}`, catalogueUrl).href);
  } else {
    const response = await fetch(`/__item_manifest__/${kind}`);
    if (!response.ok) throw new Error(`could not load ${kind} item manifest`);
    const manifest = await response.json();
    if (!Array.isArray(manifest) || manifest.some((entry) =>
      !entry || typeof entry !== 'object'
      || !/^[A-Za-z_$][\w$]*\.js$/.test(entry.file)
      || !/^[a-f0-9]{64}$/.test(entry.token))) {
      throw new Error(`invalid ${kind} item manifest`);
    }
    files = manifest.map(({ file }) => file);
    moduleUrls = manifest.map(({ token }) => `/js/items/${kind}/modules/${token}.js`);
  }

  const modules = await Promise.all(moduleUrls.map((url) => import(url)));
  const catalogue = {};
  const icons = {};
  for (let i = 0; i < modules.length; i++) {
    const module = modules[i];
    const filename = files[i].slice(0, -3);
    if (module.id !== filename) {
      throw new Error(`${kind} item ${files[i]} exports id ${String(module.id)}`);
    }
    if (!module.default || typeof module.default !== 'object') {
      throw new Error(`${kind} item ${module.id} has no definition`);
    }
    if (catalogue[module.id]) throw new Error(`duplicate ${kind} item id: ${module.id}`);
    const definition = module.default;
    const valid = kind === 'passive'
      ? typeof definition.name === 'string'
        && Number.isInteger(definition.max) && definition.max > 0
        && Number.isFinite(definition.theme)
        && typeof definition.apply === 'function'
      : typeof definition.name === 'string'
        && Number.isFinite(definition.charge) && definition.charge >= 0
        && Number.isFinite(definition.theme)
        && typeof definition.use === 'function';
    if (!valid) throw new Error(`invalid ${kind} item definition: ${module.id}`);
    catalogue[module.id] = Object.freeze(definition);
    // A new item may carry its own 24x24 drawing. Existing drawings remain in
    // the generated legacy catalogue until they are next touched; new work
    // never has to edit that shared file just to add an offer.
    if (module.icon !== undefined) {
      if (!Array.isArray(module.icon) || module.icon.length !== 24
          || module.icon.some((row) => typeof row !== 'string' || row.length !== 24
            || /[^.01234]/.test(row))) {
        throw new Error(`${kind} item ${module.id} has a malformed icon`);
      }
      icons[module.id] = Object.freeze(module.icon.slice());
    }
  }
  return Object.freeze({
    items: Object.freeze(catalogue),
    icons: Object.freeze(icons),
  });
}
