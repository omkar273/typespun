const KEEP_BRACES = new Set([
  'AssignmentExpression',
  'UpdateExpression',
  'SequenceExpression',
]);

const soleStatement = (node) => {
  if (node.body.type !== 'BlockStatement') return null;
  if (node.body.body.length !== 1) return null;
  const [statement] = node.body.body;
  if (statement.type !== 'ExpressionStatement') return null;
  if (KEEP_BRACES.has(statement.expression.type)) return null;
  return statement.loc.start.line === statement.loc.end.line ? statement : null;
};

export default {
  meta: {
    type: 'suggestion',
    schema: [],
    fixable: 'code',
    messages: {
      concise:
        'A one-line arrow body takes no braces: write `() => expression`.',
    },
  },
  create(context) {
    const text = context.sourceCode.text ?? context.sourceCode.getText();

    return {
      ArrowFunctionExpression: (node) => {
        const statement = soleStatement(node);
        if (statement === null) return;
        const expression = text.slice(...statement.expression.range);
        const inner = text
          .slice(node.body.range[0] + 1, node.body.range[1] - 1)
          .trim();
        const onlyCode = inner === `${expression};` || inner === expression;
        context.report({
          node: node.body,
          messageId: 'concise',
          fix: onlyCode
            ? (fixer) => fixer.replaceText(node.body, expression)
            : null,
        });
      },
    };
  },
};
