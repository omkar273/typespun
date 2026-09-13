import path from 'node:path';
import ts from 'typescript';

/** Creates a real checker program with virtual schema files and real package imports. */
export function createTestProgram(
  files: Readonly<Record<string, string>>,
  compilerOptions: ts.CompilerOptions = {},
): ts.Program {
  const options: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    experimentalDecorators: true,
    skipLibCheck: true,
    noEmit: true,
    ...compilerOptions,
  };
  const contents = new Map(
    Object.entries(files).map(([name, text]) => [path.resolve(name), text]),
  );
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.readFile = (name) => contents.get(path.resolve(name)) ?? readFile(name);
  host.fileExists = (name) =>
    contents.has(path.resolve(name)) || fileExists(name);
  host.getSourceFile = (name, languageVersion) => {
    const text = host.readFile(name);
    return text === undefined
      ? undefined
      : ts.createSourceFile(name, text, languageVersion, true);
  };
  return ts.createProgram([...contents.keys()], options, host);
}
