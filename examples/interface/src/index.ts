import { loadConfig } from './generated/typespun.js';

const config = loadConfig({
  envFiles: [{ path: '.env', optional: true }],
  source: process.env,
  overrides: {
    server: { port: 4000 },
  },
});

console.log(
  `Listening on ${config.server.host}:${config.server.port} (${config.stage})`,
);
