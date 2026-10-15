import ts from 'typescript';

export type StaticValue =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false };
const invalid: StaticValue = { ok: false };

type WrappedExpression =
  | ts.ParenthesizedExpression
  | ts.AsExpression
  | ts.SatisfiesExpression
  | ts.TypeAssertion;

type NegatedNumber = ts.PrefixUnaryExpression & {
  readonly operand: ts.NumericLiteral;
};

type NamedAssignment = ts.PropertyAssignment & {
  readonly name: ts.Identifier | ts.StringLiteral;
};

const WRAPPER_KINDS = new Set([
  ts.SyntaxKind.ParenthesizedExpression,
  ts.SyntaxKind.AsExpression,
  ts.SyntaxKind.SatisfiesExpression,
  ts.SyntaxKind.TypeAssertionExpression,
]);

const RESERVED_KEYS = ['__proto__', 'constructor', 'prototype'];

const isWrapped = (
  expression: ts.Expression,
): expression is WrappedExpression => WRAPPER_KINDS.has(expression.kind);

const isNegatedNumber = (
  expression: ts.Expression,
): expression is NegatedNumber => {
  const negated =
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.MinusToken;
  return negated && ts.isNumericLiteral(expression.operand);
};

const isNamedAssignment = (
  property: ts.ObjectLiteralElementLike,
): property is NamedAssignment => {
  if (!ts.isPropertyAssignment(property)) return false;
  return ts.isIdentifier(property.name) || ts.isStringLiteral(property.name);
};

const finiteNumber = (value: number): StaticValue =>
  Number.isFinite(value) ? { ok: true, value } : invalid;

const evaluateArray = (
  expression: ts.ArrayLiteralExpression,
  checker: ts.TypeChecker,
): StaticValue => {
  const values: unknown[] = [];

  for (const element of expression.elements) {
    const result = evaluateDefault(element, checker);
    if (!result.ok) return invalid;
    values.push(result.value);
  }

  return { ok: true, value: values };
};

const evaluateObject = (
  expression: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker,
): StaticValue => {
  const value: Record<string, unknown> = {};

  for (const property of expression.properties) {
    if (!isNamedAssignment(property)) return invalid;
    const key = property.name.text;
    if (RESERVED_KEYS.includes(key) || Object.hasOwn(value, key))
      return invalid;
    const result = evaluateDefault(property.initializer, checker);
    if (!result.ok) return invalid;
    value[key] = result.value;
  }

  return { ok: true, value };
};

const evaluateEnumMember = (
  expression: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  checker: ts.TypeChecker,
): StaticValue => {
  const symbol = checker.getSymbolAtLocation(
    ts.isPropertyAccessExpression(expression) ? expression.name : expression,
  );
  if (symbol === undefined) return invalid;
  if ((symbol.flags & ts.SymbolFlags.EnumMember) === 0) return invalid;

  const declaration = symbol.valueDeclaration;
  const value =
    declaration !== undefined && ts.isEnumMember(declaration)
      ? checker.getConstantValue(declaration)
      : undefined;
  return typeof value === 'string' ? { ok: true, value } : invalid;
};

/** Reads syntax only. No schema expressions or user modules are executed. */
export const evaluateDefault = (
  expression: ts.Expression,
  checker: ts.TypeChecker,
): StaticValue => {
  if (isWrapped(expression))
    return evaluateDefault(expression.expression, checker);

  if (ts.isStringLiteral(expression))
    return { ok: true, value: expression.text };

  if (ts.isNumericLiteral(expression))
    return finiteNumber(Number(expression.text));

  if (expression.kind === ts.SyntaxKind.TrueKeyword)
    return { ok: true, value: true };
  if (expression.kind === ts.SyntaxKind.FalseKeyword)
    return { ok: true, value: false };

  if (isNegatedNumber(expression))
    return finiteNumber(-Number(expression.operand.text));

  if (ts.isArrayLiteralExpression(expression))
    return evaluateArray(expression, checker);

  if (ts.isObjectLiteralExpression(expression))
    return evaluateObject(expression, checker);

  if (
    ts.isPropertyAccessExpression(expression) ||
    ts.isElementAccessExpression(expression)
  )
    return evaluateEnumMember(expression, checker);

  return invalid;
};
