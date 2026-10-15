import ts from 'typescript';
import type { Diagnostic, SourceLocation } from '../contracts.js';

export const locationOf = (node: ts.Node): SourceLocation => {
  const source = node.getSourceFile();
  const position = source.getLineAndCharacterOfPosition(
    ts.isSourceFile(node) ? 0 : node.getStart(source),
  );
  return {
    file: source.fileName,
    line: position.line + 1,
    column: position.character + 1,
  };
};

// The first comparison that differs decides the order.
const compareDiagnostics = (a: Diagnostic, b: Diagnostic): number =>
  [
    a.location.file.localeCompare(b.location.file),
    a.location.line - b.location.line,
    a.location.column - b.location.column,
    a.code.localeCompare(b.code),
  ].reduce((order, next) => (order === 0 ? next : order), 0);

export const sortDiagnostics = (diagnostics: Diagnostic[]): Diagnostic[] => {
  diagnostics.sort(compareDiagnostics);
  return diagnostics;
};
