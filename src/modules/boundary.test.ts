import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'

import { moduleBoundaryRule } from '../../eslint/rules/module-boundary.mjs'

const FIXTURE = 'src/modules/weather/__lint-fixtures__/imports-documents.ts'

async function lintWithBoundaryRule(targets: string[]) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      ...tseslint.configs.recommended,
      {
        files: ['src/modules/**/*.ts'],
        plugins: {
          'module-boundary': { rules: { 'no-cross-module-import': moduleBoundaryRule } },
        },
        rules: { 'module-boundary/no-cross-module-import': 'error' },
      },
    ],
    fix: false,
  })
  return eslint.lintFiles(targets)
}

function boundaryErrors(result: { messages: Array<{ ruleId: string | null; message: string }> }) {
  return result.messages.filter((m) => m.ruleId === 'module-boundary/no-cross-module-import')
}

test('the module-boundary lint rule fires on a cross-module import', async () => {
  const [result] = await lintWithBoundaryRule([FIXTURE])
  assert.ok(result, 'the fixture must be linted')
  const errors = boundaryErrors(result)
  assert.ok(errors.length >= 1, 'a cross-module import must be reported')
  const message = (errors[0]?.message ?? '').toLowerCase()
  assert.match(message, /must not import from another feature module/)
  assert.match(message, /weather/)
  assert.match(message, /documents/)
})

test('compliant module files and the registry import only shared platform services', async () => {
  const results = await lintWithBoundaryRule([
    'src/modules/dashboard/index.ts',
    'src/modules/shared/placeholder.ts',
    'src/modules/registry.ts',
    'src/modules/types.ts',
  ])
  for (const result of results) {
    assert.deepEqual(
      boundaryErrors(result),
      [],
      `${result.filePath} must not trigger the boundary rule`,
    )
  }
})
