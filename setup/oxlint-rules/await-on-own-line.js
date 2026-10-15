const HOSTS = new Set([
  'VariableDeclarator',
  'AssignmentExpression',
  'ReturnStatement',
  'ExpressionStatement',
  'ArrowFunctionExpression',
  'ThrowStatement',
  'ForOfStatement',
  'AwaitExpression',
]);

const WRAPPERS = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
]);

const ASSERTIONS = new Set(['TSAsExpression', 'TSTypeAssertion']);

const host = (node) => {
  let parent = node.parent;
  while (WRAPPERS.has(parent?.type)) parent = parent.parent;
  return parent;
};

export default {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      nested:
        'An `await` inside a larger expression hides the pause. Await into a `const` first, then use the value.',
      assertion:
        'Do not assert the type of an awaited value inline. Await into a binding on its own line, then annotate or assert that binding.',
    },
  },
  create(context) {
    return {
      AwaitExpression: (node) => {
        if (ASSERTIONS.has(node.parent?.type)) {
          context.report({ node: node.parent, messageId: 'assertion' });
          return;
        }

        if (HOSTS.has(host(node)?.type)) return;
        context.report({ node, messageId: 'nested' });
      },
    };
  },
};
