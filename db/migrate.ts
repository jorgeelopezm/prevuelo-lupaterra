import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { ConfigError, loadConfig } from '../src/server/config.js'
import { createPool } from '../src/platform/db/pool.js'
import { applyMigrations, loadMigrationTemplates } from '../src/platform/db/migrations.js'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

/**
 * CLI: apply pending migrations to the configured database, then exit. Usage:
 *   DATABASE_URL=... EMBEDDING_DIMENSIONS=768 npm run db:migrate
 */
export async function main(): Promise<void> {
  let config
  try {
    config = loadConfig()
  } catch (error) {
    if (error instanceof ConfigError) console.error(error.message)
    else console.error(error)
    process.exitCode = 1
    return
  }

  const pool = createPool(config.DATABASE_URL)
  try {
    const templates = await loadMigrationTemplates(MIGRATIONS_DIR, config.EMBEDDING_DIMENSIONS)
    const applied = await applyMigrations(pool, templates)
    console.log(`migrations applied: ${applied}`)
  } finally {
    await pool.end()
  }
}

const isMain = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  void main()
}
