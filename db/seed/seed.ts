import type { PoolFacade, SqlQueryResult } from '../../src/platform/db/pool.js'

export interface SeedPilot {
  email: string
  displayName: string
  locale: string
  /** Memory-hard verifier (Argon2id) for the development password. */
  passwordHash: string
}

export interface SeedDocument {
  title: string
  category: string
  sourceReference: string
  locale: string
}

export interface SeedChunk {
  position: number
  content: string
  /** Fixed-dimensionality embedding serialized as pgvector text, e.g. `[0.1,0.2]`. */
  embedding: string
  documentId?: string
}

export interface SeedOptions {
  environment: string
  pilot: SeedPilot
  documents: ReadonlyArray<{ document: SeedDocument; chunks: ReadonlyArray<SeedChunk> }>
}

export interface SeedRunResult {
  pilotId: string
  counts: { pilots: number; documents: number; chunks: number }
}

/**
 * Development seed routine: creates the development pilot and sample documents
 * with deterministic mock embeddings. Repeatable — every statement is an upsert
 * keyed on a natural unique value, so a second run changes no row counts. The
 * routine aborts before writing anything when the environment is production.
 */
export async function seedDevDatabase(pool: PoolFacade, opts: SeedOptions): Promise<SeedRunResult> {
  if (opts.environment === 'production') {
    throw new Error('seed refused: cannot run the development seed in a production environment')
  }

  const pilotId = await upsertPilot(pool, opts.pilot)

  for (const { document, chunks } of opts.documents) {
    const documentId = await upsertDocument(pool, document)
    for (const chunk of chunks) {
      await insertChunk(pool, { ...chunk, documentId })
    }
  }

  const counts = await countRows(pool)
  return { pilotId, counts }
}

async function upsertPilot(pool: PoolFacade, pilot: SeedPilot): Promise<string> {
  const result: SqlQueryResult<{ id: string }> = await pool.query(
    `INSERT INTO pilots (email, display_name, locale, password_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       locale = EXCLUDED.locale,
       password_hash = EXCLUDED.password_hash,
       updated_at = now()
     RETURNING id`,
    [pilot.email, pilot.displayName, pilot.locale, pilot.passwordHash],
  )
  return result.rows[0]?.id as string
}

async function upsertDocument(pool: PoolFacade, document: SeedDocument): Promise<string> {
  const result: SqlQueryResult<{ id: string }> = await pool.query(
    `INSERT INTO documents (title, category, source_reference, locale)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (source_reference) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [document.title, document.category, document.sourceReference, document.locale],
  )
  return result.rows[0]?.id as string
}

async function insertChunk(pool: PoolFacade, seedChunk: SeedChunk): Promise<void> {
  await pool.query(
    `INSERT INTO document_chunks (document_id, position, content, embedding)
     VALUES ($1, $2, $3, $4::vector)
     ON CONFLICT (document_id, position) DO NOTHING`,
    [seedChunk.documentId, seedChunk.position, seedChunk.content, seedChunk.embedding],
  )
}

async function countRows(pool: PoolFacade): Promise<SeedRunResult['counts']> {
  const pilots: SqlQueryResult<{ count: string }> = await pool.query(
    'SELECT count(*) AS count FROM pilots',
  )
  const documents: SqlQueryResult<{ count: string }> = await pool.query(
    'SELECT count(*) AS count FROM documents',
  )
  const chunks: SqlQueryResult<{ count: string }> = await pool.query(
    'SELECT count(*) AS count FROM document_chunks',
  )
  return {
    pilots: Number(pilots.rows[0]?.count ?? 0),
    documents: Number(documents.rows[0]?.count ?? 0),
    chunks: Number(chunks.rows[0]?.count ?? 0),
  }
}

/** Deterministic mock embedding of a text at a fixed dimensionality. */
export function mockEmbedding(text: string, dimensions: number): string {
  const floats: number[] = []
  for (let i = 0; i < dimensions; i++) {
    const byte = text.charCodeAt(i % text.length) + i
    floats.push((byte % 21) / 10 - 1)
  }
  return `[${floats.join(',')}]`
}
