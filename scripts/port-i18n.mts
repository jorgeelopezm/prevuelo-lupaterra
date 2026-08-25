/**
 * One-off port: reads the prototype's `diseno/src/i18n.ts` `T` object and
 * writes the per-locale catalogs used by the server. Values that were encoded
 * as JSON arrays (e.g. `risk.l_illness`) become real arrays in the catalog.
 *
 * Generates:
 *   src/platform/i18n/catalogs/{en,es,pt}.json
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src', 'platform', 'i18n', 'catalogs')

// Import the prototype catalog under tsx (it is dependency-free).
const { T } = (await import(pathToFileURL(join(ROOT, 'diseno', 'src', 'i18n.ts')).href)) as {
  T: Record<string, Record<string, string>>
}

export type CatalogValue = string | string[]

/** Normalize a raw translated value: decode a JSON-encoded array into an array. */
export function normalize(value: string): string | string[] {
  if (value.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      // Not a JSON array after all; keep the literal string.
    }
  }
  return value
}

const locales = ['en', 'es', 'pt'] as const

for (const locale of locales) {
  const raw = T[locale]
  if (!raw) throw new Error(`diseno/i18n.ts has no keys for '${locale}'`)
  const catalog: Record<string, string | string[]> = {}
  for (const [key, value] of Object.entries(raw)) {
    catalog[key] = normalize(value)
  }
  await mkdir(OUT, { recursive: true })
  await writeFile(
    join(OUT, `${locale}.json`),
    `${JSON.stringify(catalog, null, 2)}\n`,
    'utf8',
  )
  console.log(`wrote ${locale}.json with ${Object.keys(catalog).length} keys`)
}