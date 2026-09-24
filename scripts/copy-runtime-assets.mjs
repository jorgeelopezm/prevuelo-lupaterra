#!/usr/bin/env node
/**
 * Copy the runtime assets that `tsc` does not emit into `dist/app`.
 * TypeScript compiles only `.ts` sources, so files read at runtime through
 * `fs`/`URL` resolution must be copied by hand:
 *
 *   - i18n translation catalogs (`src/platform/i18n/catalogs/*.json`), loaded by
 *     `platform/i18n/catalog.ts` via `new URL('./catalogs/<locale>.json', …)`.
 *   - Nunjucks templates (`src/views/**`), loaded by the view renderer's
 *     `FileSystemLoader` from `dist/app/views`.
 *
 * Run as part of `npm run build`, after `tsc`.
 */
import { cpSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootUrl = new URL('..', import.meta.url)

// Source → destination, both relative to the repository root. The destination
// parent is created first so `cpSync` creates each target directory with the
// source's contents (matching `cp -r src dest` when `dest` is absent).
const copies = [
  ['src/platform/i18n/catalogs/', 'dist/app/platform/i18n/catalogs/'],
  ['src/views/', 'dist/app/views/'],
]

for (const [from, to] of copies) {
  const fromPath = fileURLToPath(new URL(from, rootUrl))
  const toPath = fileURLToPath(new URL(to, rootUrl))
  mkdirSync(dirname(toPath), { recursive: true })
  cpSync(fromPath, toPath, { recursive: true })
}

console.log(`runtime assets copied → ${copies.map(([, to]) => to).join(', ')}`)
