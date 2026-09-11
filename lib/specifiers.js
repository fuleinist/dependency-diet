import { builtinModules } from 'node:module';

const BUILTINS = new Set(builtinModules);

// Order matters little; each pattern is applied independently and results unioned.
const PATTERNS = [
  // require('x')
  /(?:^|[^.\w$"'`])require\s*\(\s*(['"])([^'"\n]+?)\1\s*\)/g,
  // import('x')
  /(?:^|[^.\w$"'`])import\s*\(\s*(['"])([^'"\n]+?)\1\s*\)/g,
  // import ... from 'x' / export ... from 'x'
  /\bfrom\s*(['"])([^'"\n]+?)\1/g,
  // bare: import 'x'
  /\bimport\s*(['"])([^'"\n]+?)\1/g,
];

/**
 * Extract raw module specifiers from JavaScript/TypeScript source text.
 * Regex-based on purpose: fast, zero-dep, good enough for usage detection.
 */
export function extractSpecifiers(source) {
  const out = new Set();
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(source)) !== null) {
      out.add(m[2]);
    }
  }
  return [...out];
}

export function isBuiltin(name) {
  if (name.startsWith('node:')) return true;
  return BUILTINS.has(name);
}

/**
 * Map a module specifier to its package name, or null when it is not a
 * package reference (relative path, absolute path, builtin, subpath alias).
 *   'express'          -> 'express'
 *   'lodash/get'       -> 'lodash'
 *   '@scope/pkg/x'     -> '@scope/pkg'
 *   './local'          -> null
 *   'node:fs'          -> null
 */
export function packageName(specifier) {
  if (!specifier || typeof specifier !== 'string') return null;
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#')) return null;
  if (isBuiltin(specifier)) return null;
  const parts = specifier.split('/');
  if (specifier.startsWith('@')) {
    if (parts.length < 2 || parts[1] === '') return null;
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
}
