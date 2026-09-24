## MODIFIED Requirements

### Requirement: Provenance and staleness on every result
Every tool result carrying aeronautical data SHALL identify its provider, the time the data was issued or observed, and the time it was retrieved. For a result covering several reports, the issue or observation time SHALL be the latest one among them. When no report in the result carries an issue or observation time, that field MUST be null. The server MUST NOT substitute the retrieval time, the current time, or any other value for it. A result served from cache MUST be marked as cached with its age.

#### Scenario: Provenance fields present
- **WHEN** any data-returning tool succeeds
- **THEN** its result includes the provider identifier, the issue or observation time, and the retrieval time

#### Scenario: Latest time across a batch
- **WHEN** a METAR or TAF request covers several aerodromes whose reports carry different times
- **THEN** the result's issue or observation time is the latest of those times

#### Scenario: No report carries a time
- **WHEN** a data-returning tool succeeds but no report in its result carries an issue or observation time
- **THEN** the result's issue or observation time is null
- **AND** the retrieval time is still stated

#### Scenario: Mock data is labeled
- **WHEN** a result originates from the mock provider
- **THEN** it is explicitly marked as sample data not suitable for operational use

#### Scenario: Cached result marked
- **WHEN** a result is served from cache
- **THEN** it is marked as cached and carries its age
