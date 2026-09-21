import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const importPattern = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*'([^']+)'/g;

function moduleGraph(entry: string): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (graph.has(file)) continue;
    const source = readFileSync(file, 'utf8');
    const specifiers = [...source.matchAll(importPattern)].map(
      (match) => match[1] as string,
    );
    graph.set(file, specifiers);
    for (const specifier of specifiers) {
      if (!specifier.startsWith('.')) continue;
      queue.push(resolve(dirname(file), specifier.replace(/\.js$/, '.ts')));
    }
  }
  return graph;
}

test('the public pipeline never imports a Node builtin', () => {
  const offenders = [...moduleGraph(resolve(here, 'index.ts'))]
    .flatMap(([file, specifiers]) =>
      specifiers
        .filter((specifier) => specifier.startsWith('node:'))
        .map((specifier) => `${file} -> ${specifier}`),
    )
    .sort();

  expect(offenders).toEqual([]);
});

test('the public pipeline reaches the analyze, emit and fingerprint modules', () => {
  const files = [...moduleGraph(resolve(here, 'index.ts')).keys()].map((file) =>
    file.slice(here.length + 1),
  );

  expect(files).toContain('analyzer/analyze.ts');
  expect(files).toContain('emitter/emit.ts');
  expect(files).toContain('emitter/fingerprint.ts');
});
