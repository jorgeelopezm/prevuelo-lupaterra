## MODIFIED Requirements

### Requirement: Aircraft records are scoped to their owner
Every read and write of an aircraft record SHALL be constrained to aircraft whose operator the authenticated pilot is a member of. A request naming an aircraft of an operator the pilot does not belong to MUST be answered as though the record did not exist, disclosing nothing about its existence.

#### Scenario: Another pilot's aircraft
- **WHEN** a signed-in pilot requests an aircraft identifier whose operator they are not a member of
- **THEN** the response is a not-found result, not a forbidden result
- **AND** the response body contains no registration, model, or other detail of that aircraft

#### Scenario: Co-owned aircraft
- **WHEN** a signed-in pilot requests an aircraft whose operator they are a member of, alongside other members
- **THEN** the aircraft and its detail are shown

#### Scenario: Unauthenticated request
- **WHEN** an unauthenticated request is made to any aircraft or logbook route
- **THEN** it is redirected to sign in and no aircraft data is rendered
