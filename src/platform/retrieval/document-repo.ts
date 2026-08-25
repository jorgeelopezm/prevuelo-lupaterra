import type { PoolFacade } from '../db/pool.js'
import {
  EmbeddingDimensionError,
  type CreateChunkInput,
  type CreateDocumentInput,
  type DocumentChunkRecord,
  type DocumentRecord,
  type DocumentStore,
} from './types.js'
import { parseVectorLiteral, toVectorLiteral } from './vector.js'

interface DocumentRow {
  id: string
  title: string
  category: string
  source_reference: string | null
  locale: string
  created_at: Date
  updated_at: Date
}

interface ChunkRow {
  id: string
  document_id: string
  position: number
  content: string
  embedding: string | null
  created_at: Date
}

const DOCUMENT_COLUMNS = 'id, title, category, source_reference, locale, created_at, updated_at'
const CHUNK_COLUMNS = 'id, document_id, position, content, embedding, created_at'

function mapDocument(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    sourceReference: row.source_reference,
    locale: row.locale,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapChunk(row: ChunkRow): DocumentChunkRecord {
  return {
    id: row.id,
    documentId: row.document_id,
    position: row.position,
    content: row.content,
    embedding: parseVectorLiteral(row.embedding),
    createdAt: row.created_at,
  }
}

/**
 * SQL-backed document and chunk repository. Deletion of a document relies on
 * the schema's `ON DELETE CASCADE` foreign key (migration 003), so chunks and
 * their embeddings are removed with it. Embedding dimensionality is enforced
 * here on write — the pgvector column type is the second line of defense.
 */
export function createDocumentStore(pool: PoolFacade, dimensions: number): DocumentStore {
  return {
    async create(input: CreateDocumentInput): Promise<DocumentRecord> {
      const result = await pool.query<DocumentRow>(
        `INSERT INTO documents (title, category, source_reference, locale)
         VALUES ($1, $2, $3, $4)
         RETURNING ${DOCUMENT_COLUMNS}`,
        [input.title, input.category, input.sourceReference ?? null, input.locale],
      )
      const row = result.rows[0]
      if (!row) throw new Error('document insert returned no row')
      return mapDocument(row)
    },

    async deleteById(id: string): Promise<void> {
      // Chunks cascade via the schema's ON DELETE CASCADE foreign key.
      await pool.query('DELETE FROM documents WHERE id = $1', [id])
    },

    async list(locale?: string): Promise<DocumentRecord[]> {
      const result = locale
        ? await pool.query<DocumentRow>(
            `SELECT ${DOCUMENT_COLUMNS} FROM documents WHERE locale = $1 ORDER BY title ASC`,
            [locale],
          )
        : await pool.query<DocumentRow>(
            `SELECT ${DOCUMENT_COLUMNS} FROM documents ORDER BY title ASC`,
          )
      return result.rows.map(mapDocument)
    },

    async listChunks(documentId: string): Promise<DocumentChunkRecord[]> {
      const result = await pool.query<ChunkRow>(
        `SELECT ${CHUNK_COLUMNS} FROM document_chunks
         WHERE document_id = $1 ORDER BY position ASC`,
        [documentId],
      )
      return result.rows.map(mapChunk)
    },

    async insertChunk(input: CreateChunkInput): Promise<DocumentChunkRecord> {
      if (input.embedding !== undefined && input.embedding.length !== dimensions) {
        throw new EmbeddingDimensionError(dimensions, input.embedding.length)
      }
      const embedding = input.embedding ? toVectorLiteral(input.embedding) : null
      const result = await pool.query<ChunkRow>(
        `INSERT INTO document_chunks (document_id, position, content, embedding)
         VALUES ($1, $2, $3, $4::vector)
         RETURNING ${CHUNK_COLUMNS}`,
        [input.documentId, input.position, input.content, embedding],
      )
      const row = result.rows[0]
      if (!row) throw new Error('chunk insert returned no row')
      return mapChunk(row)
    },
  }
}
