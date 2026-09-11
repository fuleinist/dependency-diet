# dependency-diet — SPEC (v0.1.0)

Scan a Node.js project's dependencies and find the bloat: unused packages, duplicate versions in the lockfile, heavy/deprecated packages with lighter swaps. Zero-dependency Node CLI.

## Goals

- **Zero runtime dependencies.** Node >= 18 only (`node:fs`, `node:path`, `node:util`, `node:module`).
- **Fast, local, offline.** No network calls. Pure static analysis of `package.json`, lockfile, and source files.
- **CI-friendly.** `--json` output, `--ci` exit codes, GitHub-friendly summary line.
- **Actionable.** Every finding comes with a suggested fix (delete, dedupe, or swap).

## Commands

```
dependency-diet [dir]            # full scan (default command)
dependency-diet unused [dir]     # unused dependencies only
dependency-diet duplicates [dir] # duplicate lockfile versions only
dependency-diet heavy [dir]      # heavy/deprecated packages + swaps only
dependency-diet --help | --version
```

`[dir]` defaults to the current working directory.

## Options

| Flag | Effect |
|---|---|
| `--json` | Machine-readable JSON report on stdout |
| `--ci` | Exit 1 if any finding exists (default exit 0 unless error) |
| `--prod` | Only analyze `dependencies` (skip `devDependencies`) |
| `--ignore <a,b,c>` | Extra package names to ignore (merged with config) |
| `--no-color` | Disable ANSI colors (auto-disabled when not a TTY) |

Config in `package.json`:

```json
"dependency-diet": { "ignore": ["some-pkg"], "skipDirs": ["fixtures"] }
```

## Detection rules

### 1. Unused dependencies

A dependency is **used** if any of the following is true:

- Its package name appears in an `import`/`require`/`export ... from`/dynamic
  `import()` specifier in any scanned source file (`.js .jsx .ts .tsx .mjs .cjs
  .vue .svelte`), walking the project tree and skipping `node_modules`, `.git`,
  `dist`, `build`, `coverage`, `out`, `vendor`, `.next`, `.nuxt`, `.cache`,
  `.turbo`, `.svelte-kit`.
- Its package name appears as a word in any `package.json` script (catches CLI
  tools: `eslint`, `vite`, `jest`, ...), including common bin aliases
  (`typescript` → `tsc`, `esbuild` → `esbuild`, etc.).
- A well-known config file for it exists at project root (`.eslintrc*` /
  `eslint.config.*` → eslint, `prettier` config → prettier, `tsconfig.json` →
  typescript, `jest.config.*` → jest, `vite.config.*` → vite, `tailwind.config.*`
  → tailwindcss, `postcss.config.*` → postcss, `webpack.config.*` → webpack,
  `rollup.config.*` → rollup, `babel.config.*` / `.babelrc` → @babel/core,
  `vitest.config.*` → vitest).
- For `@types/x`: package `x` is a dependency, or `x` is imported in any
  TypeScript file.
- It is listed in the ignore config or `--ignore`.

Everything else is reported as **unused**, tagged with its section
(`dependencies` / `devDependencies`).

Safety valve: if the project has **no scannable source files at all**, unused
detection is skipped and the report says so (avoids false positives on
meta-packages/workspaces-only repos).

### 2. Duplicate versions

Parse `package-lock.json` (lockfileVersion 2 or 3, via the `packages` map —
name = last `node_modules/<name>` path segment) or `yarn.lock` (v1 format).
Report every package name that resolves to 2+ distinct versions, with the
version list and occurrence count. `pnpm-lock.yaml` is detected but reported as
unsupported in v0.1 (listed, not parsed). No lockfile → note in report.

### 3. Heavy / deprecated packages (knowledge base)

Static built-in KB (~40 entries) of commonly bloated or deprecated packages
with approximate min+gzip size and a lighter replacement, e.g.:

- `moment` → `dayjs` / `date-fns` / `Intl` (maintenance mode)
- `lodash` → native ES methods or per-method imports
- `request`, `har-validator`, `node-uuid`, `querystring`, `left-pad` → **deprecated**, replacements listed
- `axios`, `node-fetch`, `got`, `superagent` → native `fetch` (Node >= 18)
- `uuid` → `crypto.randomUUID` · `rimraf`/`del` → `fs.rm` · `mkdirp` → `fs.mkdir`
- `chalk`/`colors` → `picocolors` or `node:util` `styleText`
- `cross-env`/`dotenv` → `node --env-file` · `minimist`/`yargs` → `node:util` `parseArgs`
- `nodemon` → `node --watch` · `bluebird`/`q`/`async` → native Promises/async-await
- `fs-extra`/`ncp`/`cpy` → native `fs` · `crypto-js`/`md5`/`sha1`/`bcrypt`(hash) → `node:crypto`
- `glob` → `fs.glob` (Node >= 22) / `fast-glob` · `webpack` → `esbuild`/`vite` (where applicable)
- `underscore` → native · `through2` → native streams · `is-odd`-style micro-packages → one-liners

Only direct dependencies listed in the project's `package.json` are matched
against the KB (not transitive).

## Report

### JSON shape

```json
{
  "project": { "name": "...", "dir": "...", "dependencyCount": 4, "devDependencyCount": 2, "lockfile": "package-lock.json" },
  "unused":     [ { "name": "moment", "section": "dependencies" } ],
  "duplicates": [ { "name": "foo", "versions": ["1.0.0", "2.1.0"], "occurrences": 3 } ],
  "heavy":      [ { "name": "request", "deprecated": true, "approxKbMinGzip": 130, "swap": "native fetch (Node >= 18)", "note": "..." } ],
  "summary": { "unusedCount": 1, "duplicateCount": 1, "heavyCount": 1, "scannedFiles": 12, "score": 87 }
}
```

### Score

Starts at 100. Deductions: unused −5 each (cap −40), duplicate package −3 each
(cap −20), heavy −3 each, deprecated −7 each (cap −30). Floor 0.

### Text output

Colored sections (auto-disabled on non-TTY), one line per finding with the
suggested fix, then summary: `dependency-diet: <score>/100 — X unused, Y duplicated, Z heavy in <name>`.

## Exit codes

- `0` — success (findings or not, unless `--ci`)
- `1` — `--ci` and findings exist
- `2` — usage error / unreadable project (no `package.json`)

## Tests

`node:test` + `node:assert/strict`. Unit tests for specifier extraction,
package-name mapping, script/config usage detection, lock parsers (npm v2/v3,
yarn v1), KB matching, score math, JSON shape; fixture projects under
`test/fixtures/` for end-to-end scans (basic unused, duplicates, heavy).
Target: all green on Node 18/20/22, ubuntu + windows.

## Non-goals (v0.1)

- Network lookups (npm download stats, live bundlephobia API)
- pnpm-lock.yaml parsing
- Python/Go/Rust projects
- Auto-fix (`--fix`) — report only
