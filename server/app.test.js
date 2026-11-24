import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createFileStore } from './store.js';
import { startStore, client, signup } from './test-utils.js';
import { tokenHash } from './auth.js';

test('API validates inputs and persists the complete task lifecycle', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'taskflow-test-'));
  const filename = path.join(directory, 'tasks.json');
  const store = await createFileStore(filename);
  const running = await startStore(store);
  const agent = client(running.base);
  const request = agent.request;
  try {
    assert.equal((await (await request('/health')).json()).storage, 'demo');
    assert.equal((await request('/tasks')).status, 401);
    const registration = await signup(agent);
    assert.equal(registration.status, 201);
    const { user } = await registration.json();
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
    assert.equal((await (await createFileStore(filename)).list(user.id))[0].title, task.title);
    const updated = await (await request(`/tasks/${task.id}`, 'PATCH', { completed: true, title: 'Updated title', id: 'overwrite' })).json();
    assert.equal(updated.completed, true);
    assert.equal(updated.id, task.id);
    assert.equal(updated.description, 'Demonstrate MERN');
    assert.equal((await request(`/tasks/${task.id}`, 'PATCH', { title: '' })).status, 400);
    assert.equal((await request('/tasks/missing', 'PATCH', { completed: true })).status, 404);
    assert.equal((await request('/tasks/missing', 'DELETE')).status, 404);
    const persisted = await (await createFileStore(filename)).list(user.id);
    assert.equal(persisted[0].completed, true);
    assert.equal((await request(`/tasks/${task.id}`, 'DELETE')).status, 204);
    assert.deepEqual(await (await request('/tasks')).json(), []);
    assert.deepEqual(await (await createFileStore(filename)).list(user.id), []);
    assert.equal((await request('/unknown')).status, 404);
  } finally {
    await running.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('concurrent writes retain all records', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'taskflow-test-'));
  try {
    const filename = path.join(directory, 'tasks.json');
    const store = await createFileStore(filename);
    await Promise.all(Array.from({ length: 12 }, (_, index) => store.create('owner', { title: `Task ${index}` })));
    assert.equal((await store.list('owner')).length, 12);
    assert.equal((await (await createFileStore(filename)).list('owner')).length, 12);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('accounts isolate all task operations and ownership cannot be spoofed', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'taskflow-test-'));
  const store = await createFileStore(path.join(directory, 'tasks.json'));
  const running = await startStore(store);
  const alice = client(running.base), bob = client(running.base);
  try {
    const a = await (await signup(alice)).json();
    const b = await (await signup(bob, 'bob@example.test', 'Bob')).json();
    const task = await (await alice.request('/tasks', 'POST', { title: 'Alice only', userId: b.user.id })).json();
    assert.equal(task.userId, a.user.id);
    assert.deepEqual(await (await bob.request('/tasks')).json(), []);
    assert.equal((await bob.request(`/tasks/${task.id}`, 'PATCH', { title: 'Stolen' })).status, 404);
    assert.equal((await bob.request(`/tasks/${task.id}`, 'DELETE')).status, 404);
    await alice.request(`/tasks/${task.id}`, 'PATCH', { userId: b.user.id, title: 'Still Alice' });
    assert.deepEqual(await (await bob.request(`/tasks?userId=${a.user.id}`)).json(), []);
    const own = await (await alice.request('/tasks')).json();
    assert.equal(own[0].userId, a.user.id);
    assert.equal(own[0].title, 'Still Alice');
    const outsider = client(running.base);
    for (const [method, url, body] of [['GET', '/tasks'], ['POST', '/tasks', { title: 'Anonymous' }], ['PATCH', `/tasks/${task.id}`, { completed: true }], ['DELETE', `/tasks/${task.id}`]]) assert.equal((await outsider.request(url, method, body)).status, 401);
  } finally { await running.close(); await rm(directory, { recursive: true, force: true }); }
});

test('signup, login, persisted sessions, logout, validation, CSRF, and expiration', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'taskflow-test-'));
  const filename = path.join(directory, 'tasks.json');
  const store = await createFileStore(filename);
  const running = await startStore(store);
  const agent = client(running.base);
  try {
    assert.equal((await signup(agent, 'bad-address')).status, 400);
    assert.equal((await agent.request('/auth/signup', 'POST', { name: 'Alice', email: 'alice@example.test', password: 'short' })).status, 400);
    assert.equal((await agent.request('/auth/signup', 'POST', { name: 'Alice', email: 'alice@example.test', password: 'long-enough' }, { 'X-Taskflow-Request': '' })).status, 403);
    const created = await signup(agent, 'ALICE@EXAMPLE.TEST');
    assert.match(created.headers.get('set-cookie'), /HttpOnly/);
    assert.match(created.headers.get('set-cookie'), /SameSite=Lax/);
    assert.match(created.headers.get('set-cookie'), /Max-Age=604800/);
    const body = await created.json();
    assert.equal(body.user.email, 'alice@example.test');
    assert.equal(body.user.passwordHash, undefined);
    const originalCookie = agent.cookie;
    assert.equal((await (await agent.request('/auth/me')).json()).user.id, body.user.id);
    const persisted = await createFileStore(filename);
    assert.equal((await persisted.findSessionUser(tokenHash(originalCookie.split('=')[1]))).id, body.user.id);
    const raw = JSON.parse(await readFile(filename, 'utf8'));
    assert.match(raw.users[0].passwordHash, /^scrypt:/);
    assert.notEqual(raw.sessions[0].hash, originalCookie.split('=')[1]);
    assert.ok(!JSON.stringify(raw).includes('A-private-test-password'));
    assert.equal((await signup(client(running.base), 'alice@example.test')).status, 409);
    assert.equal((await agent.request('/tasks', 'POST', { title: 'Cross site' }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await agent.request('/auth/logout', 'POST')).status, 204);
    agent.cookie = originalCookie;
    assert.equal((await agent.request('/auth/me')).status, 401);
    assert.equal((await agent.request('/auth/login', 'POST', { email: 'alice@example.test', password: 'wrong-password' })).status, 401);
    assert.equal((await agent.request('/auth/login', 'POST', { email: 'missing@example.test', password: 'wrong-password' })).status, 401);
    assert.equal((await agent.request('/auth/login', 'POST', { email: ' ALICE@EXAMPLE.TEST ', password: 'A-private-test-password' })).status, 200);
    assert.notEqual(agent.cookie, originalCookie);
    const expiredToken = 'a'.repeat(64);
    await store.createSession(tokenHash(expiredToken), body.user.id, new Date(Date.now() - 1000));
    agent.cookie = `taskflow_session=${expiredToken}`;
    assert.equal((await agent.request('/tasks')).status, 401);
    agent.cookie = 'taskflow_session=forged';
    assert.equal((await agent.request('/tasks')).status, 401);
    const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
    const key = tokenHash(`/api/auth/login:limited@example.test:${bucket}`);
    for (let i = 0; i < 12; i++) await store.countAttempt(key, new Date(Date.now() + 900000));
    const limited = await agent.request('/auth/login', 'POST', { email: 'limited@example.test', password: 'bad-password' });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
  } finally { await running.close(); await rm(directory, { recursive: true, force: true }); }
});

test('legacy shared tasks are retained but never assigned to a new account', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'taskflow-test-'));
  const filename = path.join(directory, 'tasks.json');
  try {
    await writeFile(filename, JSON.stringify([{ id: 'old-task', title: 'Old shared task' }]));
    const store = await createFileStore(filename);
    assert.deepEqual(await store.list('new-user'), []);
    await store.create('new-user', { title: 'Private task' });
    const saved = JSON.parse(await readFile(filename, 'utf8'));
    assert.equal(saved.tasks[0].id, 'old-task');
    assert.equal((await store.list('new-user')).length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
