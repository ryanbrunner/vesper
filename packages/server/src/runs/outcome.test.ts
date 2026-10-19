import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseOutcome } from './outcome.js';

test('no marker is a success, text untouched', () => {
  assert.deepEqual(parseOutcome('all done'), { text: 'all done', failure: null });
});

test('SUCCESS marker is stripped', () => {
  assert.deepEqual(parseOutcome('Fixed it.\n\nVESPER_OUTCOME: SUCCESS'), { text: 'Fixed it.', failure: null });
});

test('FAILURE marker carries its reason and is stripped', () => {
  const r = parseOutcome('I tried.\nVESPER_OUTCOME: FAILURE: the linear tool was denied');
  assert.equal(r.failure, 'the linear tool was denied');
  assert.equal(r.text, 'I tried.');
});

test('markdown-wrapped markers and a bare FAILURE still count', () => {
  assert.equal(parseOutcome('x\n`VESPER_OUTCOME: FAILURE - no repo access`').failure, 'no repo access');
  assert.ok(parseOutcome('x\n**VESPER_OUTCOME: FAILURE**').failure);
});

test('the last marker wins', () => {
  assert.equal(parseOutcome('VESPER_OUTCOME: FAILURE: a\nretried\nVESPER_OUTCOME: SUCCESS').failure, null);
});
