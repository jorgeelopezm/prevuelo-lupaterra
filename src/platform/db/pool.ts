import { Pool as PgPool } from 'pg'
import type { QueryResultRow } from 'pg'

/** Base row shape for query results; callers narrow it with their own Row type. */
export type DbRow = Record<string, unknown>

export interface SqlQueryResult<Row extends QueryResultRow = DbRow> {
  rows: Row[]
}

/** Something that can run parameterized statements. */
export interface Queryable {
  query<Row extends QueryResultRow = DbRow>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>>
}

/**
 * Data-access seam shared by every repository and the migration runner. The
 * application never talks to `pg.Pool` directly; it talks to this interface,
 * which keeps the transaction-boundary contract testable without a live server.
 */
export interface PoolFacade extends Queryable {
  /**
   * Run a unit of work inside one transaction. The transaction commits when the
   * callback resolves and rolls back when it throws; the pooled connection is
   * always returned to the pool afterwards.
   */
  withTransaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>
  end(): Promise<void>
}

class PgPoolFacade implements PoolFacade {
  constructor(private readonly pool: PgPool) {}

  query<Row extends QueryResultRow = DbRow>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>> {
    return this.pool.query<Row>(sql, (params ?? []) as unknown[]) as unknown as Promise<
      SqlQueryResult<Row>
    >
  }

  async withTransaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const tx: Queryable = {
        query: <Row extends QueryResultRow = DbRow>(sql: string, params?: readonly unknown[]) =>
          client.query<Row>(sql, (params ?? []) as unknown[]) as unknown as Promise<
            SqlQueryResult<Row>
          >,
      }
      const out = await work(tx)
      await client.query('COMMIT')
      return out
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // The connection may already be broken; the original error is the truth.
      }
      throw error
    } finally {
      // Always release: commit path, rollback path, and connection-error path.
      client.release()
    }
  }

  async end(): Promise<void> {
    await this.pool.end()
  }
}

/**
 * Create the PostgreSQL-backed pool facade. `connectionString` is the validated
 * DATABASE_URL from the shared configuration schema.
 */
export function createPool(connectionString: string): PoolFacade {
  return new PgPoolFacade(new PgPool({ connectionString, max: 10 }))
}
