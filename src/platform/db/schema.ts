/**
 * Standard table-columns convention for every pilot-owned table:
 * a uuid primary key, and UTC creation/update timestamps. Tables whose rows
 * belong to a pilot additionally carry a non-nullable pilot foreign key with a
 * defined deletion behavior (declared per table). The updated-at column is
 * maintained by the `set_updated_at` trigger created in migration 002.
 *
 * This module owns the convention: the DDL in the shipped migrations is
 * asserted against these canonical snippets by the schema test.
 */
export const STANDARD_COLUMNS = ['id', 'created_at', 'updated_at'] as const

export type StandardColumn = (typeof STANDARD_COLUMNS)[number]

export const STANDARD_COLUMN_SQL =
  'id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ' +
  'created_at timestamptz NOT NULL DEFAULT now(), ' +
  'updated_at timestamptz NOT NULL DEFAULT now()'

export const STANDARD_TIMESTAMPS_SQL =
  'created_at timestamptz NOT NULL DEFAULT now(), ' +
  'updated_at timestamptz NOT NULL DEFAULT now()'

/**
 * Canonical DDL for a pilot-owned table: standard columns plus the extra
 * columns, with the standard trigger attached. Migrations declare their own DDL
 * for review; this produced the canonical form the schema test checks against.
 */
export function standardTableSql(table: string, extraColumns: readonly string[]): string {
  const columns = [...extraColumns, STANDARD_COLUMN_SQL].join(', ')
  return [
    `CREATE TABLE ${table} (${columns})`,
    `CREATE TRIGGER ${table}_set_updated_at BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
  ].join(';\n')
}

/**
 * Assert that a table's DDL text carries the standard columns and the
 * updated-at trigger. Used by the schema test to keep shipped migrations honest
 * to the convention.
 */
export function hasStandardColumns(table: string, ddl: string): boolean {
  const normalized = ddl.toLowerCase()
  const tableBlock = extractTableBlock(normalized, table)
  if (!tableBlock) return false
  return (
    tableBlock.includes('id uuid primary key') &&
    tableBlock.includes('created_at timestamptz') &&
    tableBlock.includes('updated_at timestamptz') &&
    normalized.includes(`${table}_set_updated_at`)
  )
}

/** Roughly isolate one `CREATE TABLE <name> (...)` block from a migration body. */
export function extractTableBlock(normalizedSql: string, table: string): string {
  const marker = `create table ${table} (`
  const start = normalizedSql.indexOf(marker)
  if (start < 0) return ''
  const balance = fromIndex(normalizedSql, start + marker.length)
  return balance
}

function fromIndex(sql: string, cursor: number): string {
  let depth = 1
  let i = cursor
  for (; i < sql.length; i++) {
    if (sql[i] === '(') depth += 1
    else if (sql[i] === ')') {
      depth -= 1
      if (depth === 0) return sql.slice(cursor, i)
    }
  }
  return ''
}
