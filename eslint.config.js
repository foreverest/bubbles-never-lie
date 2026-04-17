import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['coverage/**', 'dist/**', 'node_modules/**', 'package-lock.json'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
  {
    files: ['src/client/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
    },
  },
  {
    files: ['src/client/app.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: [
      'src/server/**/*.{ts,tsx}',
      'tools/**/*.{js,mjs,ts}',
      '*.config.{js,mjs,ts}',
      'vite.config.ts',
      'vitest.config.ts',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.test.ts'],
    plugins: vitest.configs.recommended.plugins,
    languageOptions: {
      globals: {
        ...globals.node,
        ...vitest.configs.env.languageOptions.globals,
      },
    },
    rules: vitest.configs.recommended.rules,
  },
  prettier
);
