// Deliberately minimal lint: catch the bug classes that have actually bitten this
// codebase — undefined variables (a missing useState declaration shipped once) and
// React hooks-order violations (a conditional useState shipped once). Style rules
// are intentionally absent; this must stay fast and low-noise.
const globals = require('globals');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
  {
    files: ['client/src/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    rules: {
      'no-undef': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
  {
    files: ['server/**/*.js'],
    ignores: ['server/uploads/**', 'server/uploads-private/**'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-undef': 'error',
    },
  },
];
