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
  overrides: [
    {
      // The GitHub Action's library (actions/lib) is plain ES modules run by node
      // on a CI runner - no bundler, no TypeScript. The default parser config
      // here targets the app's .ts sources and cannot parse `import.meta`.
      files: ['*.mjs'],
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      env: { node: true, es2022: true },
    },
  ],
};
