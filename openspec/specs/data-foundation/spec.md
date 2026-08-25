# Data Foundation Specification

## Purpose

Baseline relational schema, migration conventions, transaction and query access patterns, seed data for local development, and the ownership columns every feature table will inherit.

## Requirements

### Requirement: Baseline schema
The initial migration set SHALL create the tables this skeleton requires — pilots, sessions, documents, and document chunks — and SHALL enable the `vector` extension. Feature-domain tables are out of scope for this change and MUST arrive with their own capabilities.

#### Scenario: Fresh database provisioning
- **WHEN** the migration runner is applied to an empty database
- **THEN** the pilots, sessions, documents, and document chunk tables exist with their constraints and indexes
- **AND** the `vector` extension is enabled

#### Scenario: Feature tables absent
- **WHEN** the baseline migrations have been applied
- **THEN** no table specific to weather, checklists, risk assessment, or logbook data has been created

### Requirement: Migration conventions
Migrations SHALL be forward-only, individually versioned, ordered by version, and applied exactly once. Each migration MUST run inside a transaction where the statements it contains permit one.

#### Scenario: Repeated application
- **WHEN** the migration runner is executed twice in succession against the same database
- **THEN** the second execution applies nothing and exits successfully

#### Scenario: Version ordering
- **WHEN** two pending migrations exist with different version identifiers
- **THEN** the lower version is applied before the higher

#### Scenario: Partial failure
- **WHEN** a transactional migration raises an error partway through
- **THEN** its effects are rolled back and it is not recorded as applied

### Requirement: Standard table columns
Every table storing pilot-owned data SHALL carry a primary key, a creation timestamp, and an update timestamp, all in UTC. Tables whose rows belong to a pilot MUST carry a non-nullable foreign key to the pilot with a defined deletion behavior.

#### Scenario: Timestamps on insert
- **WHEN** a row is inserted into a pilot-owned table
- **THEN** its creation and update timestamps are populated with the current UTC instant

#### Scenario: Timestamp on update
- **WHEN** an existing row is updated
- **THEN** its update timestamp advances and its creation timestamp is unchanged

#### Scenario: Orphan prevention
- **WHEN** an insert names a pilot identifier that does not exist
- **THEN** the database rejects the insert

### Requirement: Transactional write boundary
The data layer SHALL expose a transaction boundary such that a unit of work spanning multiple statements either commits entirely or leaves no partial effect.

#### Scenario: Error inside a unit of work
- **WHEN** an operation inside a transaction boundary throws after an earlier statement has succeeded
- **THEN** the transaction is rolled back and none of its statements are visible to subsequent reads

#### Scenario: Connection release
- **WHEN** a unit of work completes, whether by commit or rollback
- **THEN** its pooled connection is returned to the pool

### Requirement: Parameterized queries
All database access SHALL use parameterized statements. String interpolation of request-derived values into SQL is prohibited.

#### Scenario: Value containing SQL syntax
- **WHEN** a request supplies a field value containing SQL quoting or comment characters
- **THEN** the value is stored and retrieved literally with no effect on statement structure

### Requirement: Development seed data
The system SHALL provide a repeatable seed routine that populates a development database with a signed-in-capable pilot account and enough reference data to exercise the shell, locale switching, and retrieval seam.

#### Scenario: Seeding a fresh database
- **WHEN** the seed routine runs against a freshly migrated database
- **THEN** at least one pilot account exists with known development credentials
- **AND** the application can be signed into and navigated without further setup

#### Scenario: Seed is repeatable
- **WHEN** the seed routine runs twice against the same database
- **THEN** it completes successfully without duplicating seeded records

#### Scenario: Seed refuses non-development environments
- **WHEN** the seed routine is invoked with the environment configured as production
- **THEN** it aborts without writing
