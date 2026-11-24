import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { createFileStore, createMongoStore } from './store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  const store = process.env.MONGODB_URI ? await createMongoStore(process.env.MONGODB_URI) : await createFileStore(path.join(root, 'data/tasks.json'));
  const app = createApp(store);
  if (existsSync(path.join(root, 'dist/index.html'))) {
    app.use(express.static(path.join(root, 'dist')));
    app.get('*', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
  }
  app.listen(process.env.PORT || 3001, '127.0.0.1', () => {
    console.log(`Taskflow API: http://127.0.0.1:${process.env.PORT || 3001}`);
    console.log(`Database: ${store.mode === 'mongodb' ? 'MongoDB connected' : 'local JSON demo storage'}`);
  });
} catch (error) { console.error(`Startup failed: ${error.message}`); process.exit(1); }
