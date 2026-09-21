import { ConfigError, formatConfigError } from 'typespun';
import { type Config, loadConfig } from './generated/typespun.ts';

/**
 * Resolves configuration before Fastify is constructed. A bad environment
 * stops the process here, so the server never binds a port with half a config.
 */
export function loadAppConfig(): Config {
  try {
    return loadConfig({
      envFiles: [{ path: '.env', optional: true }],
      source: process.env,
    });
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(
      formatConfigError(error, {
        heading: 'Configuration is invalid. The server did not start.',
      }),
    );
    process.exit(1);
  }
}

/** Shapes the config for a response body. Secrets never leave the process. */
export function describeConfig(config: Config): Record<string, unknown> {
  return {
    server: config.server,
    logger: config.logger,
    cors: config.cors,
    databaseUrl: new URL(config.databaseUrl).host,
    sessionSecret: '[redacted]',
  };
}
