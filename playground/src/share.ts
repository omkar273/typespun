/**
 * Playground state lives in the URL hash so a link carries the whole session.
 *
 * The payload is deflate-raw compressed when the browser exposes the
 * Compression Streams API (every current engine does) and falls back to plain
 * base64 otherwise; a one-character tag says which, so old links keep working.
 */

export interface SharedState {
  readonly source: string;
  readonly envPrefix: string;
  readonly env: Record<string, string>;
}

const DEFLATED = 'z';
const PLAIN = 'u';

export async function encodeState(state: SharedState): Promise<string> {
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);
  const compressed = await deflate(bytes);
  return compressed
    ? DEFLATED + toBase64Url(compressed)
    : PLAIN + toBase64Url(bytes);
}

export async function decodeState(hash: string): Promise<SharedState | undefined> {
  const payload = hash.replace(/^#/, '');
  if (payload.length < 2) return undefined;
  try {
    const bytes = fromBase64Url(payload.slice(1));
    const raw =
      payload[0] === DEFLATED ? ((await inflate(bytes)) ?? bytes) : bytes;
    const parsed = JSON.parse(new TextDecoder().decode(raw)) as unknown;
    return isSharedState(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isSharedState(value: unknown): value is SharedState {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<SharedState>;
  return (
    typeof candidate.source === 'string' &&
    typeof candidate.envPrefix === 'string' &&
    typeof candidate.env === 'object' &&
    candidate.env !== null
  );
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array | undefined> {
  if (typeof CompressionStream === 'undefined') return undefined;
  try {
    return await pipe(bytes, new CompressionStream('deflate-raw'));
  } catch {
    return undefined;
  }
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array | undefined> {
  if (typeof DecompressionStream === 'undefined') return undefined;
  try {
    return await pipe(bytes, new DecompressionStream('deflate-raw'));
  } catch {
    return undefined;
  }
}

async function pipe(
  bytes: Uint8Array,
  transform: GenericTransformStream,
): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
