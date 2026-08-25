import type { PoolFacade } from '../db/pool.js'
import type { CreateSessionInput, SessionRecord, SessionStore, SessionWithPilot } from './types.js'

interface SessionRow {
  id: string
  pilot_id: string
  token_hash: string
  expires_at: Date
  created_at: Date
}

interface SessionJoinRow extends SessionRow {
  pilot__id: string
  pilot__email: string
  pilot__display_name: string
  pilot__locale: string
  pilot__password_hash: string
  pilot__created_at: Date
  pilot__updated_at: Date
}

function mapSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    pilotId: row.pilot_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}

const SESSION_COLUMNS = 'id, pilot_id, token_hash, expires_at, created_at'

const SESSION_JOIN_COLUMNS = `
  s.id, s.pilot_id, s.token_hash, s.expires_at, s.created_at,
  p.id AS pilot__id, p.email AS pilot__email, p.display_name AS pilot__display_name,
  p.locale AS pilot__locale, p.password_hash AS pilot__password_hash,
  p.created_at AS pilot__created_at, p.updated_at AS pilot__updated_at`

function mapSessionWithPilot(row: SessionJoinRow): SessionWithPilot {
  return {
    ...mapSession(row),
    pilot: {
      id: row.pilot__id,
      email: row.pilot__email,
      displayName: row.pilot__display_name,
      locale: row.pilot__locale,
      passwordHash: row.pilot__password_hash,
      createdAt: row.pilot__created_at,
      updatedAt: row.pilot__updated_at,
    },
  }
}

export function createSessionStore(pool: PoolFacade): SessionStore {
  return {
    async create(input: CreateSessionInput): Promise<SessionRecord> {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO sessions (pilot_id, token_hash, expires_at)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [input.pilotId, input.tokenHash, input.expiresAt],
      )
      const id = result.rows[0]?.id
      if (!id) throw new Error('session insert returned no id')
      return { ...input, id, createdAt: new Date() }
    },

    async findByTokenHash(tokenHash: string): Promise<SessionWithPilot | null> {
      const result = await pool.query<SessionJoinRow>(
        `SELECT ${SESSION_JOIN_COLUMNS}
         FROM sessions s JOIN pilots p ON p.id = s.pilot_id
         WHERE s.token_hash = $1 LIMIT 1`,
        [tokenHash],
      )
      const row = result.rows[0]
      return row ? mapSessionWithPilot(row) : null
    },

    async deleteByTokenHash(tokenHash: string): Promise<void> {
      await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash])
    },

    async deleteByPilotId(pilotId: string): Promise<void> {
      await pool.query('DELETE FROM sessions WHERE pilot_id = $1', [pilotId])
    },

    async findByIdOwnedBy(pilotId: string, sessionId: string): Promise<SessionRecord | null> {
      const result = await pool.query<SessionRow>(
        `SELECT ${SESSION_COLUMNS} FROM sessions
         WHERE id = $1 AND pilot_id = $2 LIMIT 1`,
        [sessionId, pilotId],
      )
      const row = result.rows[0]
      return row ? mapSession(row) : null
    },
  }
}
