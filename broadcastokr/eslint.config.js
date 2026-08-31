import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // The codebase marks intentionally-unused params with a leading underscore
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Providers and their consumer hooks are colocated by design; the only
    // cost is HMR granularity, not correctness.
    files: ['src/context/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // FF-2: the domain layer stays UI- and edition-neutral. An edition branch
    // inside krProgress() would be the beginning of the fork.
    // (Known debt: utils/importExport imports the store — tracked, not fenced yet.)
    files: ['src/utils/**/*.ts', 'src/types/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/pages/**', '**/components/**', '**/context/**', '**/editions/**', '**/hooks/**'],
          message: 'Domain layer (utils/types) must not import UI or edition code.',
        }],
      }],
    },
  },
  {
    // The store may consume the entitlements gate, but never UI.
    files: ['src/store/**/*.ts'],
    ignores: ['src/store/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/pages/**', '**/components/**', '**/context/**', '**/hooks/**'],
          message: 'The store must not import UI code.',
        }],
      }],
    },
  },
])
