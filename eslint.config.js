import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '.scratch/**', '.ralph/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Node scripts (build watchers) run outside the browser bundle.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    // The domain core must not depend on any runtime technology.
    // Dependency direction is enforced here and by tests/architecture/core-boundaries.test.ts.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'chrome',
                'chrome/*',
                'react',
                'react/*',
                'vue',
                'vue/*',
                'node:*',
                '@adapters/*',
                '@app',
                '../adapters/*',
                '../app/*',
                '../../adapters/*',
                '../../app/*',
              ],
              message:
                'review-core is the domain core: it may only import from within src/core.',
            },
          ],
        },
      ],
    },
  },
);
