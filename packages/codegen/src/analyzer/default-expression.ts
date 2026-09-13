import ts from 'typescript';

export type StaticValue =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false };
const invalid: StaticValue = { ok: false };

/** Reads syntax only. No schema expressions or user modules are executed. */
export function evaluateDefault(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): StaticValue {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  ) {
    return evaluateDefault(expression.expression, checker);
  }
  if (ts.isStringLiteral(expression))
    return { ok: true, value: expression.text };
  if (ts.isNumericLiteral(expression)) {
    const value = Number(expression.text);
    return Number.isFinite(value) ? { ok: true, value } : invalid;
  }
  if (expression.kind === ts.SyntaxKind.TrueKeyword)
    return { ok: true, value: true };
  if (expression.kind === ts.SyntaxKind.FalseKeyword)
    return { ok: true, value: false };
  if (
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expression.operand)
  ) {
    const value = -Number(expression.operand.text);
    return Number.isFinite(value) ? { ok: true, value } : invalid;
  }
  if (ts.isArrayLiteralExpression(expression)) {
    const values: unknown[] = [];
    for (const element of expression.elements) {
      const result = evaluateDefault(element, checker);
      if (!result.ok) return invalid;
      values.push(result.value);
    }
    return { ok: true, value: values };
  }
  if (ts.isObjectLiteralExpression(expression)) {
    const value: Record<string, unknown> = {};
    for (const property of expression.properties) {
      if (
        !ts.isPropertyAssignment(property) ||
        !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
      )
        return invalid;
      const key = property.name.text;
      if (
        ['__proto__', 'constructor', 'prototype'].includes(key) ||
        Object.hasOwn(value, key)
      )
        return invalid;
      const result = evaluateDefault(property.initializer, checker);
      if (!result.ok) return invalid;
      value[key] = result.value;
    }
    return { ok: true, value };
  }
  if (
    ts.isPropertyAccessExpression(expression) ||
    ts.isElementAccessExpression(expression)
  ) {
    const symbol = checker.getSymbolAtLocation(
      ts.isPropertyAccessExpression(expression) ? expression.name : expression,
    );
    if (symbol?.flags && symbol.flags & ts.SymbolFlags.EnumMember) {
      const declaration = symbol.valueDeclaration;
      const value =
        declaration && ts.isEnumMember(declaration)
          ? checker.getConstantValue(declaration)
          : undefined;
      if (typeof value === 'string') return { ok: true, value };
    }
  }
  return invalid;
}
