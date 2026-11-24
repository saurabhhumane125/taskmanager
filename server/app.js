import express from 'express';
import { hashPassword, verifyPassword, tokenHash, newToken, publicUser, readSession, sessionOptions, SESSION_MS } from './auth.js';

function validate(body, partial = false) {
  const result = {};
  if (!partial || 'title' in body) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 120) throw new Error('Enter a task title between 1 and 120 characters.');
    result.title = body.title.trim();
  }
  for (const key of ['description', 'dueDate', 'priority', 'completed']) {
    if (!(key in body)) continue;
    const value = body[key];
    if (key === 'description' && (typeof value !== 'string' || value.length > 1000)) throw new Error('Description must be under 1,000 characters.');
    if (key === 'priority' && !['Low', 'Medium', 'High'].includes(value)) throw new Error('Choose a valid priority.');
    if (key === 'completed' && typeof value !== 'boolean') throw new Error('Completed must be true or false.');
    if (key === 'dueDate' && (typeof value !== 'string' || (value !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)))) throw new Error('Choose a valid due date.');
    result[key] = value;
  }
  return result;
}
export function createApp(store) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use((req, res, next) => {
    const started = performance.now();
    const requestPath = req.path;
    res.on('finish', () => {
      const elapsed = (performance.now() - started).toFixed(1);
      console.log(`${new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata' })} ${req.method} ${requestPath} ${res.statusCode} ${elapsed} ms`);
    });
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  const route = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', storage: store.mode }));
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (req.get('X-Taskflow-Request') !== '1' || req.get('Sec-Fetch-Site') === 'cross-site')) return res.status(403).json({ error: 'Request blocked. Refresh the page and try again.' });
    next();
  });
  const userFor = req => { const token = readSession(req); return token ? store.findSessionUser(tokenHash(token)) : null; };
  async function startSession(req, res, user) {
    const previous = readSession(req);
    if (previous) await store.deleteSession(tokenHash(previous));
    const token = newToken();
    await store.createSession(tokenHash(token), String(user.id || user._id), new Date(Date.now() + SESSION_MS));
    res.cookie('taskflow_session', token, sessionOptions());
  }
  async function authLimit(req, res) {
    const window = 15 * 60 * 1000;
    const bucket = Math.floor(Date.now() / window);
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const ip = process.env.VERCEL === '1' ? (req.get('x-forwarded-for') || req.ip).split(',')[0].trim() : req.ip;
    // Shared in the database so limits work across Vercel function instances.
    const expiresAt = new Date((bucket + 1) * window);
    const accountCount = await store.countAttempt(tokenHash(`${req.path}:${email}:${bucket}`), expiresAt);
    const ipCount = await store.countAttempt(tokenHash(`${req.path}:ip:${ip}:${bucket}`), expiresAt);
    if (accountCount <= 12 && ipCount <= 60) return true;
    res.setHeader('Retry-After', Math.ceil(((bucket + 1) * window - Date.now()) / 1000));
    res.status(429).json({ error: 'Too many attempts. Please try again in 15 minutes.' });
    return false;
  }
  app.post('/api/auth/signup', route(async (req, res) => {
    const { name, email, password } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 60 || typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== 'string' || password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Enter your name, a valid email, and a password with 8–128 characters.' });
    if (!await authLimit(req, res)) return;
    try {
      const user = await store.createUser({ name: name.trim(), email: email.trim().toLowerCase(), passwordHash: await hashPassword(password) });
      await startSession(req, res, user);
      res.status(201).json({ user: publicUser(user) });
    } catch (error) { if (error.code === 11000) return res.status(409).json({ error: 'This email is already registered. Please log in.' }); throw error; }
  }));
  app.post('/api/auth/login', route(async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 128) return res.status(400).json({ error: 'Enter your email and password.' });
    if (!await authLimit(req, res)) return;
    const user = await store.findUserByEmail(email.trim().toLowerCase());
    // Spend the same derivation work even when the account is unknown.
    const encoded = user?.passwordHash || `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;
    const valid = await verifyPassword(password, encoded);
    if (!user || !valid) return res.status(401).json({ error: 'Email or password is incorrect.' });
    await startSession(req, res, user);
    res.json({ user: publicUser(user) });
  }));
  app.get('/api/auth/me', route(async (req, res) => {
    const user = await userFor(req);
    user ? res.json({ user: publicUser(user) }) : res.status(401).json({ error: 'Please log in to continue.' });
  }));
  app.post('/api/auth/logout', route(async (req, res) => {
    const token = readSession(req);
    if (token) await store.deleteSession(tokenHash(token));
    const { maxAge, ...options } = sessionOptions();
    res.clearCookie('taskflow_session', options);
    res.status(204).end();
  }));
  app.use('/api/tasks', (req, res, next) => {
    Promise.resolve(userFor(req)).then(user => { if (!user) return res.status(401).json({ error: 'Your session has expired. Please log in again.' }); req.userId = String(user.id || user._id); next(); }).catch(next);
  });
  app.get('/api/tasks', route(async (req, res) => res.json(await store.list(req.userId))));
  app.post('/api/tasks', route(async (req, res) => {
    let input;
    try { input = validate(req.body); } catch (error) { return res.status(400).json({ error: error.message }); }
    res.status(201).json(await store.create(req.userId, { description: '', dueDate: '', priority: 'Medium', ...input, completed: false }));
  }));
  app.patch('/api/tasks/:id', route(async (req, res) => {
    let input;
    try { input = validate(req.body, true); } catch (error) { return res.status(400).json({ error: error.message }); }
    const task = await store.update(req.userId, req.params.id, input);
    task ? res.json(task) : res.status(404).json({ error: 'Task not found.' });
  }));
  app.delete('/api/tasks/:id', route(async (req, res) => {
    const task = await store.remove(req.userId, req.params.id);
    task ? res.status(204).end() : res.status(404).json({ error: 'Task not found.' });
  }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
    console.error(error.message);
    res.status(500).json({ error: 'Unable to save your changes. Please try again.' });
  });
  return app;
}
