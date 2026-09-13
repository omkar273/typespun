# Declarations

A project has exactly one marked, exported root in its configured input file.
Nested interfaces and type declarations may be imported through the TypeScript
program.

## Interfaces

```ts
/** @typespun */
export interface AppConfig {
  server: { host: string; port: number };
  /** @default "development" */
  mode: 'development' | 'production';
  database?: { host: string; port: number };
}
```

Interfaces use JSDoc annotations. `@default` accepts JSON text.

## Schema-only classes

```ts
import { Config, Env, Secret } from 'typespun';

@Config()
export class AppConfig {
  port = 3000;

  @Env('DATABASE_URL')
  @Secret()
  databaseUrl!: string;
}
```

Decorators are inert markers. Typespun does not instantiate the class or run
constructors, getters, setters, or methods; those class members are rejected.
Initializers must be statically readable strings, finite numbers, booleans,
arrays, object literals, or string enum members. Function calls and imported
runtime values are not executed.

## Field mapping

Property paths become uppercase snake-case environment names. With
`envPrefix: "APP"`, `server.httpPort` becomes `APP_SERVER_HTTP_PORT`. `@env`
sets a complete leaf environment name. `@key` changes the JSON/YAML defaults
segment only; it does not rename the TypeScript property or environment path.

Supported leaves are `string`, `number`, `boolean`, string literal unions or
string enums, and arrays of those three primitives. See the
[annotation reference](../api/decorators-and-annotations.md) for exact forms
and the [limitations in the README](../../README.md#supported-declarations).
