import arrowFunctionsOnly from './arrow-functions-only.js';
import awaitOnOwnLine from './await-on-own-line.js';
import blankLineAroundBlocks from './blank-line-around-blocks.js';
import conciseArrowBody from './concise-arrow-body.js';
import noCompoundConditions from './no-compound-conditions.js';
import noTryCatch from './no-try-catch.js';
import preferEsToolkit from './prefer-es-toolkit.js';
import preferSwitch from './prefer-switch.js';

export default {
  meta: { name: 'repo' },
  rules: {
    'arrow-functions-only': arrowFunctionsOnly,
    'await-on-own-line': awaitOnOwnLine,
    'blank-line-around-blocks': blankLineAroundBlocks,
    'concise-arrow-body': conciseArrowBody,
    'no-compound-conditions': noCompoundConditions,
    'no-try-catch': noTryCatch,
    'prefer-es-toolkit': preferEsToolkit,
    'prefer-switch': preferSwitch,
  },
};
