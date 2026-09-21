import { ConfigError } from 'typespun';
import { type Config, loadConfig } from './generated/typespun.js';

/**
 * Resolves configuration before anything else runs. A bad environment stops
 * the process here, so the server never binds a port with half a config.
 */
export function loadAppConfig(): Config {
  try {
    return loadConfig({
      envFiles: [{ path: '.env', optional: true }],
      source: process.env,
    });
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error('Configuration is invalid. The server did not start.');
    for (const issue of error.issues) {
      const where = issue.envKey === undefined ? '' : ` (${issue.envKey})`;
      console.error(`  ${issue.path}${where}: ${issue.message}`);
      if (issue.received !== undefined) {
        console.error(`    received: ${JSON.stringify(issue.received)}`);
      }
    }
    process.exit(1);
  }
}

/** Shapes the config for a response body. Secrets never leave the process. */
export function describeConfig(config: Config): Record<string, unknown> {
  return {
    server: config.server,
    logLevel: config.logLevel,
    cors: config.cors,
    databaseUrl: new URL(config.databaseUrl).host,
    adminToken: '[redacted]',
  };
}
