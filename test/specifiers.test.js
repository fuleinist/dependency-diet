import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSpecifiers, packageName, isBuiltin } from '../lib/specifiers.js';

test('extracts require() specifiers', () => {
  const specs = extractSpecifiers(`const a = require('express');\nconst b = require("lodash/get");`);
  assert.deepEqual(new Set(specs), new Set(['express', 'lodash/get']));
});

test('extracts static import specifiers', () => {
  const specs = extractSpecifiers(`import express from 'express';\nimport { x } from "@scope/pkg/sub";\nimport 'side-effect';`);
  assert.ok(specs.includes('express'));
  assert.ok(specs.includes('@scope/pkg/sub'));
  assert.ok(specs.includes('side-effect'));
});

test('extracts export-from and dynamic import specifiers', () => {
  const specs = extractSpecifiers(`export { a } from 'lib-a';\nconst m = await import('lib-b');`);
  assert.ok(specs.includes('lib-a'));
  assert.ok(specs.includes('lib-b'));
});

test('ignores obj.require and similar false patterns', () => {
  const specs = extractSpecifiers(`foo.require('nope');`);
  assert.ok(!specs.includes('nope'));
});

test('packageName maps subpaths and scopes', () => {
  assert.equal(packageName('express'), 'express');
  assert.equal(packageName('lodash/get'), 'lodash');
  assert.equal(packageName('@scope/pkg'), '@scope/pkg');
  assert.equal(packageName('@scope/pkg/deep/path'), '@scope/pkg');
});

test('packageName rejects relative, absolute, alias and builtin specifiers', () => {
  assert.equal(packageName('./local'), null);
  assert.equal(packageName('../up'), null);
  assert.equal(packageName('/abs'), null);
  assert.equal(packageName('#alias'), null);
  assert.equal(packageName('node:fs'), null);
  assert.equal(packageName('fs'), null);
});

test('isBuiltin recognizes node: prefix and bare builtins', () => {
  assert.equal(isBuiltin('node:path'), true);
  assert.equal(isBuiltin('path'), true);
  assert.equal(isBuiltin('express'), false);
});
