## ADDED Requirements

### Requirement: Unstated provenance time shown as not stated
When a result's issue or observation time is null, every provenance line that shows it on the weather screen and the home brief SHALL render the localized "not stated" text in its place. The screen MUST NOT display a time the result did not carry, including the retrieval time or a default date.

#### Scenario: Provenance line without an issue time
- **WHEN** a METAR or NOTAM result with a null issue time is rendered
- **THEN** its provenance line shows the localized "not stated" text for the issue time
- **AND** no substituted or default date appears in the response
