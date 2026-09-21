import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { describeConfig, loadAppConfig } from './load.js';

const config = loadAppConfig();

const app = new Hono();

app.use(
  '*',
  cors({
    origin: config.cors.origins,
    credentials: config.cors.allowCredentials,
  }),
);

if (config.logLevel === 'debug' || config.logLevel === 'info') {
  app.use('*', logger());
}

app.get('/healthz', (c) => c.json({ status: 'ok', logLevel: config.logLevel }));

app.get('/config', (c) => c.json(describeConfig(config)));

app.get('/admin/secrets', (c) => {
  const header = c.req.header('authorization') ?? '';
  if (header !== `Bearer ${config.adminToken}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  return c.json({ database: config.databaseUrl });
});

const server = Bun.serve({
  hostname: config.server.host,
  port: config.server.port,
  fetch: app.fetch,
});

console.log(
  `typespun-example-with-hono listening on http://${server.hostname}:${server.port}`,
);
console.log(`  log level: ${config.logLevel}`);
console.log(`  cors origins: ${config.cors.origins.join(', ')}`);
