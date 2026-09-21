/**
 * Browser stand-in for `node:fs`.
 *
 * `typespun/generated` statically imports `readFileSync` for its dotenv
 * reader. The playground never passes `envFiles`, so `readDotenvFiles` loops
 * over an empty list and this is never called. If it ever is, failing loudly
 * beats silently pretending a file was empty.
 */
export function readFileSync(path: string): string {
  throw Object.assign(
    new Error(
      `The TypeSpun playground has no filesystem: refusing to read ${path}. ` +
        'Pass an explicit `source` instead of `envFiles`.',
    ),
    { code: 'ENOENT' },
  );
}

export default { readFileSync };
