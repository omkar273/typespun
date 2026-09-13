# Validation and redaction

`loadConfig()` validates at startup and throws one `ConfigError` after
collecting all detectable issues.

```ts
import { ConfigError } from 'typespun';

try {
  loadConfig();
} catch (error) {
  if (error instanceof ConfigError) {
    for (const issue of error.issues) {
      console.error(issue.code, issue.path, issue.message);
    }
  }
}
```

Issue codes are `missing_value`, `invalid_value`, `unknown_override`,
`source_read_failed`, and `incompatible_schema`. Non-secret invalid values may
include `received`; missing values never do.

## Secret fields

Mark a leaf or object branch with `@secret`/`@Secret()`. For secret invalid
values, Typespun emits the generic message `Invalid value for secret field`,
omits `received`, and avoids type-specific details such as allowed enum values.
Build-time defaults diagnostics identify only the file and property path.

This boundary covers diagnostics created by Typespun. It does not scrub
application logs, caught values, environment inspection, stack traces from
other code, or committed generated defaults. Secret marking is redaction, not
encryption or a secret store.

## Coercion rules

- strings remain strings, including empty strings
- numbers accept complete decimal/scientific strings and must be finite
- booleans accept `true` or `false`, case-insensitively
- string enums/literal unions require an exact, nonempty member
- arrays are JSON-parsed and every element must match the declared primitive
- typed defaults and overrides are validated without coercion

Optional object branches remain absent until any descendant resolves. Once a
branch is active, all required descendants must resolve.
