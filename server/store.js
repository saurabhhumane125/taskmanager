import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 120 },
  description: { type: String, default: '', maxlength: 1000 },
  dueDate: { type: String, default: '' },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  completed: { type: Boolean, default: false }
}, { timestamps: true, versionKey: false, toJSON: { transform: (_doc, ret) => { ret.id = String(ret._id); delete ret._id; return ret; } } });

export async function createMongoStore(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 5 });
  const Task = mongoose.models.Task || mongoose.model('Task', schema);
  return {
    mode: 'mongodb',
    list: () => Task.find().sort({ createdAt: -1 }),
    create: task => Task.create(task),
    update: (id, task) => mongoose.isValidObjectId(id) ? Task.findByIdAndUpdate(id, task, { new: true, runValidators: true }) : null,
    remove: id => mongoose.isValidObjectId(id) ? Task.findByIdAndDelete(id) : null
  };
}

export async function createFileStore(filename) {
  let tasks;
  try { tasks = JSON.parse(await readFile(filename, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; tasks = []; }
  await mkdir(path.dirname(filename), { recursive: true });
  let queue = Promise.resolve();
  function mutate(fn) {
    const job = queue.then(async () => {
      const next = structuredClone(tasks);
      const result = fn(next);
      await writeFile(`${filename}.tmp`, JSON.stringify(next, null, 2));
      await rename(`${filename}.tmp`, filename);
      tasks = next;
      return result;
    });
    queue = job.catch(() => {});
    return job;
  }
  return {
    mode: 'demo', list: async () => [...tasks].reverse(),
    create: task => mutate(list => { const row = { ...task, id: randomUUID(), completed: false, createdAt: new Date().toISOString() }; list.push(row); return row; }),
    update: (id, task) => mutate(list => { const row = list.find(t => t.id === id); return row ? Object.assign(row, task) : null; }),
    remove: id => mutate(list => { const index = list.findIndex(t => t.id === id); return index < 0 ? null : list.splice(index, 1)[0]; })
  };
}
