import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'bin', 'cli.js');
const fixtures = join(here, 'fixtures');

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

test('cli --version prints version', () => {
  const r = runCli(['--version']);
  assert.equal(r.status, 0);
  assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test('cli --help prints usage', () => {
  const r = runCli(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
  assert.match(r.stdout, /dependency-diet/);
});

test('cli scan --json produces a valid report', () => {
  const r = runCli(['scan', join(fixtures, 'basic'), '--json']);
  assert.equal(r.status, 0);
  const report = JSON.parse(r.stdout);
  assert.equal(report.project.name, 'fixture-basic');
  assert.deepEqual(report.unused.map((u) => u.name), ['moment', 'uuid']);
  assert.ok(report.summary.score >= 0 && report.summary.score <= 100);
});

test('cli default command is scan', () => {
  const r = runCli([join(fixtures, 'basic'), '--json']);
  assert.equal(r.status, 0);
  const report = JSON.parse(r.stdout);
  assert.equal(report.summary.unusedCount, 2);
});

test('cli unused command reports only unused section', () => {
  const r = runCli(['unused', join(fixtures, 'basic'), '--json']);
  assert.equal(r.status, 0);
  const report = JSON.parse(r.stdout);
  assert.equal(report.summary.unusedCount, 2);
  assert.equal(report.summary.heavyCount, 0);
  assert.deepEqual(report.heavy, []);
  assert.deepEqual(report.duplicates, []);
});

test('cli duplicates command on lock fixture', () => {
  const r = runCli(['duplicates', join(fixtures, 'lock-dupes'), '--json']);
  assert.equal(r.status, 0);
  const report = JSON.parse(r.stdout);
  assert.equal(report.summary.duplicateCount, 1);
  assert.equal(report.duplicates[0].name, 'foo');
});

test('cli heavy command on heavy fixture', () => {
  const r = runCli(['heavy', join(fixtures, 'heavy-deprecated'), '--json']);
  assert.equal(r.status, 0);
  const report = JSON.parse(r.stdout);
  assert.equal(report.summary.heavyCount, 4);
  assert.ok(report.heavy.find((h) => h.name === 'request').deprecated);
});

test('cli text output renders summary line', () => {
  const r = runCli(['scan', join(fixtures, 'basic'), '--no-color']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /unused dependencies \(2\)/);
  assert.match(r.stdout, /moment/);
  assert.match(r.stdout, /\/100 — 2 unused/);
});

test('cli --ci exits 1 when findings exist', () => {
  const r = runCli(['scan', join(fixtures, 'basic'), '--json', '--ci']);
  assert.equal(r.status, 1);
});

test('cli exits 2 on missing project', () => {
  const r = runCli(['scan', join(fixtures, 'nope-not-here'), '--json']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no package\.json/);
});

test('cli exits 2 on bad flag', () => {
  const r = runCli(['--nonsense']);
  assert.equal(r.status, 2);
});

test('cli --ignore silences findings', () => {
  const r = runCli(['scan', join(fixtures, 'basic'), '--json', '--ci', '--ignore', 'moment,uuid,lodash']);
  const report = JSON.parse(r.stdout);
  assert.equal(report.unused.length, 0);
  assert.equal(report.heavy.length, 0);
  assert.equal(r.status, 0);
});
