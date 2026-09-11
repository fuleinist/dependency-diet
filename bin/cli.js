#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { analyze } from '../lib/analyze.js';
import { formatText, formatJson } from '../lib/report.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const COMMANDS = new Set(['scan', 'unused', 'duplicates', 'heavy']);

const HELP = `dependency-diet v${pkg.version} — find the bloat in your Node.js dependencies

Usage:
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
  --no-color       Disable ANSI colors (auto off when not a TTY)
  -h, --help       Show this help
  -V, --version    Print version

Config in package.json:
  "dependency-diet": { "ignore": ["pkg"], "skipDirs": ["fixtures"] }

Examples:
  dependency-diet
  dependency-diet scan ./packages/api --json
  dependency-diet heavy --ci
`;

export function run(argv, { stdout, stderr }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        json: { type: 'boolean', default: false },
        ci: { type: 'boolean', default: false },
        prod: { type: 'boolean', default: false },
        ignore: { type: 'string' },
        'no-color': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'V', default: false },
      },
    });
  } catch (err) {
    stderr(`dependency-diet: ${err.message}\nTry --help for usage.\n`);
    return 2;
  }

  const { values, positionals } = parsed;
  if (values.help) {
    stdout(HELP);
    return 0;
  }
  if (values.version) {
    stdout(`${pkg.version}\n`);
    return 0;
  }

  let command = 'scan';
  let dir = '.';
  let commandSet = false;
  let dirSet = false;
  for (const pos of positionals) {
    if (!commandSet && COMMANDS.has(pos)) {
      command = pos;
      commandSet = true;
    } else if (!dirSet) {
      dir = pos;
      dirSet = true;
    } else {
      stderr(`dependency-diet: unexpected argument "${pos}"\n`);
      return 2;
    }
  }

  const ignore = values.ignore
    ? values.ignore.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  let report;
  try {
    report = analyze(dir, { prod: values.prod, ignore });
  } catch (err) {
    stderr(`dependency-diet: ${err.message}\n`);
    return err.exitCode || 2;
  }

  if (command === 'unused') {
    report = { ...report, duplicates: [], heavy: [], summary: { ...report.summary, duplicateCount: 0, heavyCount: 0 } };
  } else if (command === 'duplicates') {
    report = { ...report, unused: [], heavy: [], summary: { ...report.summary, unusedCount: 0, heavyCount: 0 } };
  } else if (command === 'heavy') {
    report = { ...report, unused: [], duplicates: [], summary: { ...report.summary, unusedCount: 0, duplicateCount: 0 } };
  }

  if (values.json) {
    stdout(`${formatJson(report)}\n`);
  } else {
    const color = !values['no-color'] && !process.env.NO_COLOR && Boolean(process.stdout.isTTY);
    stdout(`${formatText(report, { color })}\n`);
  }

  if (values.ci) {
    const findings = report.summary.unusedCount + report.summary.duplicateCount + report.summary.heavyCount;
    if (findings > 0) return 1;
  }
  return 0;
}

// Only execute when run directly (not when imported by tests).
const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  process.exitCode = run(process.argv.slice(2), {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
  });
}
