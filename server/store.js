import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';

const json = { transform: (_doc, ret) => { ret.id = String(ret._id); delete ret._id; return ret; } };
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  title: { type: String, required: true, maxlength: 120 },
  description: { type: String, default: '', maxlength: 1000 },
  dueDate: { type: String, default: '' },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  completed: { type: Boolean, default: false }
}, { timestamps: true, versionKey: false, toJSON: json });
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 60 },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true, select: false }
}, { timestamps: true, versionKey: false, toJSON: json });
const sessionSchema = new mongoose.Schema({
  _id: String, userId: { type: mongoose.Schema.Types.ObjectId, required: true }, expiresAt: { type: Date, required: true, expires: 0 }
}, { versionKey: false });
const attemptSchema = new mongoose.Schema({ _id: String, count: Number, expiresAt: { type: Date, expires: 0 } }, { versionKey: false });

export async function createMongoStore(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 5 });
  const Task = mongoose.models.Task || mongoose.model('Task', schema);
  const User = mongoose.models.User || mongoose.model('User', userSchema);
  const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
  const Attempt = mongoose.models.AuthAttempt || mongoose.model('AuthAttempt', attemptSchema);
  await Promise.all([User.init(), Session.init(), Attempt.init()]);
  return {
    mode: 'mongodb',
    list: userId => Task.find({ userId }).sort({ createdAt: -1 }),
    create: (userId, task) => Task.create({ ...task, userId }),
    update: (userId, id, task) => mongoose.isValidObjectId(id) ? Task.findOneAndUpdate({ _id: id, userId }, task, { new: true, runValidators: true }) : null,
    remove: (userId, id) => mongoose.isValidObjectId(id) ? Task.findOneAndDelete({ _id: id, userId }) : null,
    findUserByEmail: email => User.findOne({ email }).select('+passwordHash'),
    createUser: user => User.create(user),
    createSession: (hash, userId, expiresAt) => Session.create({ _id: hash, userId, expiresAt }),
    findSessionUser: async hash => { const session = await Session.findOne({ _id: hash, expiresAt: { $gt: new Date() } }); return session ? User.findById(session.userId) : null; },
    deleteSession: hash => Session.deleteOne({ _id: hash }),
    countAttempt: async (key, expiresAt) => {
      let attempt;
      try { attempt = await Attempt.findOneAndUpdate({ _id: key }, { $inc: { count: 1 }, $setOnInsert: { expiresAt } }, { upsert: true, new: true }); }
      catch (error) { if (error.code !== 11000) throw error; attempt = await Attempt.findByIdAndUpdate(key, { $inc: { count: 1 } }, { new: true }); }
      return attempt.count;
    }
  };
}

export async function createFileStore(filename) {
  let state;
  try { const saved = JSON.parse(await readFile(filename, 'utf8')); state = Array.isArray(saved) ? { tasks: saved, users: [], sessions: [], attempts: {} } : saved; }
  catch (error) { if (error.code !== 'ENOENT') throw error; state = { tasks: [], users: [], sessions: [], attempts: {} }; }
  await mkdir(path.dirname(filename), { recursive: true });
  let queue = Promise.resolve();
  function mutate(fn) {
    const job = queue.then(async () => {
      const next = structuredClone(state);
      const result = fn(next);
      await writeFile(`${filename}.tmp`, JSON.stringify(next, null, 2));
      await rename(`${filename}.tmp`, filename);
      state = next;
      return result;
    });
    queue = job.catch(() => {});
    return job;
  }
  return {
    mode: 'demo', list: async userId => state.tasks.filter(t => t.userId === userId).reverse(),
    create: (userId, task) => mutate(data => { const row = { ...task, userId, id: randomUUID(), completed: false, createdAt: new Date().toISOString() }; data.tasks.push(row); return row; }),
    update: (userId, id, task) => mutate(data => { const row = data.tasks.find(t => t.id === id && t.userId === userId); return row ? Object.assign(row, task) : null; }),
    remove: (userId, id) => mutate(data => { const index = data.tasks.findIndex(t => t.id === id && t.userId === userId); return index < 0 ? null : data.tasks.splice(index, 1)[0]; }),
    findUserByEmail: async email => state.users.find(user => user.email === email),
    createUser: user => mutate(data => { if (data.users.some(row => row.email === user.email)) { const error = new Error('Email already registered.'); error.code = 11000; throw error; } const row = { ...user, id: randomUUID() }; data.users.push(row); return row; }),
    createSession: (hash, userId, expiresAt) => mutate(data => { data.sessions = data.sessions.filter(row => new Date(row.expiresAt) > new Date()); data.sessions.push({ hash, userId, expiresAt }); }),
    findSessionUser: async hash => { const session = state.sessions.find(row => row.hash === hash && new Date(row.expiresAt) > new Date()); return session ? state.users.find(user => user.id === session.userId) : null; },
    deleteSession: hash => mutate(data => { data.sessions = data.sessions.filter(row => row.hash !== hash); }),
    countAttempt: (key, expiresAt) => mutate(data => { for (const [id, row] of Object.entries(data.attempts)) if (new Date(row.expiresAt) <= new Date()) delete data.attempts[id]; const row = data.attempts[key] || { count: 0, expiresAt }; row.count++; data.attempts[key] = row; return row.count; })
  };
}
