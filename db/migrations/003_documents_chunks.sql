-- Documents and their ordered, embeddable chunks.
--
-- The embedding dimensionality is fixed by configuration (`EMBEDDING_DIMENSIONS`)
-- and is templated into this file by the migration loader as
-- `__EMBEDDING_DIMENSIONS__`. The pgvector column is created at that fixed
-- dimensionality; mismatched writes are rejected by the column type itself.

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  source_reference text UNIQUE,
  locale text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER documents_set_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  position integer NOT NULL,
  content text NOT NULL,
  embedding vector(__EMBEDDING_DIMENSIONS__),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_chunks_position_unique UNIQUE (document_id, position)
);

-- Vector similarity index (approximate, cosine distance) for the hybrid
-- retrieval seam.
CREATE INDEX document_chunks_embedding_hnsw_idx ON document_chunks
  USING hnsw (embedding vector_cosine_ops);

-- Full-text search index over chunk content, language-agnostic 'simple'
-- configuration so every locale is indexed without per-locale dictionaries.
CREATE INDEX document_chunks_content_tsv_idx ON document_chunks
  USING gin (to_tsvector('simple', content));

CREATE INDEX document_chunks_document_id_pos_idx ON document_chunks (document_id, position);