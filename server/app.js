import express from 'express';

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
  app.use((req, res, next) => {
    const started = performance.now();
    res.on('finish', () => {
      const elapsed = (performance.now() - started).toFixed(1);
      console.log(`${new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata' })} ${req.method} ${req.path} ${res.statusCode} ${elapsed} ms`);
    });
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  const route = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', storage: store.mode }));
  app.get('/api/tasks', route(async (_req, res) => res.json(await store.list())));
  app.post('/api/tasks', route(async (req, res) => {
    let input;
    try { input = validate(req.body); } catch (error) { return res.status(400).json({ error: error.message }); }
    res.status(201).json(await store.create({ description: '', dueDate: '', priority: 'Medium', ...input, completed: false }));
  }));
  app.patch('/api/tasks/:id', route(async (req, res) => {
    let input;
    try { input = validate(req.body, true); } catch (error) { return res.status(400).json({ error: error.message }); }
    const task = await store.update(req.params.id, input);
    task ? res.json(task) : res.status(404).json({ error: 'Task not found.' });
  }));
  app.delete('/api/tasks/:id', route(async (req, res) => {
    const task = await store.remove(req.params.id);
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
