import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { extractSpecifiers, packageName } from './specifiers.js';

export const DEFAULT_SKIP_DIRS = [
  'node_modules', '.git', 'dist', 'build', 'coverage', 'out', 'vendor',
  '.next', '.nuxt', '.cache', '.turbo', '.svelte-kit', '.output', '.venv',
];

export const SOURCE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte']);

/** Known config files that imply a tool dependency is used. */
export const CONFIG_TOOL_MAP = [
  [/^\.eslintrc/, 'eslint'],
  [/^eslint\.config\./, 'eslint'],
  [/^\.prettierrc/, 'prettier'],
  [/^prettier\.config\./, 'prettier'],
  [/^tsconfig\./, 'typescript'],
  [/^jest\.config\./, 'jest'],
  [/^vitest\.config\./, 'vitest'],
  [/^vite\.config\./, 'vite'],
  [/^tailwind\.config\./, 'tailwindcss'],
  [/^postcss\.config\./, 'postcss'],
  [/^webpack\.config\./, 'webpack'],
  [/^rollup\.config\./, 'rollup'],
  [/^babel\.config\./, '@babel/core'],
  [/^\.babelrc/, '@babel/core'],
  [/^\.mocharc/, 'mocha'],
];

/** Common bin-name aliases so `tsc` in a script marks `typescript` used. */
export const BIN_ALIASES = {
  typescript: ['tsc', 'tsserver'],
  'ts-node': ['ts-node', 'ts-node-esm', 'ts-node-script'],
  '@babel/core': ['babel'],
  '@babel/cli': ['babel'],
  '@vue/cli-service': ['vue-cli-service'],
  tailwindcss: ['tailwind', 'tailwindcss'],
  webpack: ['webpack', 'webpack-cli', 'webpack-dev-server'],
  'npm-run-all': ['npm-run-all', 'run-p', 'run-s', 'run-p', 'run-s'],
  'npm-run-all2': ['npm-run-all', 'run-p', 'run-s'],
  'cross-env': ['cross-env', 'cross-env-shell'],
  dotenv: ['dotenv'],
  'dotenv-cli': ['dotenv'],
  standard: ['standard', 'standardx'],
  'semantic-release': ['semantic-release'],
  'lint-staged': ['lint-staged'],
  nodemon: ['nodemon'],
  'http-server': ['http-server'],
  serve: ['serve'],
  vite: ['vite', 'vite-node'],
};

export function collectSourceFiles(root, { skipDirs = [], maxFiles = 20000, maxBytes = 2_000_000 } = {}) {
  const skip = new Set([...DEFAULT_SKIP_DIRS, ...skipDirs]);
  const files = [];
  const walk = (dir) => {
    if (files.length >= maxFiles) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) walk(full);
      } else if (entry.isFile()) {
        if (!SOURCE_EXT.has(extname(entry.name).toLowerCase())) continue;
        try {
          const st = statSync(full);
          if (st.size > maxBytes) continue;
        } catch {
          continue;
        }
        files.push(full);
      }
    }
  };
  walk(root);
  return files;
}

/**
 * Scan source files and return Map<packageName, Set<filePath>> of imported packages.
 */
export function scanImports(files) {
  const used = new Map();
  for (const file of files) {
    let source;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const spec of extractSpecifiers(source)) {
      const name = packageName(spec);
      if (!name) continue;
      if (!used.has(name)) used.set(name, new Set());
      used.get(name).add(file);
    }
  }
  return used;
}

/** Return the set of tool package names implied by config files at project root. */
export function detectConfigTools(root) {
  const tools = new Set();
  let entries;
  try {
    entries = readdirSync(root);
  } catch {
    return tools;
  }
  for (const name of entries) {
    for (const [re, pkg] of CONFIG_TOOL_MAP) {
      if (re.test(name)) {
        tools.add(pkg);
        break;
      }
    }
  }
  return tools;
}

/** Tokenize all package.json script commands into a word set. */
export function collectScriptTokens(pkg) {
  const tokens = new Set();
  const scripts = (pkg && pkg.scripts) || {};
  for (const cmd of Object.values(scripts)) {
    if (typeof cmd !== 'string') continue;
    for (const m of cmd.matchAll(/[\w@./-]+/g)) tokens.add(m[0]);
  }
  return tokens;
}
