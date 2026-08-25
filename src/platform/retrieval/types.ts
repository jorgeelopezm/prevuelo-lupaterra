/**
 * Retrieval-foundation types: document and chunk storage with attribution,
 * the embedding provider seam, and the hybrid retrieval result shape.
 *
 * The retrieval result deliberately carries only scored chunks — attribution
 * (document id, title, position) plus the score — and no generated prose.
 * Answer synthesis belongs to the Documents capability, never here.
 */

export interface DocumentRecord {
  id: string
  title: string
  category: string
  sourceReference: string | null
  locale: string
  createdAt: Date
  updatedAt: Date
}

export interface DocumentChunkRecord {
  id: string
  documentId: string
  position: number
  content: string
  /** Fixed-dimensionality vector, or `null` when the chunk is unembedded. */
  embedding: number[] | null
  createdAt: Date
}

/**
 * A chunk together with everything needed to cite it: its document id, the
 * document's title, and its position within that document. Every retrieved
 * chunk carries this attribution.
 */
export interface ChunkWithAttribution {
  id: string
  documentId: string
  documentTitle: string
  position: number
  content: string
  locale: string
}

export interface CreateDocumentInput {
  title: string
  category: string
  sourceReference?: string
  locale: string
}

export interface CreateChunkInput {
  documentId: string
  position: number
  content: string
  /** Embedding at the configured dimensionality, validated on write. */
  embedding?: number[]
}

export interface DocumentStore {
  create(input: CreateDocumentInput): Promise<DocumentRecord>
  /** Chunks are removed with their document (cascade, schema-enforced). */
  deleteById(id: string): Promise<void>
  list(locale?: string): Promise<DocumentRecord[]>
  /** Chunks of one document in stored positional order. */
  listChunks(documentId: string): Promise<DocumentChunkRecord[]>
  insertChunk(input: CreateChunkInput): Promise<DocumentChunkRecord>
}

/** Thrown when a write supplies an embedding of the wrong dimensionality. */
export class EmbeddingDimensionError extends Error {
  constructor(expected: number, supplied: number) {
    super(`Embedding dimension mismatch: expected ${expected}, supplied ${supplied}`)
    this.name = 'EmbeddingDimensionError'
  }
}

/**
 * One embedding provider interface, consumed by the web application's retrieval
 * seam (and later by the MCP server's needs if a tool requires it). A provider
 * accepts a batch of texts and returns one vector per input, in the same order.
 */
export interface EmbeddingProvider {
  embed(batch: readonly string[]): Promise<number[][]>
}

export interface ScoredChunk {
  /** Descending-rankable combined vector + lexical score. */
  score: number
  chunk: ChunkWithAttribution
}

export interface RetrievalResult {
  query: string
  locale: string
  limit: number
  /** Only scored, attributed source chunks — never generated prose. */
  results: readonly ScoredChunk[]
}
