import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';
import { createFileStore } from './store.js';

test('API validates inputs and persists the complete task lifecycle', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'taskflow-test-'));
  const filename = path.join(directory, 'tasks.json');
  const store = await createFileStore(filename);
  const server = createApp(store).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (url, method = 'GET', body) => fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    assert.equal((await (await request('/health')).json()).storage, 'demo');
    assert.deepEqual(await (await request('/tasks')).json(), []);
    for (const body of [{ title: ' ' }, { title: 'x', priority: 'Urgent' }, { title: 'x', dueDate: '2026-02-30' }, { title: 'x', completed: 'yes' }]) {
      assert.equal((await request('/tasks', 'POST', body)).status, 400);
    }
    const response = await request('/tasks', 'POST', { title: '  Prepare presentation  ', description: 'Demonstrate MERN', priority: 'High', dueDate: '2026-11-23', id: 'injected' });
    assert.equal(response.status, 201);
    const task = await response.json();
    assert.equal(task.title, 'Prepare presentation');
    assert.notEqual(task.id, 'injected');
    assert.equal(task.completed, false);
    assert.equal(task.priority, 'High');
    assert.equal((await createFileStore(filename)).mode, 'demo');
    assert.equal((await (await createFileStore(filename)).list())[0].title, task.title);
    const updated = await (await request(`/tasks/${task.id}`, 'PATCH', { completed: true, title: 'Updated title', id: 'overwrite' })).json();
    assert.equal(updated.completed, true);
    assert.equal(updated.id, task.id);
    assert.equal(updated.description, 'Demonstrate MERN');
    assert.equal((await request(`/tasks/${task.id}`, 'PATCH', { title: '' })).status, 400);
    assert.equal((await request('/tasks/missing', 'PATCH', { completed: true })).status, 404);
    assert.equal((await request('/tasks/missing', 'DELETE')).status, 404);
    const persisted = await (await createFileStore(filename)).list();
    assert.equal(persisted[0].completed, true);
    assert.equal((await request(`/tasks/${task.id}`, 'DELETE')).status, 204);
    assert.deepEqual(await (await request('/tasks')).json(), []);
    assert.deepEqual(await (await createFileStore(filename)).list(), []);
    assert.equal((await request('/unknown')).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('concurrent writes retain all records', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'taskflow-test-'));
  try {
    const filename = path.join(directory, 'tasks.json');
    const store = await createFileStore(filename);
    await Promise.all(Array.from({ length: 12 }, (_, index) => store.create({ title: `Task ${index}` })));
    assert.equal((await store.list()).length, 12);
    assert.equal((await (await createFileStore(filename)).list()).length, 12);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
