## MODIFIED Requirements

### Requirement: Standard table columns
Every table storing pilot-owned or operator-owned data SHALL carry a primary key, a creation timestamp, and an update timestamp, all in UTC. Tables whose rows belong to a pilot MUST carry a non-nullable foreign key to the pilot with a defined deletion behavior. Tables whose rows belong to an operator MUST carry a non-nullable foreign key to the operator with a defined deletion behavior, and MUST record the pilot who created and the pilot who last updated each row.

#### Scenario: Timestamps on insert
- **WHEN** a row is inserted into a pilot-owned table
- **THEN** its creation and update timestamps are populated with the current UTC instant

#### Scenario: Timestamp on update
- **WHEN** an existing row is updated
- **THEN** its update timestamp advances and its creation timestamp is unchanged

#### Scenario: Orphan prevention
- **WHEN** an insert names a pilot identifier that does not exist
- **THEN** the database rejects the insert

#### Scenario: Operator-owned row without an operator
- **WHEN** an insert into an operator-owned table names no operator, or an operator that does not exist
- **THEN** the database rejects the insert

#### Scenario: Operator-owned row records its authors
- **WHEN** a row is inserted into and later updated in an operator-owned table
- **THEN** it records the inserting pilot as its creator and the updating pilot as its last updater
