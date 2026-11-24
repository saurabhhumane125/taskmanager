import { createApp } from './app.js';
import { createMongoStore } from './store.js';

// Cache initialization so concurrent requests share one MongoDB connection pool.
export function createServerlessHandler({ connectStore = createMongoStore, getUri = () => process.env.MONGODB_URI } = {}) {
  let appPromise;
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const uri = getUri();
    if (!uri) return res.status(503).json({ error: 'Database is not configured. Add MONGODB_URI from MongoDB Atlas in Vercel environment variables, then redeploy.' });
    let app;
    try {
      if (!appPromise) {
        appPromise = Promise.resolve().then(() => connectStore(uri)).then(createApp).catch(error => {
          appPromise = undefined;
          throw error;
        });
      }
      app = await appPromise;
    } catch {
      // Never include connection strings or database credentials in logs/responses.
      console.error('MongoDB connection failed. Check MONGODB_URI and Atlas network access.');
      return res.status(503).json({ error: 'Could not connect to MongoDB Atlas. Check the database credentials and Atlas network access settings.' });
    }
    return app(req, res);
  };
}
