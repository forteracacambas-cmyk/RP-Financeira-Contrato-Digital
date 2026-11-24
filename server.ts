import express from 'express';
import { getRequestListener } from '@hono/node-server';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createApi } from './api.ts';

const app = express();
const api = createApi();
app.all('/api/{*path}', getRequestListener((request) => api.fetch(request, process.env)));

if (process.env.NODE_ENV !== 'production') {
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  const dist = path.resolve('dist');
  app.use(express.static(dist));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => console.log('RP Financeira server on port ' + port));
