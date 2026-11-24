import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServerlessHandler } from './serverless.js';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createFileStore } from './store.js';
import { client, signup } from './test-utils.js';

async function withServer(handler, verify) {
  const app = express();
  app.use(handler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await verify(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('Vercel handler reports missing configuration without attempting a database connection', async () => {
  const handler = createServerlessHandler({ getUri: () => '', connectStore: () => { throw new Error('Must not run'); } });
  await withServer(handler, async base => {
    const response = await fetch(`${base}/api/tasks`);
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /Add MONGODB_URI/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
});

test('Vercel handler shares initialization across requests and dispatches task routes', async () => {
  let connections = 0;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'taskflow-serverless-'));
  const store = await createFileStore(path.join(directory, 'tasks.json'));
  const handler = createServerlessHandler({ getUri: () => 'test-uri', connectStore: async () => {
    connections++;
    await new Promise(resolve => setTimeout(resolve, 15));
    return { ...store, mode: 'mongodb' };
  } });
  await withServer(handler, async base => {
    const responses = await Promise.all([fetch(`${base}/api/health`), fetch(`${base}/api/tasks`)]);
    assert.equal(connections, 1);
    assert.equal((await responses[0].json()).storage, 'mongodb');
    assert.equal(responses[1].status, 401);
    const agent = client(`${base}/api`);
    assert.equal((await signup(agent)).status, 201);
    const created = await agent.request('/tasks', 'POST', { title: 'Hosted task' });
    assert.equal(created.status, 201);
    const task = await created.json();
    assert.equal(task.title, 'Hosted task');
    const updated = await agent.request(`/tasks/${task.id}`, 'PATCH', { completed: true });
    assert.equal((await updated.json()).completed, true);
    assert.equal((await agent.request(`/tasks/${task.id}`, 'DELETE')).status, 204);
    assert.equal(connections, 1);
  });
  await rm(directory, { recursive: true, force: true });
});

test('Vercel handler retries failed initialization without leaking connection credentials', async () => {
  let attempts = 0;
  const handler = createServerlessHandler({ getUri: () => 'secret-uri', connectStore: async () => {
    if (++attempts === 1) throw new Error('secret-uri');
    return { mode: 'mongodb', list: async () => [] };
  } });
  await withServer(handler, async base => {
    const failed = await fetch(`${base}/api/tasks`);
    assert.equal(failed.status, 503);
    assert.doesNotMatch(await failed.text(), /secret-uri/);
    const recovered = await fetch(`${base}/api/health`);
    assert.equal(recovered.status, 200);
    assert.equal(attempts, 2);
  });
});
