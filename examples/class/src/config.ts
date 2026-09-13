import { Config, Env, Secret } from 'typespun';

@Config()
export class AppConfig {
  port = 3000;

  @Env('SERVICE_HOST')
  host = '127.0.0.1';

  @Secret()
  token!: string;
}
