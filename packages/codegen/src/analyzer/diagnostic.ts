import ts from 'typescript';
import type { Diagnostic, SourceLocation } from '../contracts.js';

export function locationOf(node: ts.Node): SourceLocation {
  const source = node.getSourceFile();
  const position = source.getLineAndCharacterOfPosition(
    ts.isSourceFile(node) ? 0 : node.getStart(source),
  );
  return {
    file: source.fileName,
    line: position.line + 1,
    column: position.character + 1,
  };
}

export function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.sort(
    (a, b) =>
      a.location.file.localeCompare(b.location.file) ||
      a.location.line - b.location.line ||
      a.location.column - b.location.column ||
      a.code.localeCompare(b.code),
  );
}
