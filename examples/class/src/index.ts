import { ConfigError } from 'typespun';
import { loadConfig } from './generated/typespun.js';

try {
  loadConfig({ source: { SERVICE_HOST: '127.0.0.1' } });
} catch (error) {
  if (error instanceof ConfigError) {
    // Secret issues identify the field but never contain its received value.
    console.error(error.issues);
  }
}

const config = loadConfig({
  envFiles: [{ path: '.env', optional: true }],
  source: process.env,
});

console.log(`Connecting to ${config.host}:${config.port}`);
