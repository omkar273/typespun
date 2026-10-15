/**
 * Dependency-free, synchronous SHA-256 (FIPS 180-4).
 *
 * The generator runs both on Node and — for tooling such as the playground — in
 * a browser bundle, so the fingerprint hash cannot use `node:crypto`. Web Crypto
 * is unsuitable because `subtle.digest` is asynchronous and would change
 * {@link createFingerprint}'s signature. Output is byte-identical to
 * `createHash('sha256').update(text).digest('hex')`; `sha256.test.ts` pins that
 * with NIST vectors and a differential test against `node:crypto`.
 */

const ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INITIAL_STATE = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
]);

const BLOCK_BYTES = 64;
const LENGTH_BYTES = 8;
const TERMINATOR_BYTES = 1;
const WORD_BYTES = 4;
const STATE_WORDS = 8;
const SCHEDULE_WORDS = 64;

// Words go through a DataView: typed-array indexing is `number | undefined`
// under noUncheckedIndexedAccess, and `setUint32` wraps modulo 2^32 the same way.
const readWord = (view: DataView, index: number) =>
  view.getUint32(index * WORD_BYTES);

const writeWord = (view: DataView, index: number, value: number) =>
  view.setUint32(index * WORD_BYTES, value);

const rotateRight = (value: number, bits: number): number =>
  (value >>> bits) | (value << (32 - bits));

const padMessage = (message: Uint8Array): Uint8Array => {
  const minimum = message.length + TERMINATOR_BYTES + LENGTH_BYTES;
  const length = Math.ceil(minimum / BLOCK_BYTES) * BLOCK_BYTES;
  const padded = new Uint8Array(length);
  padded.set(message);
  padded[message.length] = 0x80;

  const bits = message.length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(length - 8, Math.floor(bits / 0x1_0000_0000), false);
  view.setUint32(length - 4, bits >>> 0, false);
  return padded;
};

const digest = (message: Uint8Array): DataView => {
  const padded = padMessage(message);
  const block = new DataView(padded.buffer);
  const state = new DataView(new ArrayBuffer(STATE_WORDS * WORD_BYTES));
  const schedule = new DataView(new ArrayBuffer(SCHEDULE_WORDS * WORD_BYTES));

  for (const [index, word] of INITIAL_STATE.entries())
    writeWord(state, index, word);

  for (let offset = 0; offset < padded.length; offset += BLOCK_BYTES) {
    for (let index = 0; index < 16; index++) {
      writeWord(schedule, index, block.getUint32(offset + index * 4, false));
    }

    for (let index = 16; index < SCHEDULE_WORDS; index++) {
      const previous = readWord(schedule, index - 15);
      const recent = readWord(schedule, index - 2);
      const sigma0 =
        rotateRight(previous, 7) ^ rotateRight(previous, 18) ^ (previous >>> 3);
      const sigma1 =
        rotateRight(recent, 17) ^ rotateRight(recent, 19) ^ (recent >>> 10);
      writeWord(
        schedule,
        index,
        readWord(schedule, index - 16) +
          sigma0 +
          readWord(schedule, index - 7) +
          sigma1,
      );
    }

    let a = readWord(state, 0);
    let b = readWord(state, 1);
    let c = readWord(state, 2);
    let d = readWord(state, 3);
    let e = readWord(state, 4);
    let f = readWord(state, 5);
    let g = readWord(state, 6);
    let h = readWord(state, 7);

    for (const [index, constant] of ROUND_CONSTANTS.entries()) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const first =
        (h + sum1 + choose + constant + readWord(schedule, index)) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const second = (sum0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + first) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (first + second) >>> 0;
    }

    for (const [index, word] of [a, b, c, d, e, f, g, h].entries())
      writeWord(state, index, readWord(state, index) + word);
  }

  return state;
};

/** Hashes the UTF-8 encoding of `text` and returns the lowercase hex digest. */
export const sha256Hex = (text: string): string => {
  const state = digest(new TextEncoder().encode(text));
  let hex = '';

  for (let index = 0; index < STATE_WORDS; index++)
    hex += readWord(state, index).toString(16).padStart(8, '0');

  return hex;
};
