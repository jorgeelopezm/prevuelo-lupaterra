## MODIFIED Requirements

### Requirement: Aerodrome and FIR lookup
The weather screen SHALL let a pilot enter one or more four-character ICAO location indicators and, separately, a FIR identifier, and request weather data for exactly those inputs against the weather MCP server. It MUST NOT require selection from a pre-populated aerodrome database.

#### Scenario: Single aerodrome lookup
- **WHEN** a pilot submits one valid ICAO indicator
- **THEN** the screen requests and renders METAR, TAF, and NOTAMs for that indicator

#### Scenario: Multiple aerodrome lookup
- **WHEN** a pilot submits several valid ICAO indicators
- **THEN** the screen renders one result section per requested indicator, in the order submitted

#### Scenario: FIR lookup for SIGMET
- **WHEN** a pilot submits a FIR identifier
- **THEN** the screen requests and renders active SIGMETs for that FIR, each with its validity window
- **AND** when the result list is empty, the screen shows the "none in force" state only if the result's coverage is `complete`, and otherwise the unconfirmed-empty state

#### Scenario: Invalid ICAO rejected before dispatch
- **WHEN** a pilot submits a value that is not a four-character ICAO indicator
- **THEN** the screen shows a localized validation message for that value
- **AND** no MCP tool call is made for it

#### Scenario: Bookmarkable results
- **WHEN** a lookup succeeds
- **THEN** the resulting URL can be reloaded or shared to reproduce the same lookup

### Requirement: METAR, TAF, and NOTAM rendering with provenance
For each requested ICAO indicator, the screen SHALL render its current METAR, TAF, and NOTAM data as returned by the weather MCP server, each carrying the result's provider, issued/observed time, and retrieval time exactly as returned — the screen MUST NOT recompute or invent any of these fields. An empty NOTAM or SIGMET list MUST be presented as "none in force" only when the result marks its coverage as `complete`. An empty list with `unknown` or absent coverage, or a result with no entry for the requested indicator, MUST be presented as an unconfirmed-empty state: localized text saying that the provider returned none and that this does not confirm none are in force. Both empty states MUST show the provenance of the result that produced them.

#### Scenario: METAR displayed with provenance
- **WHEN** `get_metar` succeeds for an indicator
- **THEN** the screen shows the raw METAR text, its observation time, its provider, and its retrieval time

#### Scenario: TAF displayed with provenance
- **WHEN** `get_taf` succeeds for an indicator
- **THEN** the screen shows the raw TAF text, its issue time, its provider, and its retrieval time

#### Scenario: NOTAMs listed per aerodrome
- **WHEN** `get_notams` succeeds for an indicator and returns one or more NOTAMs
- **THEN** the screen lists each NOTAM with its identifier, text, and validity window in UTC

#### Scenario: Confirmed empty NOTAM list
- **WHEN** `get_notams` succeeds for an indicator with an empty list and `complete` coverage
- **THEN** the screen shows the localized "no active NOTAMs" state together with the result's provenance

#### Scenario: Unconfirmed empty NOTAM list
- **WHEN** `get_notams` succeeds for an indicator with an empty list and `unknown` or absent coverage, or returns no entry for that indicator
- **THEN** the screen shows the localized unconfirmed-empty state together with the result's provenance
- **AND** the response does not contain the "no active NOTAMs" text for that indicator

#### Scenario: Validity not stated
- **WHEN** a NOTAM or SIGMET entry has a null start or end of validity
- **THEN** the screen shows a localized "not stated" in place of that time
- **AND** no time is displayed for it that the result did not carry

#### Scenario: Unknown aerodrome reported per indicator
- **WHEN** a requested indicator has no data at the provider
- **THEN** that indicator's section shows a localized "no data available" state
- **AND** the sections for other requested indicators still render normally
