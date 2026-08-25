import { Pool } from 'pg'

/**
 * A database health probe: resolves `true` when a `SELECT 1` against the
 * database succeeds within the timeout, `false` otherwise. Uses a short-lived,
 * single-connection pool so a readiness probe never leaks connections or holds
 * a long-lived pool open; the real pooled access layer arrives with the data
 * foundation.
 */
export function createDatabaseHealthProbe(databaseUrl: string): () => Promise<boolean> {
  return async () => {
    const probe = new Pool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 2000,
    })
    try {
      await probe.query('SELECT 1')
      return true
    } catch {
      return false
    } finally {
      await probe.end().catch(() => undefined)
    }
  }
}
