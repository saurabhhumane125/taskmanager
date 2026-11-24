import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { createMongoStore } from './store.js';
import { createApp } from './app.js';

test('real MongoDB: API creates, reads, edits, completes, and deletes a task', async () => {
  assert.ok(process.env.MONGODB_URI, 'Set MONGODB_URI in .env before running the MongoDB integration test.');
  const store = await createMongoStore(process.env.MONGODB_URI);
  const server = createApp(store).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let taskId;
  const request = (route, method = 'GET', body) => fetch(base + route, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    assert.equal((await (await request('/health')).json()).storage, 'mongodb');
    const created = await request('/tasks', 'POST', { title: 'MongoDB connection verification', priority: 'High' });
    assert.equal(created.status, 201);
    const task = await created.json();
    taskId = task.id;
    assert.match(taskId, /^[a-f0-9]{24}$/);
    const saved = await mongoose.connection.db.collection('tasks').findOne({ _id: new mongoose.Types.ObjectId(taskId) });
    assert.equal(saved.title, task.title);
    const changed = await request(`/tasks/${taskId}`, 'PATCH', { title: 'MongoDB verified', completed: true });
    assert.equal(changed.status, 200);
    assert.equal((await changed.json()).completed, true);
    const listed = await (await request('/tasks')).json();
    assert.equal(listed.find(row => row.id === taskId).title, 'MongoDB verified');
    assert.equal((await request(`/tasks/${taskId}`, 'DELETE')).status, 204);
    assert.equal(await mongoose.connection.db.collection('tasks').findOne({ _id: new mongoose.Types.ObjectId(taskId) }), null);
  } finally {
    if (taskId) await store.remove(taskId);
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  }
});
