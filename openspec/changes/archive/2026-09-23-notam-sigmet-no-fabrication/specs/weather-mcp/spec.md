## ADDED Requirements

### Requirement: NOTAM and SIGMET results state their coverage
Every NOTAM report (one per requested aerodrome) and every SIGMET report (one per requested FIR) SHALL carry a coverage marking of either `complete` or `unknown`. A provider MUST report `complete` only when it asserts that the returned list is the full set in force for that aerodrome or FIR, so that an empty list means none are in force. In every other case, including a best-effort match or a region the provider does not authoritatively cover, it MUST report `unknown`.

#### Scenario: Provider without authoritative coverage
- **WHEN** `get_notams` or `get_sigmet` succeeds against a provider that cannot assert completeness for the requested aerodrome or FIR
- **THEN** each report in the result is marked with `unknown` coverage, whether its list is empty or not

#### Scenario: Mock seeded indicator
- **WHEN** `get_notams` is invoked against the mock provider for one of its seeded aerodromes, or `get_sigmet` for one of its seeded FIRs
- **THEN** the report is marked with `complete` coverage

#### Scenario: Mock unseeded indicator
- **WHEN** `get_notams` is invoked against the mock provider for an aerodrome it holds no fixtures for
- **THEN** the report has an empty list and is marked with `unknown` coverage

### Requirement: Missing NOTAM and SIGMET validity is never substituted
Each NOTAM and SIGMET entry SHALL carry its start and end of validity exactly as stated by the provider. When the provider does not state a start or end time, that field MUST be null. The server MUST NOT substitute the current time, the retrieval time, the issue time, or any other value for a validity time the provider did not state.

#### Scenario: Provider omits the end of validity
- **WHEN** an upstream NOTAM or SIGMET has no end-of-validity time
- **THEN** the returned entry's end of validity is null

#### Scenario: Provider omits the start of validity
- **WHEN** an upstream NOTAM or SIGMET has no start-of-validity time, even if it has an issue time
- **THEN** the returned entry's start of validity is null

#### Scenario: Provider states both times
- **WHEN** an upstream NOTAM or SIGMET states its start and end of validity
- **THEN** the returned entry carries those times unchanged
