import * as toolkit from 'es-toolkit';

// Each package has its own private `attempt`.
const OWN_NAMES = new Set(['attempt', 'attemptAsync']);

const ES_TOOLKIT = new Map(
  Object.keys(toolkit)
    .filter((name) => /^[a-z]/.test(name) && !OWN_NAMES.has(name))
    .map((name) => [name.toLowerCase(), name]),
);

const ALIASES = new Map([
  ['sleep', 'delay'],
  ['wait', 'delay'],
  ['unique', 'uniq'],
  ['uniqueby', 'uniqBy'],
  ['deepclone', 'cloneDeep'],
  ['deepequal', 'isEqual'],
  ['deepmerge', 'merge'],
  ['average', 'mean'],
]);

const FUNCTION_INITS = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
]);

const toolkitName = (name) => {
  const key = name.toLowerCase();
  return ES_TOOLKIT.get(key) ?? ALIASES.get(key);
};

const isCall = (node, object, property) =>
  node?.type === 'CallExpression' &&
  node.callee.type === 'MemberExpression' &&
  node.callee.object.type === 'Identifier' &&
  node.callee.object.name === object &&
  node.callee.property.name === property;

const isJsonRoundTrip = (node) =>
  isCall(node, 'JSON', 'parse') &&
  isCall(node.arguments[0], 'JSON', 'stringify');

const isMinMaxClamp = (node) => {
  const isMathMinOrMax =
    isCall(node, 'Math', 'min') || isCall(node, 'Math', 'max');
  if (!isMathMinOrMax) return false;
  const inner = isCall(node, 'Math', 'min') ? 'max' : 'min';
  return node.arguments.some((argument) => isCall(argument, 'Math', inner));
};

export default {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      named:
        '`es-toolkit` already has `{{name}}`. Import it (`import { {{name}} } from "es-toolkit"`) instead of writing your own.',
      pattern: 'Use `{{name}}` from `es-toolkit` instead of hand-rolling it.',
    },
  },
  create(context) {
    return {
      VariableDeclarator: (node) => {
        if (node.id.type !== 'Identifier') return;
        if (!FUNCTION_INITS.has(node.init?.type)) return;
        const name = toolkitName(node.id.name);
        if (name === undefined) return;
        context.report({ node: node.id, messageId: 'named', data: { name } });
      },
      CallExpression: (node) => {
        if (isJsonRoundTrip(node)) {
          context.report({
            node,
            messageId: 'pattern',
            data: { name: 'cloneDeep' },
          });
          return;
        }

        if (isMinMaxClamp(node)) {
          context.report({
            node,
            messageId: 'pattern',
            data: { name: 'clamp' },
          });
        }
      },
    };
  },
};
