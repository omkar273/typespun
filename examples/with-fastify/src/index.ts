import { createHmac } from 'node:crypto';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { describeConfig, loadAppConfig } from './load.ts';

const config = loadAppConfig();

const app = Fastify({
  bodyLimit: config.server.bodyLimitBytes,
  logger: { level: config.logger.level },
});

await app.register(cors, {
  credentials: config.cors.allowCredentials,
  origin: config.cors.origins,
});

app.get('/healthz', () => ({ status: 'ok', level: config.logger.level }));

app.get('/config', () => describeConfig(config));

app.post('/session', (request) => {
  const body = request.body as { user?: unknown } | undefined;
  const user = typeof body?.user === 'string' ? body.user : 'anonymous';
  // The secret is used, never logged and never returned.
  const token = createHmac('sha256', config.sessionSecret)
    .update(user)
    .digest('hex');
  return { user, token };
});

await app.listen({ host: config.server.host, port: config.server.port });
app.log.info(
  `body limit ${config.server.bodyLimitBytes} bytes, cors ${config.cors.origins.join(', ')}`,
);
