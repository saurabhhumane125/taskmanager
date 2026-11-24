import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { createMongoStore } from './store.js';
import { createApp } from './app.js';
import { randomUUID } from 'node:crypto';
import { client, signup } from './test-utils.js';

test('real MongoDB: API creates, reads, edits, completes, and deletes a task', async () => {
  assert.ok(process.env.MONGODB_URI, 'Set MONGODB_URI in .env before running the MongoDB integration test.');
  const store = await createMongoStore(process.env.MONGODB_URI);
  const server = createApp(store).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let taskId;
  const userIds = [];
  const emails = [];
  const alice = client(base), bob = client(base);
  const request = alice.request;
  try {
    assert.equal((await (await request('/health')).json()).storage, 'mongodb');
    assert.equal((await request('/tasks')).status, 401);
    for (const [agent, name] of [[alice, 'Alice'], [bob, 'Bob']]) {
      const email = `integration-${randomUUID()}@example.test`;
      emails.push(email);
      const response = await signup(agent, email, name);
      assert.equal(response.status, 201);
      const { user } = await response.json();
      userIds.push(new mongoose.Types.ObjectId(user.id));
      assert.equal(user.passwordHash, undefined);
    }
    const created = await request('/tasks', 'POST', { title: 'MongoDB connection verification', priority: 'High' });
    assert.equal(created.status, 201);
    const task = await created.json();
    taskId = task.id;
    assert.match(taskId, /^[a-f0-9]{24}$/);
    const saved = await mongoose.connection.db.collection('tasks').findOne({ _id: new mongoose.Types.ObjectId(taskId) });
    assert.equal(saved.title, task.title);
    assert.equal(String(saved.userId), String(userIds[0]));
    assert.deepEqual(await (await bob.request('/tasks')).json(), []);
    assert.equal((await bob.request(`/tasks/${taskId}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await bob.request(`/tasks/${taskId}`, 'DELETE')).status, 404);
    const changed = await request(`/tasks/${taskId}`, 'PATCH', { title: 'MongoDB verified', completed: true });
    assert.equal(changed.status, 200);
    assert.equal((await changed.json()).completed, true);
    const listed = await (await request('/tasks')).json();
    assert.equal(listed.find(row => row.id === taskId).title, 'MongoDB verified');
    assert.equal((await request(`/tasks/${taskId}`, 'DELETE')).status, 204);
    assert.equal(await mongoose.connection.db.collection('tasks').findOne({ _id: new mongoose.Types.ObjectId(taskId) }), null);
    const cookie = alice.cookie;
    assert.equal((await request('/auth/logout', 'POST')).status, 204);
    alice.cookie = cookie;
    assert.equal((await request('/auth/me')).status, 401);
    assert.equal((await request('/auth/login', 'POST', { email: emails[0], password: 'wrong-password' })).status, 401);
    assert.equal((await request('/auth/login', 'POST', { email: emails[0], password: 'A-private-test-password' })).status, 200);
    assert.equal((await (await request('/auth/me')).json()).user.id, String(userIds[0]));
    assert.equal((await signup(client(base), emails[0])).status, 409);
  } finally {
    if (userIds.length) {
      await mongoose.connection.db.collection('tasks').deleteMany({ userId: { $in: userIds } });
      await mongoose.connection.db.collection('sessions').deleteMany({ userId: { $in: userIds } });
      await mongoose.connection.db.collection('users').deleteMany({ _id: { $in: userIds } });
    }
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  }
});
