export enum Stage {
  Development = 'development',
  Production = 'production',
}

/** @typespun */
export interface AppConfig {
  server: {
    host: string;
    port: number;
  };
  stage: Stage;
  origins: string[];
  /** @env DATABASE_URL */
  databaseUrl?: string;
}
