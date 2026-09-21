export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** @typespun */
export interface AppConfig {
  server: {
    host: string;
    port: number;
  };
  logLevel: LogLevel;
  cors: {
    origins: string[];
    allowCredentials: boolean;
  };
  /** @env DATABASE_URL */
  databaseUrl: string;
  /** @secret */
  adminToken: string;
}
