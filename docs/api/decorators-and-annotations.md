# Decorators and annotations

Decorators are imported from `typespun`. They return inert decorator functions;
the code generator reads their meaning statically and the runtime does not
store metadata.

| Class decorator  | Interface JSDoc   | Signature                                                             | Meaning                                            |
| ---------------- | ----------------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| `Config()`       | `@typespun`       | `Config(): (...args: readonly unknown[]) => undefined`                | Marks the one exported root.                       |
| `Default(value)` | `@default <JSON>` | `Default(value: unknown): (...args: readonly unknown[]) => undefined` | Supplies an inline default.                        |
| `Env(name)`      | `@env NAME`       | `Env(name: string): (...args: readonly unknown[]) => undefined`       | Replaces a leaf’s complete environment name.       |
| `Key(name)`      | `@key name`       | `Key(name: string): (...args: readonly unknown[]) => undefined`       | Replaces one JSON/YAML defaults path segment.      |
| `Secret()`       | `@secret`         | `Secret(): (...args: readonly unknown[]) => undefined`                | Redacts Typespun diagnostics for a leaf or branch. |
| `Ignore()`       | `@ignore`         | `Ignore(): (...args: readonly unknown[]) => undefined`                | Excludes a property or branch.                     |

```ts
import { Config, Default, Env, Ignore, Key, Secret } from 'typespun';

@Config()
export class AppConfig {
  @Default(3000)
  port!: number;

  @Env('DATABASE_URL')
  @Key('database_url')
  @Secret()
  databaseUrl!: string;

  @Ignore()
  label = 'not configuration';
}
```

Decorator arguments must be statically supported literals. `Env` and `Key`
require one string. Environment names must match
`[A-Za-z_][A-Za-z0-9_]*`. Keys must be one nonempty safe segment without a dot.

JSDoc `@default` accepts JSON text. Class defaults accept strings, finite
numbers, booleans, supported arrays and object literals, negative numeric
literals, or string enum members. Expressions and user modules are not
executed. A class field initializer acts as a default unless `@Default`
supplies one. Defaults must match the declared leaf type.

`@Env` applies only to leaves. `@Secret` on an object applies to every included
descendant. `@Key` affects compiled defaults only; environment names still come
from TypeScript property paths unless `@Env` is present.

JSDoc annotations are also accepted on class declarations and fields, although
the decorator form is the intended class style. TypeScript decorators cannot be
applied to interfaces.
