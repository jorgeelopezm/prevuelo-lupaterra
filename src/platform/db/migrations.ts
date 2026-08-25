import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { PoolFacade, Queryable, SqlQueryResult } from './pool.js'

/** One forward-only migration, loaded from a `NNN_name.sql` file. */
export interface MigrationTemplate {
  version: number
  name: string
  sql: string
}

export const MIGRATIONS_TABLE = '_migrations'

/**
 * Apply pending migrations in ascending version order. Each migration runs
 * inside its own transaction and is recorded so a subsequent run skips it.
 * A transactional failure rolls back that migration, does not record it, and
 * halts the run — no later migration is attempted.
 */
export async function applyMigrations(
  pool: PoolFacade,
  templates: readonly MigrationTemplate[],
): Promise<number> {
  const ordered = [...templates]
    .filter((t) => t.sql.trim().length > 0)
    .sort((a, b) => a.version - b.version)

  await ensureMigrationsTable(pool)

  const appliedVersions = await loadAppliedVersions(pool)

  let applied = 0
  for (const template of ordered) {
    if (appliedVersions.has(template.version)) continue

    await pool.withTransaction(async (tx) => {
      await tx.query(template.sql)
      await recordMigration(tx, template)
    })
    appliedVersions.add(template.version)
    applied += 1
  }

  return applied
}

/** Read and sort `NNN_name.sql` files from a directory, templating dimension. */
export async function loadMigrationTemplates(
  dir: string,
  embeddingDimensions: number,
): Promise<MigrationTemplate[]> {
  const entries = await readdir(dir)
  const files = entries.filter((name) => /^\d+_.+\.sql$/.test(name)).sort()

  const templates: MigrationTemplate[] = []
  for (const file of files) {
    const match = /^(\d+)_(.+)\.sql$/.exec(file)
    if (!match) continue
    const raw = await readFile(join(dir, file), 'utf8')
    const sql = raw.replaceAll('__EMBEDDING_DIMENSIONS__', String(embeddingDimensions))
    templates.push({ version: Number(match[1]), name: match[2] as string, sql })
  }
  return templates
}

async function ensureMigrationsTable(pool: PoolFacade): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      version integer PRIMARY KEY,
      name text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`,
  )
}

async function loadAppliedVersions(pool: PoolFacade): Promise<Set<number>> {
  const result: SqlQueryResult<{ version: number }> = await pool.query(
    `SELECT version FROM ${MIGRATIONS_TABLE}`,
  )
  return new Set(result.rows.map((row) => Number(row.version)))
}

async function recordMigration(tx: Queryable, template: MigrationTemplate): Promise<void> {
  await tx.query(`INSERT INTO ${MIGRATIONS_TABLE} (version, name) VALUES ($1, $2)`, [
    template.version,
    template.name,
  ])
}
