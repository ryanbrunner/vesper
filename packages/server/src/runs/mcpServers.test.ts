import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { McpServerStatus } from '@anthropic-ai/claude-agent-sdk';
import { cachedMcpServerLookup, pollUntilSettled, type McpServerInfo } from './mcpServers.js';

test('pollUntilSettled still polls a second time even when the first answer already looks settled', async () => {
  const statuses: McpServerStatus[] = [{ name: 'slack', status: 'connected', tools: [{ name: 'send_message' }] }];
  let calls = 0;
  const result = await pollUntilSettled(async () => {
    calls += 1;
    return statuses;
  }, 10_000, 1);
  // A lone settled-looking answer isn't trusted on its own: a server that
  // hasn't loaded its config yet simply doesn't appear at all, so this must
  // see the same set twice before it stops.
  assert.equal(calls, 2);
  assert.deepEqual(result, statuses);
});

test('pollUntilSettled keeps polling while a server is still pending, and stops once two consecutive answers agree and nothing is pending', async () => {
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

test('pollUntilSettled keeps polling while a server is simply missing from the answer, not just while one is pending', async () => {
  let calls = 0;
  const getStatus = async (): Promise<McpServerStatus[]> => {
    calls += 1;
    // The first call reports nothing at all — a connector whose config
    // hasn't loaded yet, not a repo with zero MCP servers.
    if (calls === 1) return [];
    return [{ name: 'notion', status: 'connected', tools: [{ name: 'search' }] }];
  };

  const result = await pollUntilSettled(getStatus, 10_000, 1);
  assert.equal(calls, 3);
  assert.deepEqual(result, [{ name: 'notion', status: 'connected', tools: [{ name: 'search' }] }]);
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

test('pollUntilSettled treats failed/needs-auth/disabled as not-pending, once the set of names holds steady', async () => {
  const statuses: McpServerStatus[] = [
    { name: 'slack', status: 'failed', error: 'boom' },
    { name: 'notion', status: 'needs-auth' },
  ];
  let calls = 0;
  const result = await pollUntilSettled(async () => {
    calls += 1;
    return statuses;
  }, 10_000, 1);
  assert.equal(calls, 2);
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

test('cachedMcpServerLookup does not cache a result where a server is still pending', async () => {
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

test('cachedMcpServerLookup does not cache an empty answer, since a server may simply not have loaded yet', async () => {
  let calls = 0;
  const lookup = cachedMcpServerLookup(async () => {
    calls += 1;
    return calls === 1 ? [] : [{ name: 'slack', status: 'connected', tools: ['send_message'] }];
  });

  assert.deepEqual(await lookup('/repo/a'), []);
  assert.deepEqual(await lookup('/repo/a'), [{ name: 'slack', status: 'connected', tools: ['send_message'] }]);
  assert.equal(calls, 2);
});

test('cachedMcpServerLookup does cache a failed/needs-auth server, since that state does not resolve itself on a later poll', async () => {
  let calls = 0;
  const stuck: McpServerInfo[] = [{ name: 'supercast', status: 'needs-auth', tools: [] }];
  const lookup = cachedMcpServerLookup(async () => {
    calls += 1;
    return stuck;
  });

  assert.deepEqual(await lookup('/repo/a'), stuck);
  assert.deepEqual(await lookup('/repo/a'), stuck);
  assert.equal(calls, 1);
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
