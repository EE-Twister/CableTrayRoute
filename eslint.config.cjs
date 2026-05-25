module.exports = [
  {
    ignores: ['dist/**', 'docs/**', 'node_modules/**', 'playwright-tests/**'],
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 2025,
    },
    rules: {
      'no-restricted-globals': ['error', {
        name: 'localStorage',
        message: 'Access storage through projectStorage.js helpers (setAuthContextState, getAuthContextState, readAppSetting, writeAppSetting, etc.).',
      }],
    },
  },
  {
    // Storage layer files are permitted to access localStorage directly.
    files: ['projectStorage.js', 'dataStore.mjs'],
    rules: { 'no-restricted-globals': 'off' },
  },
];
