/**
 * Lockfile parsers. Each returns Map<packageName, Map<version, occurrenceCount>>.
 */

function add(map, name, version) {
  if (!map.has(name)) map.set(name, new Map());
  const versions = map.get(name);
  versions.set(version, (versions.get(version) || 0) + 1);
}

/** Parse package-lock.json (lockfileVersion 1, 2 or 3). */
export function parsePackageLock(lock) {
  const versions = new Map();
  if (lock && typeof lock === 'object' && lock.packages && typeof lock.packages === 'object') {
    for (const [key, meta] of Object.entries(lock.packages)) {
      if (key === '') continue; // root project
      const idx = key.lastIndexOf('node_modules/');
      if (idx === -1) continue;
      const name = key.slice(idx + 'node_modules/'.length);
      if (!name || !meta || typeof meta.version !== 'string') continue;
      add(versions, name, meta.version);
    }
  } else if (lock && typeof lock === 'object' && lock.dependencies) {
    const walk = (deps) => {
      for (const [name, meta] of Object.entries(deps)) {
        if (meta && typeof meta.version === 'string') add(versions, name, meta.version);
        if (meta && meta.dependencies && typeof meta.dependencies === 'object') walk(meta.dependencies);
      }
    };
    walk(lock.dependencies);
  }
  return versions;
}

function splitYarnDescriptors(header) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (const ch of header) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.filter((s) => s.trim() !== '');
}

function yarnDescriptorToName(descriptor) {
  const clean = descriptor.trim().replace(/^"|"$/g, '');
  if (!clean) return null;
  // npm: aliases look like npm:pkg@range inside the descriptor; take the part before @range
  const at = clean.startsWith('@') ? clean.indexOf('@', 1) : clean.indexOf('@');
  if (at === -1 || at === 0) return null;
  const name = clean.slice(0, at);
  return name || null;
}

/** Parse a yarn.lock (v1 classic format) text. */
export function parseYarnLock(text) {
  const versions = new Map();
  const lines = String(text).split(/\r?\n/);
  let currentNames = [];
  for (const line of lines) {
    if (/^\s*#/.test(line) || line.trim() === '') continue;
    if (!/^\s/.test(line) && line.trimEnd().endsWith(':')) {
      const header = line.trimEnd().slice(0, -1);
      currentNames = splitYarnDescriptors(header)
        .map(yarnDescriptorToName)
        .filter(Boolean);
      continue;
    }
    const vm = line.match(/^\s+version\s+"([^"]+)"/);
    if (vm && currentNames.length > 0) {
      for (const name of currentNames) add(versions, name, vm[1]);
      currentNames = [];
    }
  }
  return versions;
}

/**
 * From a version map, return packages resolving to 2+ distinct versions,
 * sorted by (version count desc, name asc).
 */
export function findDuplicates(versionMap) {
  const out = [];
  for (const [name, vmap] of versionMap) {
    if (vmap.size >= 2) {
      const versions = [...vmap.keys()].sort();
      const occurrences = [...vmap.values()].reduce((a, b) => a + b, 0);
      out.push({ name, versions, occurrences });
    }
  }
  return out.sort((a, b) => b.versions.length - a.versions.length || a.name.localeCompare(b.name));
}
