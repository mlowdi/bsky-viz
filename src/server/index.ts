import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { Database } from 'bun:sqlite';
import { apiRoutes } from './routes/api.js';

export function createApp(db: Database): Hono {
  const app = new Hono();
  // Mount API routes
  app.route('/api', apiRoutes(db));
  // Serve static UI files from ui/dist
  app.use('/*', serveStatic({ root: './ui/dist' }));
  // Fallback to index.html for SPA routing
  app.get('/*', serveStatic({ root: './ui/dist', path: 'index.html' }));
  return app;
}
