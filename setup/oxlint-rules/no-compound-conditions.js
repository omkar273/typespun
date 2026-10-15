const LOGICAL = new Set(['&&', '||']);
const MAX_CLAUSES = 2;

const unwrap = (node) => {
  if (node?.type === 'ParenthesizedExpression') return unwrap(node.expression);
  if (node?.type === 'UnaryExpression' && node.operator === '!')
    return unwrap(node.argument);
  return node;
};

const countClauses = (node) => {
  const inner = unwrap(node);
  if (inner?.type !== 'LogicalExpression' || !LOGICAL.has(inner.operator))
    return 1;
  return countClauses(inner.left) + countClauses(inner.right);
};

export default {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      compound:
        'A condition with {{count}} clauses is hard to read inside `{{keyword}}`. Assign it to a `const` whose name says what it means, then branch on that.',
    },
  },
  create(context) {
    const check = (node, keyword) => {
      const count = countClauses(node.test);
      if (count <= MAX_CLAUSES) return;
      context.report({
        node: node.test,
        messageId: 'compound',
        data: { count: String(count), keyword },
      });
    };

    return {
      IfStatement: (node) => check(node, 'if'),
      WhileStatement: (node) => check(node, 'while'),
      DoWhileStatement: (node) => check(node, 'do while'),
      ConditionalExpression: (node) => check(node, '? :'),
      ForStatement: (node) => {
        if (node.test) check(node, 'for');
      },
    };
  },
};
