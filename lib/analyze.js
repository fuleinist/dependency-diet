import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  collectSourceFiles,
  scanImports,
  detectConfigTools,
  collectScriptTokens,
  BIN_ALIASES,
} from './scan.js';
import { parsePackageLock, parseYarnLock, findDuplicates } from './lockfile.js';
import { lookup } from './knowledge.js';

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function isUsed(name, ctx) {
  const { imported, configTools, scriptTokens, allDeps, hasTs } = ctx;
  if (imported.has(name)) return true;
  if (configTools.has(name)) return true;
  if (scriptTokens.has(name)) return true;
  for (const alias of BIN_ALIASES[name] || []) {
    if (scriptTokens.has(alias)) return true;
  }
  if (name.startsWith('@types/')) {
    const base = name.slice('@types/'.length);
    if (allDeps.has(base)) return true;
    if (hasTs && base === 'node') return true;
  }
  return false;
}

export function score(report) {
  let s = 100;
  s -= Math.min(40, report.unused.length * 5);
  s -= Math.min(20, report.duplicates.length * 3);
  let heavyPenalty = 0;
  for (const h of report.heavy) heavyPenalty += h.deprecated ? 7 : 3;
  s -= Math.min(30, heavyPenalty);
  return Math.max(0, s);
}

/**
 * Analyze a Node.js project directory.
 *
 * @param {string} dir project root (must contain package.json)
 * @param {object} [opts]
 * @param {boolean} [opts.prod] only analyze "dependencies"
 * @param {string[]} [opts.ignore] extra package names to ignore
 * @returns {object} report (see SPEC.md for shape)
 */
export function analyze(dir = '.', opts = {}) {
  const root = resolve(dir);
  const pkgPath = join(root, 'package.json');
  if (!existsSync(pkgPath)) {
    const err = new Error(`no package.json found in ${root}`);
    err.exitCode = 2;
    throw err;
  }

  let pkg;
  try {
    pkg = readJson(pkgPath);
  } catch (e) {
    const err = new Error(`failed to parse package.json: ${e.message}`);
    err.exitCode = 2;
    throw err;
  }

  const config = (pkg && pkg['dependency-diet']) || {};
  const ignore = new Set([...(config.ignore || []), ...(opts.ignore || [])]);
  const skipDirs = config.skipDirs || [];

  const prod = (pkg && pkg.dependencies) || {};
  const dev = (pkg && pkg.devDependencies) || {};
  const sections = opts.prod ? [['dependencies', prod]] : [['dependencies', prod], ['devDependencies', dev]];

  const notes = [];

  // --- source scan -------------------------------------------------------
  const files = collectSourceFiles(root, { skipDirs });
  const imported = scanImports(files);
  const configTools = detectConfigTools(root);
  const scriptTokens = collectScriptTokens(pkg);
  const hasTs = files.some((f) => /\.tsx?$/i.test(f));
  const allDeps = new Set([...Object.keys(prod), ...Object.keys(dev)]);

  // --- unused ------------------------------------------------------------
  const unused = [];
  let unusedSkipped = false;
  if (files.length === 0) {
    unusedSkipped = true;
    notes.push('no scannable source files found — unused-dependency detection skipped');
  } else {
    for (const [section, deps] of sections) {
      for (const name of Object.keys(deps)) {
        if (ignore.has(name)) continue;
        if (isUsed(name, { imported, configTools, scriptTokens, allDeps, hasTs })) continue;
        unused.push({ name, section });
      }
    }
    unused.sort((a, b) => a.name.localeCompare(b.name));
  }

  // --- lockfile duplicates -------------------------------------------------
  let lockfile = null;
  let duplicates = [];
  const lockPath = join(root, 'package-lock.json');
  const yarnPath = join(root, 'yarn.lock');
  const pnpmPath = join(root, 'pnpm-lock.yaml');
  if (existsSync(lockPath)) {
    lockfile = 'package-lock.json';
    try {
      duplicates = findDuplicates(parsePackageLock(readJson(lockPath)));
    } catch (e) {
      notes.push(`failed to parse package-lock.json: ${e.message}`);
    }
  } else if (existsSync(yarnPath)) {
    lockfile = 'yarn.lock';
    try {
      duplicates = findDuplicates(parseYarnLock(readFileSync(yarnPath, 'utf8')));
    } catch (e) {
      notes.push(`failed to parse yarn.lock: ${e.message}`);
    }
  } else if (existsSync(pnpmPath)) {
    lockfile = 'pnpm-lock.yaml';
    notes.push('pnpm-lock.yaml detected but parsing is not supported in v0.1 — duplicate detection skipped');
  } else {
    notes.push('no lockfile found — duplicate detection skipped (commit a lockfile for reproducible installs)');
  }

  // --- heavy / deprecated --------------------------------------------------
  const heavy = [];
  const seen = new Set();
  for (const [, deps] of sections) {
    for (const name of Object.keys(deps)) {
      if (seen.has(name)) continue;
      seen.add(name);
      if (ignore.has(name)) continue;
      const entry = lookup(name);
      if (!entry) continue;
      heavy.push({
        name,
        deprecated: Boolean(entry.deprecated),
        approxKbMinGzip: entry.kb,
        swap: entry.swap,
        ...(entry.note ? { note: entry.note } : {}),
      });
    }
  }
  heavy.sort((a, b) => (b.deprecated - a.deprecated) || b.approxKbMinGzip - a.approxKbMinGzip || a.name.localeCompare(b.name));

  const report = {
    project: {
      name: (pkg && pkg.name) || '',
      dir: root,
      dependencyCount: Object.keys(prod).length,
      devDependencyCount: Object.keys(dev).length,
      lockfile,
    },
    unused,
    unusedSkipped,
    duplicates,
    heavy,
    notes,
    summary: {
      unusedCount: unused.length,
      duplicateCount: duplicates.length,
      heavyCount: heavy.length,
      scannedFiles: files.length,
    },
  };
  report.summary.score = score(report);
  return report;
}

export { KB } from './knowledge.js';
