-- Enable the pgvector extension. The docker-compose image (pgvector/pgvector:pg16)
-- ships the binaries; this line ensures the extension is loaded in this database.
CREATE EXTENSION IF NOT EXISTS vector;