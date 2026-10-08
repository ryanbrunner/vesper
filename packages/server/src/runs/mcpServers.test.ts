import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { McpServerStatus } from '@anthropic-ai/claude-agent-sdk';
import { cachedMcpServerLookup, pollUntilSettled, type McpServerInfo } from './mcpServers.js';

test('pollUntilSettled returns at once when nothing is pending', async () => {
  const statuses: McpServerStatus[] = [{ name: 'slack', status: 'connected', tools: [{ name: 'send_message' }] }];
  let calls = 0;
  const result = await pollUntilSettled(async () => {
    calls += 1;
    return statuses;
  });
  assert.deepEqual(result, statuses);
  assert.equal(calls, 1);
});

test('pollUntilSettled polls again while a server is still pending, and stops once every server has left pending', async () => {
  let calls = 0;
  const getStatus = async (): Promise<McpServerStatus[]> => {
    calls += 1;
    return calls < 3
      ? [{ name: 'slack', status: 'pending' }]
      : [{ name: 'slack', status: 'connected', tools: [{ name: 'send_message' }] }];
  };

  const result = await pollUntilSettled(getStatus, 10_000, 1);
  assert.equal(calls, 3);
  assert.equal(result[0]?.status, 'connected');
});

test('pollUntilSettled gives up at the timeout and returns whatever the last call reported, still pending', async () => {
  let calls = 0;
  const getStatus = async (): Promise<McpServerStatus[]> => {
    calls += 1;
    return [{ name: 'slack', status: 'pending' }];
  };

  const result = await pollUntilSettled(getStatus, 5, 2);
  assert.equal(result[0]?.status, 'pending');
  assert.ok(calls >= 1);
});

test('pollUntilSettled treats failed/needs-auth/disabled as settled, not pending', async () => {
  const statuses: McpServerStatus[] = [
    { name: 'slack', status: 'failed', error: 'boom' },
    { name: 'notion', status: 'needs-auth' },
  ];
  let calls = 0;
  const result = await pollUntilSettled(async () => {
    calls += 1;
    return statuses;
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, statuses);
});

test('cachedMcpServerLookup asks discoverFn once per repo path and keeps a connected answer', async () => {
  let calls = 0;
  const connected: McpServerInfo[] = [{ name: 'slack', status: 'connected', tools: ['send_message'] }];
  const lookup = cachedMcpServerLookup(async () => {
    calls += 1;
    return connected;
  });

  assert.deepEqual(await lookup('/repo/a'), connected);
  assert.deepEqual(await lookup('/repo/a'), connected);
  assert.equal(calls, 1);
});

test('cachedMcpServerLookup keeps repos separate: one repo path never sees another repo\'s servers', async () => {
  const lookup = cachedMcpServerLookup(async (repoPath) => [
    { name: repoPath === '/repo/a' ? 'slack' : 'notion', status: 'connected', tools: [] },
  ]);

  assert.equal((await lookup('/repo/a'))[0]?.name, 'slack');
  assert.equal((await lookup('/repo/b'))[0]?.name, 'notion');
});

test('cachedMcpServerLookup does not cache a result where a server is still pending, failed, or needs auth', async () => {
  let calls = 0;
  const lookup = cachedMcpServerLookup(async () => {
    calls += 1;
    return calls === 1 ? [{ name: 'slack', status: 'pending', tools: [] }] : [{ name: 'slack', status: 'connected', tools: ['send_message'] }];
  });

  const first = await lookup('/repo/a');
  assert.equal(first[0]?.status, 'pending');
  const second = await lookup('/repo/a');
  assert.equal(second[0]?.status, 'connected');
  assert.equal(calls, 2);
});

test('cachedMcpServerLookup answers [] and retries next time when discoverFn throws', async () => {
  let calls = 0;
  const lookup = cachedMcpServerLookup(async () => {
    calls += 1;
    if (calls === 1) throw new Error('CLI unreachable');
    return [{ name: 'slack', status: 'connected', tools: ['send_message'] }];
  });

  assert.deepEqual(await lookup('/repo/a'), []);
  assert.deepEqual(await lookup('/repo/a'), [{ name: 'slack', status: 'connected', tools: ['send_message'] }]);
  assert.equal(calls, 2);
});
