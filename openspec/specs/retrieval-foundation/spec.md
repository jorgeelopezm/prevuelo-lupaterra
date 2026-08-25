# Retrieval Foundation Specification

## Purpose

Document and chunk storage with pgvector embeddings, an embedding provider interface with a deterministic mock, and a hybrid vector + full-text retrieval interface returning scored, attributable chunks.

## Requirements

### Requirement: Document and chunk storage
The system SHALL store documents with their title, category, source reference, and locale, and SHALL store ordered text chunks belonging to a document, each with its position, text content, and an optional embedding vector. Chunk text MUST retain a reference sufficient to cite its position within the source document.

#### Scenario: Chunk retains attribution
- **WHEN** a chunk is retrieved
- **THEN** it carries its document identifier, document title, and its position within that document

#### Scenario: Chunk ordering
- **WHEN** the chunks of one document are listed
- **THEN** they are returned in their stored positional order

#### Scenario: Document deletion cascades
- **WHEN** a document is deleted
- **THEN** its chunks and their embeddings are removed with it

### Requirement: Vector storage with a fixed dimensionality
Embeddings SHALL be stored in a `pgvector` column whose dimensionality is fixed by configuration. An embedding whose dimensionality does not match the configured value MUST be rejected at write time rather than stored.

#### Scenario: Dimension mismatch rejected
- **WHEN** a write supplies an embedding whose length differs from the configured dimensionality
- **THEN** the write is rejected with an error naming both the expected and the supplied dimensionality

#### Scenario: Approximate index present
- **WHEN** the baseline migrations have been applied
- **THEN** a vector similarity index exists on the embedding column

### Requirement: Embedding provider interface
The system SHALL define one embedding provider interface that accepts a batch of texts and returns one vector per input in the same order. A deterministic mock provider MUST be supplied and MUST be the default, so the retrieval seam is exercisable without external credentials.

#### Scenario: Order preservation
- **WHEN** a batch of texts is submitted for embedding
- **THEN** the returned vectors correspond positionally to the inputs
- **AND** the count of vectors equals the count of inputs

#### Scenario: Mock determinism
- **WHEN** the mock provider embeds the same text twice
- **THEN** it returns identical vectors

#### Scenario: Default with no credentials configured
- **WHEN** the application starts with no embedding credential configured
- **THEN** the mock provider is selected and startup succeeds

#### Scenario: Provider selection by configuration
- **WHEN** a non-mock provider is named in configuration without its required credential
- **THEN** startup aborts with an error naming the missing credential

### Requirement: Hybrid retrieval interface
The system SHALL expose a retrieval operation that accepts a query string, a locale, and a result limit, and returns scored chunks ranked by a combination of vector similarity and full-text relevance. Each returned chunk MUST carry its score and its document attribution.

#### Scenario: Ranked, bounded results
- **WHEN** retrieval is invoked with a limit of N
- **THEN** at most N chunks are returned, ordered by descending combined score

#### Scenario: Both signals contribute
- **WHEN** a query matches one chunk by lexical overlap and a different chunk by vector proximity
- **THEN** both chunks are eligible for the result set rather than one signal being discarded

#### Scenario: Attribution on every result
- **WHEN** any chunk is returned from retrieval
- **THEN** it carries its score, document identifier, document title, and position

#### Scenario: Empty corpus
- **WHEN** retrieval is invoked against a corpus containing no chunks
- **THEN** an empty result set is returned without error

### Requirement: Retrieval does not synthesize answers
The retrieval foundation SHALL return source chunks only. Generating prose answers, summarizing retrieved content, and rendering a chat interface are out of scope for this capability and belong to the Documents capability.

#### Scenario: Retrieval output shape
- **WHEN** the retrieval interface is invoked
- **THEN** its result contains only scored chunks with attribution and contains no generated prose
