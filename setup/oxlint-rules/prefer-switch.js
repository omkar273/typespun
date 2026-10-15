const MIN_BRANCHES = 3;
const EQUALITY = new Set(['===', '==']);

const isLiteral = (node) =>
  node.type === 'Literal' ||
  (node.type === 'TemplateLiteral' && node.expressions.length === 0);

// Source texts of the sides a `x === value` test could be switching on.
const subjectsOf = (test, source) => {
  if (test.type === 'LogicalExpression' && test.operator === '||') {
    const left = subjectsOf(test.left, source);
    const right = subjectsOf(test.right, source);

    return left && right ? left.filter((text) => right.includes(text)) : null;
  }

  if (test.type !== 'BinaryExpression' || !EQUALITY.has(test.operator))
    return null;
  if (isLiteral(test.right)) return [source.getText(test.left)];
  if (isLiteral(test.left)) return [source.getText(test.right)];
  return [source.getText(test.left), source.getText(test.right)];
};

export default {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      preferSwitch:
        'This `if`/`else if` chain compares `{{subject}}` against {{count}} values. Use a `switch` instead.',
    },
  },
  create(context) {
    const source = context.sourceCode;

    return {
      IfStatement: (node) => {
        const parent = node.parent;
        if (parent?.type === 'IfStatement' && parent.alternate === node) return;

        let subjects = null;
        let count = 0;
        let branch = node;

        while (branch?.type === 'IfStatement') {
          const found = subjectsOf(branch.test, source);
          if (!found) break;
          const shared = subjects
            ? found.filter((text) => subjects.includes(text))
            : found;
          if (shared.length === 0) break;
          subjects = shared;
          count += 1;
          branch = branch.alternate;
        }

        if (count < MIN_BRANCHES) return;
        context.report({
          node,
          messageId: 'preferSwitch',
          data: { subject: subjects[0], count: String(count) },
        });
      },
    };
  },
};
