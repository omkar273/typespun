export default {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      noTryCatch:
        "Use the package's private `attempt` helper (`runtime/attempt.ts` or `internal/attempt.ts`) instead of `try`/`catch` and branch on `ok`. This also keeps try blocks from nesting.",
    },
  },
  create(context) {
    return {
      TryStatement: (node) => {
        if (!node.handler) return;
        context.report({ node: node.handler, messageId: 'noTryCatch' });
      },
    };
  },
};
