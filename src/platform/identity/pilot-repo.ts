import type { PoolFacade } from '../db/pool.js'
import type { CreatePilotInput, PilotRecord, PilotStore } from './types.js'

interface PilotRow {
  id: string
  email: string
  display_name: string
  locale: string
  password_hash: string
  created_at: Date
  updated_at: Date
}

function mapPilot(row: PilotRow): PilotRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    locale: row.locale,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const PILOT_COLUMNS = 'id, email, display_name, locale, password_hash, created_at, updated_at'

export function createPilotStore(pool: PoolFacade): PilotStore {
  return {
    async createIfUnique(input: CreatePilotInput): Promise<PilotRecord | null> {
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO pilots (email, display_name, locale, password_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO NOTHING
         RETURNING id`,
        [input.email, input.displayName, input.locale, input.passwordHash],
      )
      const id = inserted.rows[0]?.id
      if (!id) return null
      return (await findByPilotId(pool, id)) ?? null
    },

    async create(input: CreatePilotInput): Promise<PilotRecord> {
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO pilots (email, display_name, locale, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [input.email, input.displayName, input.locale, input.passwordHash],
      )
      const id = inserted.rows[0]?.id
      if (!id) throw new Error('pilot insert returned no id')
      return (await findByPilotId(pool, id)) as PilotRecord
    },

    async findByEmail(email: string): Promise<PilotRecord | null> {
      return findByPilotEmail(pool, email)
    },

    async findById(id: string): Promise<PilotRecord | null> {
      return findByPilotId(pool, id)
    },

    async updateLocale(id: string, locale: string): Promise<void> {
      await pool.query('UPDATE pilots SET locale = $2, updated_at = now() WHERE id = $1', [
        id,
        locale,
      ])
    },
  }
}

async function findByPilotId(pool: PoolFacade, id: string): Promise<PilotRecord | null> {
  const result = await pool.query<PilotRow>(
    `SELECT ${PILOT_COLUMNS} FROM pilots WHERE id = $1 LIMIT 1`,
    [id],
  )
  const row = result.rows[0]
  return row ? mapPilot(row) : null
}

async function findByPilotEmail(pool: PoolFacade, email: string): Promise<PilotRecord | null> {
  // citext equality makes this case-insensitive.
  const result = await pool.query<PilotRow>(
    `SELECT ${PILOT_COLUMNS} FROM pilots WHERE email = $1 LIMIT 1`,
    [email],
  )
  const row = result.rows[0]
  return row ? mapPilot(row) : null
}
