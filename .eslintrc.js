module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    'react-native/no-inline-styles': 'off',
    'react/react-in-jsx-scope': 'off',
    curly: ['error', 'multi-line'],
    // Allow the _name convention for intentionally-unused destructured bindings
    '@typescript-eslint/no-unused-vars': [
      'error',
      { vars: 'all', args: 'after-used', ignoreRestSiblings: true, varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
    ],
  },
};
