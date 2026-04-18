import { createServer, getServerPort } from '@devvit/web/server';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { api } from './routes/api';
import { cache } from './routes/cache';
import { forms } from './routes/forms';
import { createLogger } from './logging/logger';
import { menu } from './routes/menu';
import { triggers } from './routes/triggers';

const app = new Hono();
const internal = new Hono();
const logger = createLogger('server');

internal.route('/menu', menu);
internal.route('/form', forms);
internal.route('/cache', cache);
internal.route('/triggers', triggers);

app.route('/api', api);
app.route('/internal', internal);

const port = getServerPort();

logger.info('Registered server routes', {
  publicRoutes: ['/api'],
  internalRoutes: [
    '/internal/menu',
    '/internal/form',
    '/internal/cache',
    '/internal/triggers',
  ],
});
logger.info('Starting server', { port });

serve({
  fetch: app.fetch,
  createServer,
  port,
});
