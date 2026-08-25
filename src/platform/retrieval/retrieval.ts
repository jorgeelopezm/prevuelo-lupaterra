import type { PoolFacade } from '../db/pool.js'
import type { EmbeddingProvider, RetrievalResult, ScoredChunk } from './types.js'
import { toVectorLiteral } from './vector.js'

export interface RetrieveChunksOptions {
  pool: PoolFacade
  /** Provider used to embed the query at the configured dimensionality. */
  embeddings: EmbeddingProvider
  query: string
  /** Only chunks of documents in this locale are eligible. */
  locale: string
  /** Upper bound on returned chunks. */
  limit: number
}

export interface RetrievalRow {
  id: string
  position: number
  content: string
  document_id: string
  document_title: string
  locale: string
  /** Cosine similarity from the pgvector operator; `null` for null embeddings. */
  similarity: string | number | null
  /** `ts_rank_cd` full-text relevance; `null` when the chunk does not match. */
  lexical: string | number | null
}

/**
 * One hybrid retrieval statement. Candidate chunks are those that either
 * lexically match the query (language-agnostic `simple` tsquery) or carry an
 * embedding, so a lexical-only match and a vector-only match are both eligible.
 * Each candidate row carries both raw signals; the combined score is
 * `similarity + lexical`. The statement pre-ranks and pre-bounds for
 * efficiency; the repository re-ranks and re-bounds below so the contract
 * holds regardless of SQL drift.
 */
const RETRIEVAL_SQL = `
SELECT id, position, content, document_id, document_title, locale, similarity, lexical
FROM (
  SELECT
    c.id AS id, c.position AS position, c.content AS content,
    d.id AS document_id, d.title AS document_title, d.locale AS locale,
    COALESCE(1 - (c.embedding <=> $2::vector), 0) AS similarity,
    COALESCE(ts_rank_cd(to_tsvector('simple', c.content), plainto_tsquery('simple', $1)), 0) AS lexical
  FROM document_chunks c
  JOIN documents d ON d.id = c.document_id
  WHERE d.locale = $3
    AND (to_tsvector('simple', c.content) @@ plainto_tsquery('simple', $1) OR c.embedding IS NOT NULL)
) ranked
ORDER BY similarity + lexical DESC
LIMIT $4
`.trim()

/**
 * Hybrid retrieval: combines vector similarity and full-text relevance into one
 * ranked, bounded result set. Returns only scored, attributed source chunks —
 * never generated prose.
 */
export async function retrieveChunks(opts: RetrieveChunksOptions): Promise<RetrievalResult> {
  const limit = Math.max(0, Math.floor(opts.limit))
  const vectors = await opts.embeddings.embed([opts.query])
  const queryVector = vectors[0]
  if (!queryVector) {
    return { query: opts.query, locale: opts.locale, limit, results: [] }
  }
  const queryLiteral = toVectorLiteral(queryVector)

  const result = await opts.pool.query<RetrievalRow>(RETRIEVAL_SQL, [
    opts.query,
    queryLiteral,
    opts.locale,
    limit,
  ])

  const scored: ScoredChunk[] = result.rows.map((row) => ({
    score: toNumber(row.similarity) + toNumber(row.lexical),
    chunk: {
      id: row.id,
      documentId: row.document_id,
      documentTitle: row.document_title,
      position: row.position,
      content: row.content,
      locale: row.locale,
    },
  }))
  scored.sort((a, b) => b.score - a.score)

  return {
    query: opts.query,
    locale: opts.locale,
    limit,
    results: scored.slice(0, limit),
  }
}

function toNumber(value: string | number | null): number {
  if (value === null || value === undefined) return 0
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
