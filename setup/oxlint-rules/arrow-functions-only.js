const METHOD_HOSTS = new Set([
  'MethodDefinition',
  'TSAbstractMethodDefinition',
]);

const isMethod = (node) => {
  const parent = node.parent;
  if (METHOD_HOSTS.has(parent?.type)) return true;
  if (parent?.type !== 'Property') return false;
  return parent.method || parent.kind !== 'init';
};

export default {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      arrowOnly:
        'Use an arrow function: `const name = (...) => ...`. Class and object methods are the only other function form allowed.',
    },
  },
  create(context) {
    const check = (node) => {
      if (isMethod(node)) return;
      context.report({ node, messageId: 'arrowOnly' });
    };

    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
    };
  },
};
