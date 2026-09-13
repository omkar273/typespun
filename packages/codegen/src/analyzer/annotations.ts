import ts from 'typescript';
import { evaluateDefault } from './default-expression.js';

export interface Annotations {
  root: boolean;
  ignore: boolean;
  secret: boolean;
  key?: string;
  env?: string;
  hasDefault: boolean;
  defaultValue?: unknown;
}

export type Report = (code: string, message: string, node: ts.Node) => void;

export function typespunSymbols(program: ts.Program): Map<ts.Symbol, string> {
  const checker = program.getTypeChecker();
  const symbols = new Map<ts.Symbol, string>();
  for (const source of program.getSourceFiles()) {
    for (const statement of source.statements) {
      if (
        !(
          ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
        )
      )
        continue;
      const specifier = statement.moduleSpecifier;
      if (
        !specifier ||
        !ts.isStringLiteral(specifier) ||
        specifier.text !== 'typespun'
      )
        continue;
      const moduleSymbol = checker.getSymbolAtLocation(specifier);
      if (!moduleSymbol) continue;
      for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
        symbols.set(
          symbol.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(symbol)
            : symbol,
          symbol.name,
        );
      }
    }
  }
  return symbols;
}

export function readAnnotations(
  node: ts.Node,
  report: Report,
  checker?: ts.TypeChecker,
  symbols?: Map<ts.Symbol, string>,
): Annotations {
  const result: Annotations = {
    root: false,
    ignore: false,
    secret: false,
    hasDefault: false,
  };
  for (const tag of ts.getJSDocTags(node)) {
    const text = ts.getTextOfJSDocComment(tag.comment)?.trim() ?? '';
    switch (tag.tagName.text) {
      case 'typespun':
        result.root = true;
        break;
      case 'ignore':
        result.ignore = true;
        break;
      case 'secret':
        result.secret = true;
        break;
      case 'key':
        result.key = text;
        break;
      case 'env':
        result.env = text;
        break;
      case 'default':
        try {
          result.defaultValue = JSON.parse(text);
          result.hasDefault = true;
        } catch {
          report(
            'invalid_default',
            'Inline defaults must use valid JSON.',
            tag,
          );
        }
        break;
    }
  }
  if (checker && symbols && ts.canHaveDecorators(node)) {
    for (const decorator of ts.getDecorators(node) ?? []) {
      if (!ts.isCallExpression(decorator.expression)) continue;
      const call = decorator.expression;
      let symbol = checker.getSymbolAtLocation(call.expression);
      if (symbol?.flags && symbol.flags & ts.SymbolFlags.Alias)
        symbol = checker.getAliasedSymbol(symbol);
      const name = symbol && symbols.get(symbol);
      if (!name) continue;
      if (name === 'Config') result.root = true;
      if (name === 'Ignore') result.ignore = true;
      if (name === 'Secret') result.secret = true;
      if (name === 'Default' || name === 'Key' || name === 'Env') {
        const value =
          call.arguments.length === 1 && call.arguments[0]
            ? evaluateDefault(call.arguments[0], checker)
            : ({ ok: false } as const);
        if (!value.ok) {
          report(
            name === 'Default' ? 'invalid_default' : 'invalid_annotation',
            'Annotation arguments must be supported static values.',
            decorator,
          );
          continue;
        }
        if (name === 'Default') {
          result.hasDefault = true;
          result.defaultValue = value.value;
        } else if (typeof value.value !== 'string')
          report(
            'invalid_annotation',
            'Key and Env require a string.',
            decorator,
          );
        else if (name === 'Key') result.key = value.value;
        else result.env = value.value;
      }
    }
  }
  return result;
}
