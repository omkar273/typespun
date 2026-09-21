import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { sha256Hex } from './sha256.js';

/** The oracle: Node's own SHA-256, which the browser-safe port must match. */
function nodeSha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Deterministic 32-bit PRNG (mulberry32). A fixed seed keeps the generated
 * corpus byte-identical on every run, so a failure is always reproducible.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

/** Code points spanning 1-, 2-, 3- and 4-byte UTF-8 encodings. */
const CODE_POINTS = [
  0x20, 0x41, 0x7a, 0x30, 0x7f, 0xe9, 0xdf, 0x3bb, 0x5d0, 0x65e5, 0x20ac,
  0xfffd, 0x1f600, 0x10348,
];

function generateInput(seed: number, length: number): string {
  const random = seededRandom(seed);
  let text = '';
  for (let index = 0; index < length; index++) {
    const pick = Math.floor(random() * CODE_POINTS.length);
    text += String.fromCodePoint(CODE_POINTS[pick] as number);
  }
  return text;
}

/**
 * Byte lengths straddling the 64-byte block and the 55/56-byte padding
 * boundary, where the final block either does or does not have room for the
 * 8-byte length suffix.
 */
const BOUNDARY_LENGTHS = [
  0, 1, 2, 31, 32, 54, 55, 56, 57, 63, 64, 65, 66, 111, 112, 113, 119, 120, 127,
  128, 129, 191, 192, 193,
];

describe('sha256Hex', () => {
  test.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
    [
      'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
      'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
    ],
    [
      'The quick brown fox jumps over the lazy dog',
      'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
    ],
    [
      'The quick brown fox jumps over the lazy dog.',
      'ef537f25c895bfa782526529a9b63d97aa631564d5d789c2b765448c8635fb6c',
    ],
  ])('reproduces the published digest for %j', (input, expected) => {
    expect(sha256Hex(input)).toBe(expected);
  });

  test('reproduces the published digest for one million repeated "a"', () => {
    expect(sha256Hex('a'.repeat(1_000_000))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });

  test.each([
    ['empty string', ''],
    ['single ascii character', 'a'],
    ['exactly one block', 'a'.repeat(64)],
    ['multi-byte characters', 'héllo 日本語 \u{1f642}'],
    ['generated corpus sample', generateInput(1, 300)],
  ])('returns 64 lowercase hex characters for %s', (_label, input) => {
    const digest = sha256Hex(input);
    expect(digest).toHaveLength(64);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  test('produces different digests for inputs differing in one bit', () => {
    expect(sha256Hex('typespun')).not.toBe(sha256Hex('typespuo'));
  });

  test('is deterministic across repeated calls', () => {
    const input = generateInput(7, 200);
    expect(sha256Hex(input)).toBe(sha256Hex(input));
  });

  test.each(BOUNDARY_LENGTHS)(
    'matches node:crypto for an input of %i ascii bytes',
    (length) => {
      const input = 'a'.repeat(length);
      expect(sha256Hex(input)).toBe(nodeSha256Hex(input));
    },
  );

  test('matches node:crypto at every ascii length from 0 to 256 bytes', () => {
    for (let length = 0; length <= 256; length++) {
      const input = 'a'.repeat(length);
      expect(sha256Hex(input)).toBe(nodeSha256Hex(input));
    }
  });

  test.each([
    ['latin-1 accented characters', 'café naïve façade résumé'],
    ['greek and cyrillic', 'λόγος привет'],
    ['hebrew right-to-left text', 'שלום עולם'],
    ['cjk ideographs', '日本語 中文 한국어'],
    [
      'emoji outside the BMP (surrogate pairs)',
      '\u{1f642}\u{1f643}\u{1f469}\u200d\u{1f4bb}',
    ],
    ['astral plane linear-b and musical symbols', '\u{10348}\u{1d11e}'],
    ['a lone unpaired surrogate', 'a\ud800b'],
    ['a replacement character', 'a�b'],
    ['combining marks', 'é vs é'],
    [
      'a null character and control codes',
      `a${String.fromCharCode(0)}b${String.fromCharCode(1)}${String.fromCharCode(31)}`,
    ],
    ['whitespace only', ' \t\n\r\f\v'],
    [
      'a three-byte character straddling a block boundary',
      `${'a'.repeat(62)}日本`,
    ],
    [
      'a four-byte character straddling a block boundary',
      `${'a'.repeat(61)}\u{1f642}`,
    ],
    [
      'a realistic config fingerprint payload',
      '{"envPrefix":"APP_","fields":[{"envName":"PORT","type":"number"}]}',
    ],
  ])('matches node:crypto for %s', (_label, input) => {
    expect(sha256Hex(input)).toBe(nodeSha256Hex(input));
  });

  test.each([1, 2, 3, 4, 5])(
    'matches node:crypto across a deterministic generated corpus (seed %i)',
    (seed) => {
      for (let length = 0; length < 40; length++) {
        const input = generateInput(seed * 1000 + length, length);
        expect(sha256Hex(input)).toBe(nodeSha256Hex(input));
      }
    },
  );

  test('matches node:crypto for a 100,000 character multi-block input', () => {
    const input = generateInput(42, 100_000);
    expect(sha256Hex(input)).toBe(nodeSha256Hex(input));
  });

  test('matches node:crypto for 100,000 repeated ascii characters', () => {
    const input = 'x'.repeat(100_000);
    expect(sha256Hex(input)).toBe(nodeSha256Hex(input));
  });
});
