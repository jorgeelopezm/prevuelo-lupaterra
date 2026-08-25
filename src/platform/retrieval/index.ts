export { createDocumentStore } from './document-repo.js'
export {
  createEmbeddingProvider,
  createMockEmbeddingProvider,
  EmbeddingProviderConfigError,
} from './embeddings.js'
export { retrieveChunks } from './retrieval.js'
export { parseVectorLiteral, toVectorLiteral } from './vector.js'
export { EmbeddingDimensionError } from './types.js'
export type {
  ChunkWithAttribution,
  CreateChunkInput,
  CreateDocumentInput,
  DocumentChunkRecord,
  DocumentRecord,
  DocumentStore,
  EmbeddingProvider,
  RetrievalResult,
  ScoredChunk,
} from './types.js'
