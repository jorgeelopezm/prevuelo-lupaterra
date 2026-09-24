## MODIFIED Requirements

### Requirement: Ownership scoping
Every query that reads or writes pilot-owned data SHALL be constrained by the authenticated pilot's identifier, and every query that reads or writes operator-owned data SHALL be constrained to operators the authenticated pilot is a member of. A pilot MUST NOT be able to read or modify another pilot's personal records, or the records of an operator they do not belong to, by supplying an identifier belonging to them. This scoping MUST be enforced both by the application and by the database.

#### Scenario: Access to another pilot's record
- **WHEN** an authenticated pilot requests a route naming a record owned by a different pilot
- **THEN** the server responds with status 404 and discloses nothing about the record's existence

#### Scenario: Access to an owned record
- **WHEN** an authenticated pilot requests a route naming a record they own
- **THEN** the record is returned normally

#### Scenario: Access to a record of an operator the pilot belongs to
- **WHEN** an authenticated pilot requests a route naming an aircraft-bound record of an operator they are a member of
- **THEN** the record is returned normally

#### Scenario: Access to a record of an operator the pilot does not belong to
- **WHEN** an authenticated pilot requests a route naming an aircraft-bound record of an operator they are not a member of
- **THEN** the server responds with status 404 and discloses nothing about the record's existence
