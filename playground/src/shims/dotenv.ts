/**
 * Browser stand-in for `dotenv`. Reachable only through `envFiles`, which the
 * playground never passes. See `./node-fs.ts`.
 */
export function parse(): Record<string, string> {
  return {};
}

export default { parse };
