import { expect, test } from 'bun:test';
import path from 'node:path';
import { createTestProgram } from '../testing/program.js';
import { analyzeProgram } from './analyze.js';

const inputPath = path.resolve('packages/codegen/config.fixture.ts');

function analyze(
  source: string,
  envPrefix = '',
  extra: Record<string, string> = {},
) {
  return analyzeProgram(
    createTestProgram({ ...extra, [inputPath]: source }),
    inputPath,
    envPrefix,
  );
}

function diagnosticSummary(source: string) {
  return analyze(source).diagnostics.map(({ code, location }) => ({
    code,
    line: location.line,
    column: location.column,
  }));
}

test('interface flattens imported aliases, inheritance and separate annotations', () => {
  const program = createTestProgram({
    [path.join(path.dirname(inputPath), 'shared.fixture.ts')]:
      'export interface Base { enabled: boolean; }\nexport type Database = { host: string; };\nexport enum Mode { Dev = "dev", Prod = "prod" }',
    [inputPath]: `import type { Base, Database, Mode } from './shared.fixture.js';
/** @typespun */
export interface Settings extends Base {
  /** @key db */
  database?: Database;
  /** @default "dev" */
  mode: Mode;
  /**
   * @env PRIVATE_TOKEN
   * @secret
   * @default "local"
   */
  token: string;
  /** @ignore */
  cache: Date;
  /** @default [1,2] */
  ports: number[];
}`,
  });
  const result = analyzeProgram(program, inputPath, '');
  expect(result.diagnostics).toEqual([]);
  expect(result.rootName).toBe('Settings');
  expect(result.inputPath).toBe(inputPath);
  expect(
    result.fields.map(({ location: _location, ...field }) => field),
  ).toEqual([
    {
      propertyPath: ['database', 'host'],
      defaultsPath: ['db', 'host'],
      envName: 'DATABASE_HOST',
      kind: { type: 'string' },
      required: true,
      secret: false,
      hasDefault: false,
      optionalParents: [['database']],
    },
    {
      propertyPath: ['mode'],
      defaultsPath: ['mode'],
      envName: 'MODE',
      kind: { type: 'enum', values: ['dev', 'prod'] },
      required: true,
      secret: false,
      hasDefault: true,
      defaultValue: 'dev',
      optionalParents: [],
    },
    {
      propertyPath: ['token'],
      defaultsPath: ['token'],
      envName: 'PRIVATE_TOKEN',
      kind: { type: 'string' },
      required: true,
      secret: true,
      hasDefault: true,
      defaultValue: 'local',
      optionalParents: [],
    },
    {
      propertyPath: ['ports'],
      defaultsPath: ['ports'],
      envName: 'PORTS',
      kind: { type: 'array', element: 'number' },
      required: true,
      secret: false,
      hasDefault: true,
      defaultValue: [1, 2],
      optionalParents: [],
    },
    {
      propertyPath: ['enabled'],
      defaultsPath: ['enabled'],
      envName: 'ENABLED',
      kind: { type: 'boolean' },
      required: true,
      secret: false,
      hasDefault: false,
      optionalParents: [],
    },
  ]);
});

test('decorated class resolves aliased imports and statically reads approved initializers', () => {
  const result = analyze(
    `import { Config as Schema, Default, Env, Key, Secret, Ignore } from 'typespun';
enum Mode { Dev = 'dev', Prod = 'prod' }
@Schema()
export class Settings {
  port = -3000;
  @Env('EXACT_HOST') host = ('local' as const);
  enabled = true satisfies boolean;
  ports = [1, -2];
  mode: Mode = Mode.Dev;
  @Key('db') @Secret() database: { host: string; retries?: number } = { host: 'localhost', retries: 3 };
  @Default(false) debug!: boolean;
  @Ignore() internal = new Date();
}`,
    'APP_',
  );
  expect(result.diagnostics).toEqual([]);
  expect(result.rootName).toBe('Settings');
  expect(
    result.fields.map(
      ({
        propertyPath,
        defaultsPath,
        envName,
        kind,
        defaultValue,
        secret,
      }) => ({
        propertyPath,
        defaultsPath,
        envName,
        kind,
        defaultValue,
        secret,
      }),
    ),
  ).toEqual([
    {
      propertyPath: ['port'],
      defaultsPath: ['port'],
      envName: 'APP_PORT',
      kind: { type: 'number' },
      defaultValue: -3000,
      secret: false,
    },
    {
      propertyPath: ['host'],
      defaultsPath: ['host'],
      envName: 'EXACT_HOST',
      kind: { type: 'enum', values: ['local'] },
      defaultValue: 'local',
      secret: false,
    },
    {
      propertyPath: ['enabled'],
      defaultsPath: ['enabled'],
      envName: 'APP_ENABLED',
      kind: { type: 'boolean' },
      defaultValue: true,
      secret: false,
    },
    {
      propertyPath: ['ports'],
      defaultsPath: ['ports'],
      envName: 'APP_PORTS',
      kind: { type: 'array', element: 'number' },
      defaultValue: [1, -2],
      secret: false,
    },
    {
      propertyPath: ['mode'],
      defaultsPath: ['mode'],
      envName: 'APP_MODE',
      kind: { type: 'enum', values: ['dev', 'prod'] },
      defaultValue: 'dev',
      secret: false,
    },
    {
      propertyPath: ['database', 'host'],
      defaultsPath: ['db', 'host'],
      envName: 'APP_DATABASE_HOST',
      kind: { type: 'string' },
      defaultValue: 'localhost',
      secret: true,
    },
    {
      propertyPath: ['database', 'retries'],
      defaultsPath: ['db', 'retries'],
      envName: 'APP_DATABASE_RETRIES',
      kind: { type: 'number' },
      defaultValue: 3,
      secret: true,
    },
    {
      propertyPath: ['debug'],
      defaultsPath: ['debug'],
      envName: 'APP_DEBUG',
      kind: { type: 'boolean' },
      defaultValue: false,
      secret: false,
    },
  ]);
});

test.each([
  ['constructor() {}', 'invalid_class_member'],
  ['method() {}', 'invalid_class_member'],
  ['get port() { return 1; }', 'invalid_class_member'],
  ['set port(value: number) {}', 'invalid_class_member'],
  ['static port = 1;', 'invalid_class_member'],
  ['private port = 1;', 'invalid_class_member'],
  ['protected port = 1;', 'invalid_class_member'],
  ['#port = 1;', 'invalid_class_member'],
  ['port = Math.random();', 'invalid_default'],
  ['port = Number.MAX_VALUE;', 'invalid_default'],
  ['port = (() => 1)();', 'invalid_default'],
])('decorated class rejects %s', (member, code) => {
  expect(
    diagnosticSummary(
      `import { Config } from 'typespun';\n@Config()\nexport class Settings {\n  ${member}\n}`,
    ),
  ).toEqual([{ code, line: 4, column: 3 }]);
});

test('decorated class rejects inheritance', () => {
  expect(
    diagnosticSummary(`import { Config } from 'typespun';
class Base { port = 1; }
@Config()
export class Settings extends Base {}`),
  ).toEqual([{ code: 'class_inheritance', line: 4, column: 23 }]);
});

test('decorated class ignores unrelated same-name decorators', () => {
  expect(
    diagnosticSummary(`function Config() { return (...args: unknown[]) => {}; }
@Config()
export class Settings { port = 1; }`),
  ).toEqual([{ code: 'root_count', line: 1, column: 1 }]);
});

test.each([
  ['value: string & { tag: true };', 'unsupported_type'],
  ['value: string | number;', 'unsupported_type'],
  ['value: string | null;', 'unsupported_type'],
  ['value?: string | null;', 'unsupported_type'],
  ['value: [string, number];', 'unsupported_type'],
  ['value: Record<string, string>;', 'unsupported_type'],
  ['value: { [key: string]: number };', 'unsupported_type'],
  ['value: Date;', 'unsupported_type'],
  ['value: Map<string, string>;', 'unsupported_type'],
  ['value: Set<string>;', 'unsupported_type'],
  ['value: bigint;', 'unsupported_type'],
  ['value: () => void;', 'unsupported_type'],
  ['value: unknown;', 'unsupported_type'],
  ['value: any;', 'unsupported_type'],
  ['value: never;', 'unsupported_type'],
  ['value: Array<{ host: string }>;', 'unsupported_type'],
  ['"bad-key": string;', 'invalid_property'],
  ['[Symbol.iterator]: string;', 'invalid_property'],
  ['123: string;', 'invalid_property'],
  ['__proto__: string;', 'invalid_property'],
  ['method(): string;', 'unsupported_type'],
])('unsupported schema rejects %s at the field', (member, code) => {
  expect(
    diagnosticSummary(
      `/** @typespun */\nexport interface Settings {\n  ${member}\n}`,
    ),
  ).toEqual([{ code, line: 3, column: 3 }]);
});

test('unsupported numeric enums report the referencing field', () => {
  expect(
    diagnosticSummary(`enum Mode { Dev, Prod }
/** @typespun */
export interface Settings {
  mode: Mode;
}`),
  ).toEqual([{ code: 'unsupported_type', line: 4, column: 3 }]);
});

test('unsupported generic roots are rejected', () => {
  expect(
    diagnosticSummary(`/** @typespun */
export interface Settings<T> { value: T; }`),
  ).toEqual([{ code: 'generic_schema', line: 2, column: 18 }]);
});

test('unsupported recursive schema reports the circular property', () => {
  expect(
    diagnosticSummary(`/** @typespun */
export interface Settings {
  child?: Settings;
}`),
  ).toEqual([{ code: 'recursive_type', line: 3, column: 3 }]);
});

test('unsupported root declaration merging is rejected', () => {
  expect(
    diagnosticSummary(`/** @typespun */
export interface Settings { port: number; }
export interface Settings { host: string; }`),
  ).toEqual([{ code: 'declaration_merging', line: 2, column: 18 }]);
});

test('unsupported root index signature is rejected', () => {
  expect(
    diagnosticSummary(`/** @typespun */
export interface Settings {
  [key: string]: number;
}`),
  ).toEqual([{ code: 'unsupported_type', line: 3, column: 3 }]);
});

test('collision diagnostics distinguish duplicate env names and defaults paths', () => {
  expect(
    diagnosticSummary(`/** @typespun */
export interface Settings {
  fooBar: string;
  foo_bar: string;
  /** @key shared */
  first: string;
  /** @key shared */
  second: string;
}`),
  ).toEqual([
    { code: 'duplicate_env', line: 4, column: 3 },
    { code: 'duplicate_defaults_path', line: 8, column: 3 },
  ]);
});

test('object Env is rejected while secret and ignore cascade', () => {
  expect(
    diagnosticSummary(`/** @typespun */
export interface Settings {
  /** @env DATABASE */
  database: { host: string };
}`),
  ).toEqual([{ code: 'object_env', line: 4, column: 3 }]);
  const result = analyze(`/** @typespun */
export interface Settings {
  /** @secret */
  auth?: { token: string; nested?: { password: string } };
  /** @ignore */
  cache: { date: Date };
}`);
  expect(result.diagnostics).toEqual([]);
  expect(
    result.fields.map(({ propertyPath, secret, optionalParents }) => ({
      propertyPath,
      secret,
      optionalParents,
    })),
  ).toEqual([
    {
      propertyPath: ['auth', 'token'],
      secret: true,
      optionalParents: [['auth']],
    },
    {
      propertyPath: ['auth', 'nested', 'password'],
      secret: true,
      optionalParents: [['auth'], ['auth', 'nested']],
    },
  ]);
});

test('invalid JSON defaults produce safe source-located diagnostics', () => {
  const result = analyze(`/** @typespun */
export interface Settings {
  /** @default SECRET_DO_NOT_PRINT */
  token: string;
}`);
  expect(
    result.diagnostics.map(({ code, location }) => ({
      code,
      line: location.line,
      column: location.column,
    })),
  ).toEqual([{ code: 'invalid_default', line: 3, column: 7 }]);
  expect(JSON.stringify(result.diagnostics)).not.toContain(
    'SECRET_DO_NOT_PRINT',
  );
});

test.each([
  ['@key nested.path', 'invalid_annotation'],
  ['@key __proto__', 'invalid_annotation'],
  ['@key', 'invalid_annotation'],
  ['@env BAD NAME', 'invalid_annotation'],
  ['@default "wrong"', 'invalid_default'],
])('invalid annotation %s reports the field', (annotation, code) => {
  expect(
    diagnosticSummary(
      `/** @typespun */\nexport interface Settings {\n  /** ${annotation} */\n  value: number;\n}`,
    ),
  ).toEqual([{ code, line: 4, column: 3 }]);
});

test('object defaults propagate only known own properties and reject invalid roots', () => {
  const result = analyze(`/** @typespun */
export interface Settings {
  /** @default {"host":"local","port":12} */
  database: { host: string; port: number };
}`);
  expect(result.diagnostics).toEqual([]);
  expect(result.fields.map(({ defaultValue }) => defaultValue)).toEqual([
    'local',
    12,
  ]);
  expect(
    diagnosticSummary(`/** @typespun */
export interface Settings {
  /** @default [] */
  database: { host: string };
}`),
  ).toEqual([{ code: 'invalid_default', line: 4, column: 3 }]);
});

test('interface accepts resolved generic aliases, repeated shapes, readonly arrays and literal unions', () => {
  const result = analyze(`type Box<T> = { value: T };
/** @typespun */
export interface Settings {
  first: Box<string>;
  second: Box<string>;
  names: readonly string[];
  state: 'on' | 'off';
}`);
  expect(result.diagnostics).toEqual([]);
  expect(
    result.fields.map(({ propertyPath, kind }) => ({ propertyPath, kind })),
  ).toEqual([
    { propertyPath: ['first', 'value'], kind: { type: 'string' } },
    { propertyPath: ['second', 'value'], kind: { type: 'string' } },
    { propertyPath: ['names'], kind: { type: 'array', element: 'string' } },
    { propertyPath: ['state'], kind: { type: 'enum', values: ['on', 'off'] } },
  ]);
});

test('decorated class handles namespace imports and readonly primitive initializers', () => {
  const result = analyze(`import * as schema from 'typespun';
@schema.Config()
export class Settings {
  readonly port: number = 3000;
  readonly enabled: boolean = true;
}`);
  expect(result.diagnostics).toEqual([]);
  expect(
    result.fields.map(({ kind, defaultValue }) => ({ kind, defaultValue })),
  ).toEqual([
    { kind: { type: 'number' }, defaultValue: 3000 },
    { kind: { type: 'boolean' }, defaultValue: true },
  ]);
});

test('decorated class follows a package decorator through reexports', () => {
  const result = analyze(
    `import { Schema } from './decorators.fixture.js';
@Schema()
export class Settings { port = 1; }`,
    '',
    {
      [path.join(path.dirname(inputPath), 'decorators.fixture.ts')]:
        `export { Config as Schema } from 'typespun';`,
    },
  );
  expect(result.diagnostics).toEqual([]);
  expect(result.rootName).toBe('Settings');
});

test.each([
  'const value = 1;\n',
  '/** @typespun */\ninterface Settings { port: number; }',
  '/** @typespun */\nexport interface First {}\n/** @typespun */\nexport interface Second {}',
])('root selection requires exactly one exported marker: %s', (source) => {
  expect(diagnosticSummary(source)).toEqual([
    { code: 'root_count', line: 1, column: 1 },
  ]);
});

test('missing input returns a diagnostic instead of throwing', () => {
  expect(analyzeProgram(createTestProgram({}), '/missing.ts', '')).toEqual({
    inputPath: '/missing.ts',
    fields: [],
    diagnostics: [
      {
        code: 'input_not_found',
        message: 'Schema input is not in the TypeScript program.',
        location: { file: '/missing.ts', line: 1, column: 1 },
      },
    ],
  });
});

test('explicit env collisions include prefix-derived names', () => {
  const result = analyze(
    `/** @typespun */
export interface Settings {
  port: number;
  /** @env APP_PORT */
  other: number;
}`,
    'APP_',
  );
  expect(
    result.diagnostics.map(({ code, location }) => ({
      code,
      line: location.line,
      column: location.column,
    })),
  ).toEqual([{ code: 'duplicate_env', line: 5, column: 3 }]);
});

test('defaults path collisions include leaf-versus-object conflicts', () => {
  expect(
    diagnosticSummary(`/** @typespun */
export interface Settings {
  /** @key db */
  first: string;
  /** @key db */
  second: { host: string };
}`),
  ).toEqual([{ code: 'duplicate_defaults_path', line: 6, column: 3 }]);
});

test('unknown and unsafe inline object defaults are rejected', () => {
  expect(
    diagnosticSummary(`/** @typespun */
export interface Settings {
  /** @default {"__proto__":{"polluted":true}} */
  database: { host: string };
}`),
  ).toEqual([{ code: 'invalid_default', line: 4, column: 3 }]);
  expect(
    diagnosticSummary(`/** @typespun */
export interface Settings {
  /** @default {"unused":1} */
  database: { host: string };
}`),
  ).toEqual([{ code: 'invalid_default', line: 4, column: 3 }]);
});

test('decorated class rejects executable initializers even with Default', () => {
  expect(
    diagnosticSummary(`import { Config, Default } from 'typespun';
@Config()
export class Settings {
  @Default(1) port = Math.random();
}`),
  ).toEqual([{ code: 'invalid_default', line: 4, column: 3 }]);
});

test.each([
  'port = external;',
  'ports = [...[1]];',
  'database = { ...{} };',
  'database = { get port() { return 1; } };',
  'database = { ["port"]: 1 };',
  'port = Infinity;',
  '@Default(Math.random()) port!: number;',
  '@Env(12) port = 1;',
])('decorated class rejects unsafe value %s', (member) => {
  expect(
    diagnosticSummary(
      `import { Config, Default, Env } from 'typespun';\n@Config()\nexport class Settings {\n  ${member}\n}`,
    ),
  ).toEqual([
    {
      code: member.startsWith('@Env')
        ? 'invalid_annotation'
        : 'invalid_default',
      line: 4,
      column: 3,
    },
  ]);
});

test('diagnostics sort by source file and position even when traversal order differs', () => {
  const result = analyze(
    `import type { Z } from './z.fixture.js';
import type { A } from './a.fixture.js';
/** @typespun */
export interface Settings { z: Z; a: A; }`,
    '',
    {
      [path.join(path.dirname(inputPath), 'z.fixture.ts')]:
        'export interface Z { fail: Date; }',
      [path.join(path.dirname(inputPath), 'a.fixture.ts')]:
        'export interface A { fail: bigint; }',
    },
  );
  expect(
    result.diagnostics.map(({ code, location }) => ({
      code,
      file: path.basename(location.file),
      line: location.line,
      column: location.column,
    })),
  ).toEqual([
    { code: 'unsupported_type', file: 'a.fixture.ts', line: 1, column: 22 },
    { code: 'unsupported_type', file: 'z.fixture.ts', line: 1, column: 22 },
  ]);
});

test('unsupported intersections remain rejected when the checker simplifies them', () => {
  expect(
    diagnosticSummary(`type Combined = { host: string } & {};
/** @typespun */
export interface Settings {
  value: Combined;
}`),
  ).toEqual([{ code: 'unsupported_type', line: 4, column: 3 }]);
});

test('unsupported inherited index signatures report their declaration', () => {
  expect(
    diagnosticSummary(`interface Base { [key: string]: number }
/** @typespun */
export interface Settings extends Base {}`),
  ).toEqual([{ code: 'unsupported_type', line: 1, column: 18 }]);
});

test('interface root recognizes explicit export lists', () => {
  const result = analyze(`/** @typespun */
interface Settings { port: number }
export { Settings };`);
  expect(result.diagnostics).toEqual([]);
  expect(result.rootName).toBe('Settings');
});

test('decorated class gathers invalid members and defaults together', () => {
  expect(
    diagnosticSummary(`import { Config } from 'typespun';
@Config()
export class Settings {
  constructor() {}
  port = Math.random();
}`),
  ).toEqual([
    { code: 'invalid_class_member', line: 4, column: 3 },
    { code: 'invalid_default', line: 5, column: 3 },
  ]);
});

test('unsupported expanding generic recursion terminates with a source diagnostic', () => {
  expect(
    diagnosticSummary(`type Loop<T> = { next: Loop<T[]> };
/** @typespun */
export interface Settings { loop: Loop<number> }`),
  ).toEqual([{ code: 'recursive_type', line: 1, column: 18 }]);
});

test.each([
  ['1', '2'],
  ['true', 'false'],
  ['false', 'true'],
  ['1[]', '[2]'],
  ['true[]', '[false]'],
])(
  'review rejects singleton %s despite contradictory default %s',
  (type, value) => {
    expect(
      diagnosticSummary(`/** @typespun */
export interface Settings {
  /** @default ${value} */
  value: ${type};
}`),
    ).toEqual([{ code: 'unsupported_type', line: 4, column: 3 }]);
  },
);

test('review rejects inferred readonly singletons instead of widening their root type', () => {
  expect(
    diagnosticSummary(`import { Config } from 'typespun';
@Config()
export class Settings {
  readonly port = 1;
  readonly enabled = true;
}`),
  ).toEqual([
    { code: 'unsupported_type', line: 4, column: 3 },
    { code: 'unsupported_type', line: 5, column: 3 },
  ]);
});

test.each([
  [
    '/** @typespun */\ninterface Settings { port: number }\nexport { Settings as PublicSettings };',
    { kind: 'named', name: 'PublicSettings' },
  ],
  [
    '/** @typespun */\nexport default interface Settings { port: number }',
    { kind: 'default' },
  ],
  [
    'import { Config } from "typespun";\n@Config()\nexport default class Settings { port = 1; }',
    { kind: 'default' },
  ],
] as const)(
  'review retains importable identity for %s',
  (source, rootExport) => {
    const result = analyze(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.rootName).toBe('Settings');
    expect(result.rootExport).toEqual(rootExport);
  },
);

test.each([
  ['(): string;', 18],
  ['new (): { value: string };', 18],
])('review rejects inherited callable signature %s', (signature, column) => {
  expect(
    diagnosticSummary(`interface Base { ${signature} }
interface Middle extends Base {}
/** @typespun */
export interface Settings extends Middle { port: number }`),
  ).toEqual([{ code: 'unsupported_type', line: 1, column }]);
});

test('review finite conditional generic walk resolves every leaf', () => {
  const result =
    analyze(`type Walk<T extends unknown[]> = T extends [unknown, ...infer Rest]
  ? { next: Walk<Rest> } : { value: string };
/** @typespun */
export interface Settings { walk: Walk<[1, 2, 3, 4]> }`);
  expect(result.diagnostics).toEqual([]);
  expect(
    result.fields.map(({ propertyPath, kind }) => ({ propertyPath, kind })),
  ).toEqual([
    {
      propertyPath: ['walk', 'next', 'next', 'next', 'next', 'value'],
      kind: { type: 'string' },
    },
  ]);
});

test('review recursively merges nested object inline defaults with parent precedence', () => {
  const result = analyze(`interface Database {
  /** @default {"host":"inner","port":123,"nested":{"a":"old","b":"keep"},"names":["old"]} */
  connection: { host: string; port: number; nested: { a: string; b: string }; names: string[] };
}
/** @typespun */
export interface Settings {
  /** @default {"connection":{"host":"outer","nested":{"a":"new"},"names":["new"]}} */
  database: Database;
}`);
  expect(result.diagnostics).toEqual([]);
  expect(
    result.fields.map(({ propertyPath, hasDefault, defaultValue }) => ({
      propertyPath,
      hasDefault,
      defaultValue,
    })),
  ).toEqual([
    {
      propertyPath: ['database', 'connection', 'host'],
      hasDefault: true,
      defaultValue: 'outer',
    },
    {
      propertyPath: ['database', 'connection', 'port'],
      hasDefault: true,
      defaultValue: 123,
    },
    {
      propertyPath: ['database', 'connection', 'nested', 'a'],
      hasDefault: true,
      defaultValue: 'new',
    },
    {
      propertyPath: ['database', 'connection', 'nested', 'b'],
      hasDefault: true,
      defaultValue: 'keep',
    },
    {
      propertyPath: ['database', 'connection', 'names'],
      hasDefault: true,
      defaultValue: ['new'],
    },
  ]);
});

test('review duplicate object defaults paths reject disjoint descendants', () => {
  expect(
    diagnosticSummary(`/** @typespun */
export interface Settings {
  /** @key database */
  first: { host: string };
  /** @key database */
  second: { port: number };
}`),
  ).toEqual([{ code: 'duplicate_defaults_path', line: 6, column: 3 }]);
});

test.each([
  ['type Combined = { host: string } & {};', 2],
  ['type Original = { host: string } & {};\ntype Combined = Original;', 3],
])(
  'review rejects intersections across inherited aliases: %s',
  (alias, line) => {
    expect(
      diagnosticSummary(`${alias}
interface Middle extends Combined {}
/** @typespun */
export interface Settings extends Middle {}`),
    ).toEqual([{ code: 'unsupported_type', line, column: 26 }]);
  },
);

test.each(['private', 'protected'])(
  'review rejects inherited %s class fields',
  (modifier) => {
    expect(
      diagnosticSummary(`class Base { ${modifier} token!: string }
/** @typespun */
export interface Settings extends Base {}`),
    ).toEqual([{ code: 'invalid_class_member', line: 1, column: 14 }]);
  },
);

test('review bounds nonterminating conditional generic expansion without throwing', () => {
  expect(
    diagnosticSummary(`type Loop<T> = T extends unknown ? { next: Loop<T[]> } : never;
/** @typespun */
export interface Settings { loop: Loop<number> }`),
  ).toEqual([{ code: 'schema_too_deep', line: 1, column: 38 }]);
});

test('review finite generic walk follows a conditional helper alias', () => {
  const result =
    analyze(`type Next<T extends unknown[]> = T extends [unknown, ...infer Rest] ? Walk<Rest> : string;
type Walk<T extends unknown[]> = { next: Next<T> };
/** @typespun */
export interface Settings { walk: Walk<[1, 2, 3]> }`);
  expect(result.diagnostics).toEqual([]);
  expect(result.fields.map(({ propertyPath }) => propertyPath)).toEqual([
    ['walk', 'next', 'next', 'next', 'next'],
  ]);
});

test('review aggregates simultaneous defaults and environment collisions', () => {
  expect(
    diagnosticSummary(`/** @typespun */
export interface Settings {
  /** @key shared
   * @env SHARED */
  first: string;
  /** @key shared
   * @env SHARED */
  second: string;
}`),
  ).toEqual([
    { code: 'duplicate_defaults_path', line: 8, column: 3 },
    { code: 'duplicate_env', line: 8, column: 3 },
  ]);
});

test('review bounds expanding inherited generics through type-parameter properties', () => {
  expect(
    diagnosticSummary(`interface Wrap<T> { next: T }
interface Loop<T> extends Wrap<Loop<T[]>> {}
/** @typespun */
export interface Settings { loop: Loop<number> }`),
  ).toEqual([{ code: 'schema_too_deep', line: 1, column: 21 }]);
});
