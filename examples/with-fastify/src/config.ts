export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

/**
 * Defaults live inline as JSON, so this example needs no YAML document.
 *
 * @typespun
 */
export interface AppConfig {
  server: {
    /** @default "127.0.0.1" */
    host: string;
    /** @default 8080 */
    port: number;
    /**
     * Passed straight to Fastify's `bodyLimit`.
     *
     * @default 16384
     */
    bodyLimitBytes: number;
  };
  logger: {
    /** @default "info" */
    level: LogLevel;
  };
  cors: {
    /** @default ["http://localhost:5173"] */
    origins: string[];
    /** @default false */
    allowCredentials: boolean;
  };
  /**
   * @env DATABASE_URL
   * @default "postgres://localhost:5432/typespun_example"
   */
  databaseUrl: string;
  /** @secret */
  sessionSecret: string;
}
