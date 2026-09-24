## MODIFIED Requirements

### Requirement: Weather and NOTAM values on the brief carry provenance
Any METAR or NOTAM value the home screen displays SHALL carry the provider, the observation or issue time, the retrieval time, the cache marking, and the mock-data caveat exactly as returned by the weather source, rendered the same way the weather screen renders them. The home screen MUST NOT recompute, abbreviate away, or omit any of these fields. An empty NOTAM list MUST be presented as "no NOTAMs in force" only when the result marks its coverage as `complete`; otherwise the home screen MUST present the same unconfirmed-empty state the weather screen uses.

#### Scenario: METAR summary with provenance
- **WHEN** a METAR is retrieved for the flight intent's departure indicator
- **THEN** the weather tile shows the report together with its provider, its observation time, and its retrieval time

#### Scenario: NOTAMs listed with provenance
- **WHEN** NOTAMs are returned for the departure indicator
- **THEN** the attention band lists them with their validity window, their provenance, and the mock-data caveat

#### Scenario: No NOTAMs is distinct from a failed retrieval
- **WHEN** the NOTAM retrieval succeeds and returns an empty list with `complete` coverage
- **THEN** the screen states in localized text that no NOTAMs are in force, together with the result's provenance
- **AND** that state is distinguishable in text from the retrieval-failure state

#### Scenario: Unconfirmed empty NOTAM list on the brief
- **WHEN** the NOTAM retrieval succeeds with an empty list and `unknown` or absent coverage, or returns no entry for the departure indicator
- **THEN** the attention band shows the localized unconfirmed-empty state together with the result's provenance
- **AND** it does not state that no NOTAMs are in force

#### Scenario: Mock-provider caveat carried through
- **WHEN** a displayed weather value originates from the mock provider
- **THEN** the screen displays the localized caveat that it is sample data not suitable for operational use
