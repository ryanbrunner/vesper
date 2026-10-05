import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeToolUsage } from '@vesper/shared';

function assistantMessage(toolNames: string[], usage?: { input_tokens: number; output_tokens: number }) {
  return {
    type: 'assistant',
    message: {
      content: toolNames.map((name) => ({ type: 'tool_use', name, input: {} })),
      usage,
    },
  };
}

test('summarizeToolUsage groups mcp__<server>__<tool> calls by server, with a known label', () => {
  const usage = summarizeToolUsage([
    assistantMessage(['mcp__slack__post_message'], { input_tokens: 100, output_tokens: 20 }),
    assistantMessage(['mcp__slack__list_channels'], { input_tokens: 50, output_tokens: 10 }),
  ]);

  assert.deepEqual(usage, [{ key: 'slack', label: 'Slack', calls: 2, tokens: 180 }]);
});

test('summarizeToolUsage groups WebSearch under a "Web search" label', () => {
  const usage = summarizeToolUsage([assistantMessage(['WebSearch'], { input_tokens: 10, output_tokens: 5 })]);

  assert.deepEqual(usage, [{ key: 'web_search', label: 'Web search', calls: 1, tokens: 15 }]);
});

test('summarizeToolUsage excludes local tools entirely', () => {
  const usage = summarizeToolUsage([
    assistantMessage(['Bash', 'Read', 'Edit', 'Write', 'Grep', 'Glob', 'Task', 'TodoWrite'], {
      input_tokens: 500,
      output_tokens: 100,
    }),
  ]);

  assert.deepEqual(usage, []);
});

test('summarizeToolUsage falls back to a title-cased label for an unknown MCP server slug', () => {
  const usage = summarizeToolUsage([assistantMessage(['mcp__salesforce__find_lead'], { input_tokens: 10, output_tokens: 5 })]);

  assert.deepEqual(usage, [{ key: 'salesforce', label: 'Salesforce', calls: 1, tokens: 15 }]);
});

test('summarizeToolUsage double-counts a message\'s tokens into every integration it touches', () => {
  const usage = summarizeToolUsage([
    assistantMessage(['mcp__slack__post_message', 'mcp__notion__search'], { input_tokens: 100, output_tokens: 20 }),
  ]);

  const byKey = new Map(usage.map((u) => [u.key, u]));
  assert.equal(byKey.get('slack')?.tokens, 120);
  assert.equal(byKey.get('notion')?.tokens, 120);
  assert.equal(byKey.get('slack')?.calls, 1);
  assert.equal(byKey.get('notion')?.calls, 1);
});

test('summarizeToolUsage returns an empty list for a transcript with no tool calls, or none at all', () => {
  assert.deepEqual(summarizeToolUsage([{ type: 'assistant', message: { content: 'just text' } }]), []);
  assert.deepEqual(summarizeToolUsage(null), []);
  assert.deepEqual(summarizeToolUsage(undefined), []);
});
