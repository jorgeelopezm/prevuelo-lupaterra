import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'
import { moduleBoundaryRule } from './eslint/rules/module-boundary.mjs'

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      'dist/',
      'diseno/',
      'openspec/',
      '*.config.mjs',
      '.nvmrc',
      'src/modules/**/__lint-fixtures__/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ],
    },
  },
  {
    files: ['src/modules/**/*.ts'],
    plugins: {
      'module-boundary': { rules: { 'no-cross-module-import': moduleBoundaryRule } },
    },
    rules: {
      'module-boundary/no-cross-module-import': 'error',
    },
  },
)