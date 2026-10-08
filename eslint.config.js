import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/release/**',
      '**/coverage/**',
      'legacy/**',
      '.private/**',
      '.claude/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Plain Node scripts (privacy scan, hook installer, fixture maker, dev launcher)
  {
    files: ['**/*.mjs', '**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },

  // The app's screens run in a browser window
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // A page gets the day's data from the main process, through the channel list. It never
      // opens the database or reads a file itself.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@loadout/storage', '@loadout/storage/*', '@loadout/core/importers'],
              message: 'Pages ask the main process through a channel (see docs/PAGE-PATTERN.md).',
            },
            {
              group: ['electron', 'electron/*', 'node:*'],
              message: 'Pages run in a browser window.',
            },
          ],
        },
      ],
    },
  },

  // Tests of the screens run in Node, so they may read files.
  {
    files: ['apps/desktop/src/renderer/**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-imports': 'off' },
  },

  // The main process and the bridge to the screens run in Node
  {
    files: ['apps/desktop/src/main/**/*.ts', 'apps/desktop/src/preload/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },

  // The core must stay free of Electron and browser code
  {
    files: ['packages/core/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['electron', 'electron/*'], message: 'The core must not import Electron.' },
            {
              group: ['react', 'react-dom', 'react/*'],
              message: 'The core must not import React.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'The core must not use the browser.' },
        { name: 'document', message: 'The core must not use the browser.' },
        { name: 'localStorage', message: 'The core must not use the browser.' },
      ],
    },
  },
);
