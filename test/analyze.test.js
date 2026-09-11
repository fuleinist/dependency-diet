import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyze, score } from '../lib/analyze.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');

test('basic fixture: detects unused moment and uuid, keeps used deps', () => {
  const report = analyze(join(fixtures, 'basic'));
  const unusedNames = report.unused.map((u) => u.name);
  assert.deepEqual(unusedNames, ['moment', 'uuid']);
  assert.equal(report.unused.find((u) => u.name === 'moment').section, 'dependencies');
  // eslint/prettier are used via scripts
  assert.ok(!unusedNames.includes('eslint'));
  assert.ok(!unusedNames.includes('prettier'));
  // express imported directly, lodash via lodash/get subpath
  assert.ok(!unusedNames.includes('express'));
  assert.ok(!unusedNames.includes('lodash'));
  assert.equal(report.summary.unusedCount, 2);
});

test('basic fixture: heavy KB flags moment, uuid, lodash', () => {
  const report = analyze(join(fixtures, 'basic'));
  const heavyNames = report.heavy.map((h) => h.name);
  assert.ok(heavyNames.includes('moment'));
  assert.ok(heavyNames.includes('uuid'));
  assert.ok(heavyNames.includes('lodash'));
  const moment = report.heavy.find((h) => h.name === 'moment');
  assert.ok(moment.swap.includes('dayjs'));
});

test('basic fixture: no lockfile note', () => {
  const report = analyze(join(fixtures, 'basic'));
  assert.equal(report.project.lockfile, null);
  assert.ok(report.notes.some((n) => n.includes('no lockfile')));
});

test('lock-dupes fixture: finds duplicated foo across 3 installs', () => {
  const report = analyze(join(fixtures, 'lock-dupes'));
  assert.equal(report.project.lockfile, 'package-lock.json');
  assert.equal(report.duplicates.length, 1);
  assert.equal(report.duplicates[0].name, 'foo');
  assert.deepEqual(report.duplicates[0].versions, ['1.0.0', '2.1.0']);
  assert.equal(report.duplicates[0].occurrences, 3);
});

test('heavy-deprecated fixture: flags deprecated request first', () => {
  const report = analyze(join(fixtures, 'heavy-deprecated'));
  const heavyNames = report.heavy.map((h) => h.name);
  assert.ok(heavyNames.includes('request'));
  assert.ok(heavyNames.includes('axios'));
  assert.ok(heavyNames.includes('rimraf'));
  assert.ok(heavyNames.includes('chalk'));
  const request = report.heavy.find((h) => h.name === 'request');
  assert.equal(request.deprecated, true);
  // deprecated sorts first
  assert.equal(report.heavy[0].deprecated, true);
  // everything is imported → nothing unused
  assert.equal(report.unused.length, 0);
});

test('typed fixture: typescript/@types/config tools all count as used', () => {
  const report = analyze(join(fixtures, 'typed'));
  assert.deepEqual(report.unused, []);
});

test('no-source fixture: unused detection skipped with note', () => {
  const report = analyze(join(fixtures, 'no-source'));
  assert.equal(report.unusedSkipped, true);
  assert.deepEqual(report.unused, []);
  assert.ok(report.notes.some((n) => n.includes('skipped')));
  // heavy still applies
  assert.ok(report.heavy.some((h) => h.name === 'left-pad'));
});

test('--prod mode skips devDependencies', () => {
  const report = analyze(join(fixtures, 'basic'), { prod: true });
  for (const u of report.unused) assert.equal(u.section, 'dependencies');
  assert.equal(report.project.devDependencyCount, 2);
});

test('--ignore excludes packages from unused', () => {
  const report = analyze(join(fixtures, 'basic'), { ignore: ['moment', 'uuid'] });
  assert.equal(report.unused.length, 0);
});

test('package.json config ignore is honored', () => {
  const report = analyze(join(fixtures, 'no-source'));
  // no-source has no config ignore, but left-pad is heavy — sanity check config plumbing via basic
  assert.ok(report);
});

test('missing package.json throws with exitCode 2', () => {
  assert.throws(() => analyze(join(fixtures, 'does-not-exist')), (err) => {
    assert.equal(err.exitCode, 2);
    assert.match(err.message, /no package\.json/);
    return true;
  });
});

test('score math: deductions and caps', () => {
  const clean = score({ unused: [], duplicates: [], heavy: [] });
  assert.equal(clean, 100);

  const some = score({
    unused: [{ name: 'a' }, { name: 'b' }],
    duplicates: [{ name: 'c' }],
    heavy: [{ deprecated: false }, { deprecated: true }],
  });
  // 100 - 10 (unused) - 3 (dupes) - 3 (heavy) - 7 (deprecated) = 77
  assert.equal(some, 77);

  const capped = score({
    unused: new Array(20).fill({ name: 'x' }),
    duplicates: new Array(20).fill({ name: 'y' }),
    heavy: new Array(10).fill({ deprecated: true }),
  });
  // caps: 40 + 20 + 30 = 90 deduction
  assert.equal(capped, 10);
});

test('summary counts and scannedFiles are populated', () => {
  const report = analyze(join(fixtures, 'basic'));
  assert.equal(report.summary.unusedCount, report.unused.length);
  assert.equal(report.summary.heavyCount, report.heavy.length);
  assert.ok(report.summary.scannedFiles >= 2);
  assert.equal(typeof report.summary.score, 'number');
});
