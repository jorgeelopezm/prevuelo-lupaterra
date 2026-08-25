import type { QueryResultRow } from 'pg'

import type { DbRow, PoolFacade, Queryable, SqlQueryResult } from './pool.js'

/**
 * In-memory PoolFacade that simulates just enough Postgres for the migration
 * runner, transaction-boundary, and seed tests: BEGIN/COMMIT/ROLLBACK tracking,
 * the `_migrations` bookkeeping table, and the handful of seed statements.
 * It is a stand-in for real PostgreSQL, never a full database.
 */
export class FakePoolFacade implements PoolFacade {
  appliedVersions = new Set<number>()
  migrationOrder: number[] = []
  beginCount = 0
  commitCount = 0
  rollbackCount = 0
  releaseCount = 0
  /** A substring that makes the fake throw, simulating a failed statement. */
  failSql: string | null = null
  seen: Array<{ sql: string; params: readonly unknown[] }> = []

  // State simulation (seed + identity).
  pilots: Array<{
    id: string
    email: string
    display_name: string
    locale: string
    password_hash: string
    created_at: Date
    updated_at: Date
  }> = []
  sessions: Array<{
    id: string
    pilot_id: string
    token_hash: string
    expires_at: Date
    created_at: Date
  }> = []
  documents: Array<{ id: string; sourceReference: string }> = []
  chunks: Array<{ documentId: string; position: number }> = []
  private nextId = 1
  private txChanges: Array<() => void> = []
  private inTransaction = false

  async query<Row extends QueryResultRow = DbRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    this.seen.push({ sql, params })
    return this.exec(sql, params) as SqlQueryResult<Row>
  }

  async withTransaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
    this.beginCount += 1
    this.inTransaction = true
    this.txChanges = []
    const tx: Queryable = {
      query: async <Row2 extends QueryResultRow = DbRow>(
        s: string,
        p: readonly unknown[] = [],
      ): Promise<SqlQueryResult<Row2>> => {
        this.seen.push({ sql: s, params: p })
        return this.exec(s, p) as SqlQueryResult<Row2>
      },
    }
    try {
      const out = await work(tx)
      for (const apply of this.txChanges) apply()
      this.commitCount += 1
      return out
    } catch (error) {
      this.txChanges = []
      this.rollbackCount += 1
      throw error
    } finally {
      this.inTransaction = false
      this.releaseCount += 1
    }
  }

  async end(): Promise<void> {
    // nothing to release in memory
  }

  private exec(sql: string, params: readonly unknown[]): SqlQueryResult {
    if (this.failSql && sql.includes(this.failSql)) {
      throw new Error(`simulated statement failure: ${this.failSql}`)
    }

    const lower = sql.toLowerCase()

    if (lower.includes('create table if not exists _migrations')) {
      return { rows: [] }
    }
    if (lower.includes('select version from _migrations')) {
      return { rows: [...this.appliedVersions].map((version) => ({ version })) }
    }
    if (lower.includes('insert into _migrations')) {
      const version = Number(params[0])
      const name = params[1] as string
      const apply = () => {
        this.appliedVersions.add(version)
        this.migrationOrder.push(version)
      }
      if (this.inTransaction) this.txChanges.push(apply)
      else apply()
      void name
      return { rows: [] }
    }

    // --- pilots ---
    if (lower.includes('insert into pilots')) {
      const email = params[0] as string
      const display_name = params[1] as string
      const locale = params[2] as string
      const password_hash = params[3] as string
      const existing = this.pilots.find((p) => p.email.toLowerCase() === email.toLowerCase())
      if (existing) {
        // `ON CONFLICT (email) DO NOTHING` reports no row on conflict.
        if (lower.includes('do nothing')) return { rows: [] }
        // Upserts (`DO UPDATE`) and plain `create` return the row id.
        return { rows: [{ id: existing.id }] }
      }
      const id = `pilot-${this.nextId++}`
      const now = new Date()
      this.pilots.push({
        id,
        email,
        display_name,
        locale,
        password_hash,
        created_at: now,
        updated_at: now,
      })
      return { rows: [{ id }] }
    }
    if (lower.includes('update pilots set locale')) {
      const id = params[0] as string
      const locale = params[1] as string
      const row = this.pilots.find((p) => p.id === id)
      if (row) row.locale = locale
      return { rows: [] }
    }
    const pilotSelect = /from pilots where (email|id) = \$1/.exec(lower)
    if (lower.includes('from pilots') && pilotSelect) {
      const value = String(params[0])
      const row = this.pilots.find((p) =>
        pilotSelect[1] === 'email' ? p.email.toLowerCase() === value.toLowerCase() : p.id === value,
      )
      return { rows: row ? [row] : [] }
    }

    // --- sessions ---
    if (lower.includes('insert into sessions')) {
      const id = `session-${this.nextId++}`
      this.sessions.push({
        id,
        pilot_id: params[0] as string,
        token_hash: params[1] as string,
        expires_at: params[2] as Date,
        created_at: new Date(),
      })
      return { rows: [{ id }] }
    }
    if (lower.includes('delete from sessions where token_hash')) {
      const tokenHash = params[0] as string
      this.sessions = this.sessions.filter((s) => s.token_hash !== tokenHash)
      return { rows: [] }
    }
    if (lower.includes('delete from sessions where pilot_id')) {
      const pilotId = params[0] as string
      this.sessions = this.sessions.filter((s) => s.pilot_id !== pilotId)
      return { rows: [] }
    }
    const sessionJoin =
      /from sessions s join pilots p on p\.id = s\.pilot_id\s+where s\.token_hash = \$1/.exec(lower)
    if (sessionJoin) {
      const tokenHash = params[0] as string
      const session = this.sessions.find((s) => s.token_hash === tokenHash)
      if (!session) return { rows: [] }
      const pilot = this.pilots.find((p) => p.id === session.pilot_id)
      if (!pilot) return { rows: [] }
      return {
        rows: [
          {
            id: session.id,
            pilot_id: session.pilot_id,
            token_hash: session.token_hash,
            expires_at: session.expires_at,
            created_at: session.created_at,
            pilot__id: pilot.id,
            pilot__email: pilot.email,
            pilot__display_name: pilot.display_name,
            pilot__locale: pilot.locale,
            pilot__password_hash: pilot.password_hash,
            pilot__created_at: pilot.created_at,
            pilot__updated_at: pilot.updated_at,
          },
        ],
      }
    }
    const ownedSession = /from sessions\s+where id = \$1 and pilot_id = \$2/.exec(lower)
    if (ownedSession) {
      const sessionId = params[0] as string
      const pilotId = params[1] as string
      const row = this.sessions.find((s) => s.id === sessionId && s.pilot_id === pilotId)
      return { rows: row ? [row] : [] }
    }

    // --- seed documents / chunks ---
    if (lower.includes('insert into documents')) {
      const title = params[0] as string
      const category = params[1] as string
      const sourceReference = params[2] as string
      const locale = params[3] as string
      const existing = this.documents.find((d) => d.sourceReference === sourceReference)
      const id = existing?.id ?? `document-${this.nextId++}`
      if (!existing) this.documents.push({ id, sourceReference })
      const row = {
        id,
        title,
        category,
        source_reference: sourceReference,
        locale,
        created_at: new Date(),
        updated_at: new Date(),
      }
      return { rows: [row] }
    }
    if (lower.includes('insert into document_chunks')) {
      const documentId = params[0] as string
      const position = Number(params[1])
      const content = params[2] as string
      const embedding = (params[3] ?? null) as string | null
      const exists = this.chunks.some((c) => c.documentId === documentId && c.position === position)
      if (!exists) this.chunks.push({ documentId, position })
      const row = {
        id: `chunk-${this.nextId++}`,
        document_id: documentId,
        position,
        content,
        embedding,
        created_at: new Date(),
      }
      return { rows: [row] }
    }

    const countMatch = /select count\(\*\)(?: as [a-z_]+)? from ([a-z_]+)/.exec(lower)
    if (countMatch) {
      const table = countMatch[1]
      if (table === 'pilots') return { rows: [{ count: String(this.pilots.length) }] }
      if (table === 'documents') return { rows: [{ count: String(this.documents.length) }] }
      if (table === 'document_chunks') return { rows: [{ count: String(this.chunks.length) }] }
    }

    return { rows: [] }
  }
}
