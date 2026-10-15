import ts from 'typescript';
import { attempt } from '../internal/attempt.js';
import { evaluateDefault, type StaticValue } from './default-expression.js';

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

export interface AnnotationContext {
  readonly report: Report;
  readonly checker: ts.TypeChecker;
  readonly symbols: Map<ts.Symbol, string>;
}

export const resolveAlias = (symbol: ts.Symbol, checker: ts.TypeChecker) =>
  (symbol.flags & ts.SymbolFlags.Alias) === 0
    ? symbol
    : checker.getAliasedSymbol(symbol);

const isTypespunSpecifier = (
  specifier: ts.Expression | undefined,
): specifier is ts.StringLiteral =>
  specifier !== undefined &&
  ts.isStringLiteral(specifier) &&
  specifier.text === 'typespun';

export const typespunSymbols = (
  program: ts.Program,
): Map<ts.Symbol, string> => {
  const checker = program.getTypeChecker();
  const symbols = new Map<ts.Symbol, string>();

  for (const source of program.getSourceFiles()) {
    for (const statement of source.statements) {
      const isModuleReference =
        ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement);
      if (!isModuleReference) continue;
      const specifier = statement.moduleSpecifier;
      if (!isTypespunSpecifier(specifier)) continue;
      const moduleSymbol = checker.getSymbolAtLocation(specifier);
      if (moduleSymbol === undefined) continue;

      for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
        symbols.set(resolveAlias(symbol, checker), symbol.name);
      }
    }
  }

  return symbols;
};

const tagAnnotations = (
  tag: ts.JSDocTag,
  report: Report,
): Partial<Annotations> => {
  const text = ts.getTextOfJSDocComment(tag.comment)?.trim() ?? '';

  switch (tag.tagName.text) {
    case 'typespun':
      return { root: true };
    case 'ignore':
      return { ignore: true };
    case 'secret':
      return { secret: true };
    case 'key':
      return { key: text };
    case 'env':
      return { env: text };
    case 'default': {
      const parsed = attempt((): unknown => JSON.parse(text));
      if (parsed.ok) return { defaultValue: parsed.data, hasDefault: true };
      report('invalid_default', 'Inline defaults must use valid JSON.', tag);
      return {};
    }
    default:
      return {};
  }
};

const staticArgument = (
  call: ts.CallExpression,
  checker: ts.TypeChecker,
): StaticValue => {
  const [argument] = call.arguments;
  return call.arguments.length === 1 && argument !== undefined
    ? evaluateDefault(argument, checker)
    : { ok: false };
};

interface ValueDecorator {
  readonly name: string;
  readonly call: ts.CallExpression;
  readonly decorator: ts.Decorator;
}

const valueAnnotations = (
  { name, call, decorator }: ValueDecorator,
  context: AnnotationContext,
): Partial<Annotations> => {
  const value = staticArgument(call, context.checker);

  if (!value.ok) {
    context.report(
      name === 'Default' ? 'invalid_default' : 'invalid_annotation',
      'Annotation arguments must be supported static values.',
      decorator,
    );
    return {};
  }

  if (name === 'Default')
    return { hasDefault: true, defaultValue: value.value };

  if (typeof value.value !== 'string') {
    context.report(
      'invalid_annotation',
      'Key and Env require a string.',
      decorator,
    );
    return {};
  }

  return name === 'Key' ? { key: value.value } : { env: value.value };
};

const decoratorAnnotations = (
  decorator: ts.Decorator,
  context: AnnotationContext,
): Partial<Annotations> => {
  const call = decorator.expression;
  if (!ts.isCallExpression(call)) return {};
  const symbol = context.checker.getSymbolAtLocation(call.expression);
  if (symbol === undefined) return {};
  const name = context.symbols.get(resolveAlias(symbol, context.checker));
  if (name === undefined) return {};

  switch (name) {
    case 'Config':
      return { root: true };
    case 'Ignore':
      return { ignore: true };
    case 'Secret':
      return { secret: true };
    case 'Default':
    case 'Key':
    case 'Env':
      return valueAnnotations({ name, call, decorator }, context);
    default:
      return {};
  }
};

export const readAnnotations = (
  node: ts.Node,
  context: AnnotationContext,
): Annotations => {
  let result: Annotations = {
    root: false,
    ignore: false,
    secret: false,
    hasDefault: false,
  };

  for (const tag of ts.getJSDocTags(node))
    result = { ...result, ...tagAnnotations(tag, context.report) };

  if (ts.canHaveDecorators(node)) {
    for (const decorator of ts.getDecorators(node) ?? [])
      result = { ...result, ...decoratorAnnotations(decorator, context) };
  }

  return result;
};
