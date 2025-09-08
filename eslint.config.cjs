module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 2022,
    },
    rules: {},
  },
];
