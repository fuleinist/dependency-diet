# dependency-diet

> Scan your project's dependencies and find the bloat — unused packages, duplicate versions, heavy alternatives, and one-line swap suggestions.

Zero-dependency Node CLI. Fully offline. No telemetry, no network calls, no `node_modules` required — just static analysis of your `package.json`, lockfile, and source files.

```
$ dependency-diet

dependency-diet — my-app
/home/me/my-app · 24 deps, 12 devDeps · lockfile: package-lock.json · 187 files scanned

✗ unused dependencies (2)
  ✗ moment [dependencies] — not imported or referenced in scripts/config · fix: npm uninstall moment
  ✗ uuid [dependencies] — not imported or referenced in scripts/config · fix: npm uninstall uuid

⚠ duplicated packages (1)
  ⚠ semver — 3 versions (5.7.1, 6.3.1, 7.5.4) across 9 installs · fix: npm dedupe / align ranges

⚠ heavy / deprecated packages (2)
  ✗ [DEPRECATED] request — ~130KB min+gzip · swap: native fetch (Node >= 18) or undici (deprecated since Feb 2020)
  ⚠ lodash — ~72KB min+gzip · swap: native ES methods, or per-method imports (lodash/get) (most helpers exist natively since ES2015+)

74/100 — 2 unused, 1 duplicated, 2 heavy in my-app
```

## Install

```bash
npm install -g dependency-diet
# or run without installing
npx dependency-diet
```

Requires Node >= 18. No runtime dependencies.

## Usage

```
dependency-diet [command] [dir] [options]

Commands:
  scan         Full report (default)
  unused       Unused dependencies only
  duplicates   Duplicate lockfile versions only
  heavy        Heavy/deprecated packages + lighter swaps only

Options:
  --json           Machine-readable JSON output
  --ci             Exit 1 if any finding exists
  --prod           Analyze "dependencies" only (skip devDependencies)
  --ignore <list>  Comma-separated package names to ignore
  --no-color       Disable ANSI colors (auto off when not a TTY / NO_COLOR set)
  -h, --help       Show help
  -V, --version    Print version
```

Examples:

```bash
dependency-diet                          # scan the current directory
dependency-diet scan ./packages/api      # scan a monorepo package
dependency-diet heavy --ci               # fail CI on deprecated/heavy deps
dependency-diet unused --json | jq .     # machine-readable
```

### Configuration

Add a `dependency-diet` key to your `package.json`:

```json
{
  "dependency-diet": {
    "ignore": ["my-build-plugin"],
    "skipDirs": ["fixtures", "vendor"]
  }
}
```

`--ignore` on the command line merges with the config list.

## What it detects

### 1. Unused dependencies

A dependency counts as **used** when any of these is true:

- imported (`import` / `require` / dynamic `import()` / `export ... from`) in any scanned source file (`.js .jsx .ts .tsx .mjs .cjs .vue .svelte`)
- referenced by name or bin alias (`tsc` → `typescript`, `babel` → `@babel/core`, ...) in any `package.json` script
- implied by a root config file (`tsconfig.json` → typescript, `.eslintrc*` → eslint, `vite.config.*` → vite, ...)
- `@types/x` where `x` is a dependency or imported from TypeScript (`@types/node` counts as used in any TS project)

Safety valve: if a project has **no scannable source files at all** (meta packages, workspace roots), unused detection is skipped and the report says so — no false positives.

### 2. Duplicate versions

Parses `package-lock.json` (lockfileVersion 1/2/3) and `yarn.lock` (v1) and reports every package resolving to 2+ distinct versions, with occurrence counts. `pnpm-lock.yaml` is detected but not parsed yet (v0.1).

### 3. Heavy & deprecated packages

A built-in knowledge base of ~45 commonly bloated, deprecated, or superseded packages, each with an approximate min+gzip size and a concrete swap — `moment` → `dayjs`, `request` (deprecated) → native `fetch`, `rimraf` → `fs.rm`, `chalk` → `picocolors`, `nodemon` → `node --watch`, `dotenv` → `node --env-file`, and more. Only **direct** dependencies are matched.

## Score

Starts at 100, with capped deductions:

| Finding | Deduction | Cap |
|---|---|---|
| Unused dependency | −5 each | −40 |
| Duplicated package | −3 each | −20 |
| Heavy package | −3 each | −30 (combined) |
| Deprecated package | −7 each | (combined cap) |

## CI integration

```yaml
- name: Dependency diet
  run: npx dependency-diet --ci
```

Exit codes: `0` success · `1` findings exist with `--ci` · `2` usage/project error.

`--json` gives the full report for dashboards:

```json
{
  "project": { "name": "my-app", "dir": "...", "dependencyCount": 24, "devDependencyCount": 12, "lockfile": "package-lock.json" },
  "unused": [{ "name": "moment", "section": "dependencies" }],
  "duplicates": [{ "name": "semver", "versions": ["5.7.1", "6.3.1"], "occurrences": 9 }],
  "heavy": [{ "name": "request", "deprecated": true, "approxKbMinGzip": 130, "swap": "native fetch (Node >= 18) or undici" }],
  "notes": [],
  "summary": { "unusedCount": 1, "duplicateCount": 1, "heavyCount": 1, "scannedFiles": 187, "score": 85 }
}
```

## Programmatic API

```js
import { analyze } from 'dependency-diet';

const report = analyze('./packages/api', { prod: true, ignore: ['some-pkg'] });
console.log(report.summary.score);
```

## Development

```bash
git clone https://github.com/fuleinist/dependency-diet
cd dependency-diet
npm test          # node:test, no install needed
```

See [SPEC.md](SPEC.md) for the full v0.1 specification. Roadmap: pnpm-lock parsing, `--fix` mode, monorepo workspace awareness, live bundlephobia data.

## License

MIT
