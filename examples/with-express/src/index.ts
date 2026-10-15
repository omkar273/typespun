import { createHmac } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { describeConfig, loadAppConfig } from './load.ts';

const config = loadAppConfig();

const app = express();

app.use(
  cors({
    credentials: config.cors.allowCredentials,
    origin: config.cors.origins,
  }),
);

app.use(express.json({ limit: config.server.bodyLimitBytes }));

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', level: config.logger.level });
});

app.get('/config', (_req, res) => {
  res.json(describeConfig(config));
});

app.post('/session', (req, res) => {
  const body = req.body as { user?: unknown } | undefined;
  const user = typeof body?.user === 'string' ? body.user : 'anonymous';
  // The secret is used, never logged and never returned.
  const token = createHmac('sha256', config.sessionSecret)
    .update(user)
    .digest('hex');
  res.json({ user, token });
});

const server = app.listen(config.server.port, config.server.host, () => {
  console.log(
    `[${config.logger.level}] Server listening at http://${config.server.host}:${config.server.port}`,
  );
  console.log(
    `[${config.logger.level}] body limit ${config.server.bodyLimitBytes} bytes, cors ${config.cors.origins.join(', ')}`,
  );
});

export { app, server };
