// EVERY DOOR IS A SEAM. oxlint has no rule that
// refuses `require()` of a module, so this plugin carries the one door rule it lacks: outside
// src/seams/, `require('child_process')`, `require('http')`, `require('https')` and
// `require('net')` are refused, as the same four modules are refused by `import` in .oxlintrc.json.

const NODE_CORE_DOORS = new Set(['child_process', 'http', 'https', 'net']);

const rule = {
  create(context) {
    return {
      CallExpression(node) {
        const [firstArgument] = node.arguments;
        const isRequireOfADoor =
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          firstArgument !== undefined &&
          firstArgument.type === 'Literal' &&
          NODE_CORE_DOORS.has(firstArgument.value);

        if (isRequireOfADoor) {
          context.report({
            node,
            message:
              'A door outside src/seams/ - this module belongs to the live half of the seam that owns it, reached only from its seam or from another live half (see packages/cli/src/__tests__/doors-are-seams.test.ts).',
          });
        }
      },
    };
  },
};

module.exports = {
  meta: { name: 'doors' },
  rules: { 'no-require-of-a-door': rule },
};
