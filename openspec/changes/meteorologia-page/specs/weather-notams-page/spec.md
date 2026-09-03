## ADDED Requirements

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
- **THEN** the screen requests and renders active SIGMETs for that FIR, or an explicit "none in force" state when the result list is empty

#### Scenario: Invalid ICAO rejected before dispatch
- **WHEN** a pilot submits a value that is not a four-character ICAO indicator
- **THEN** the screen shows a localized validation message for that value
- **AND** no MCP tool call is made for it

#### Scenario: Bookmarkable results
- **WHEN** a lookup succeeds
- **THEN** the resulting URL can be reloaded or shared to reproduce the same lookup

### Requirement: METAR, TAF, and NOTAM rendering with provenance
For each requested ICAO indicator, the screen SHALL render its current METAR, TAF, and NOTAM data as returned by the weather MCP server, each carrying the result's provider, issued/observed time, and retrieval time exactly as returned — the screen MUST NOT recompute or invent any of these fields.

#### Scenario: METAR displayed with provenance
- **WHEN** `get_metar` succeeds for an indicator
- **THEN** the screen shows the raw METAR text, its observation time, its provider, and its retrieval time

#### Scenario: TAF displayed with provenance
- **WHEN** `get_taf` succeeds for an indicator
- **THEN** the screen shows the raw TAF text, its issue time, its provider, and its retrieval time

#### Scenario: NOTAMs listed per aerodrome
- **WHEN** `get_notams` succeeds for an indicator
- **THEN** the screen lists each active NOTAM for that indicator, or an explicit "no active NOTAMs" state when the list is empty

#### Scenario: Unknown aerodrome reported per indicator
- **WHEN** a requested indicator has no data at the provider
- **THEN** that indicator's section shows a localized "no data available" state
- **AND** the sections for other requested indicators still render normally

### Requirement: Mock-data caveat and cache status shown
Every rendered result SHALL carry the same mock-data caveat and cache/age marking the weather MCP server attaches to it, visible in the viewer's locale.

#### Scenario: Mock provider caveat visible
- **WHEN** any result originates from the mock provider
- **THEN** the screen displays a localized caveat stating it is sample data not suitable for operational use

#### Scenario: Cached result marked with age
- **WHEN** a result is marked as cached by the weather MCP server
- **THEN** the screen displays a localized "cached" indicator showing the result's age

### Requirement: Decoded METAR explanation
The screen SHALL offer an inline plain-language explanation of each displayed METAR, in the viewer's active locale, obtained from the `decode_metar` tool.

#### Scenario: Decoded explanation in the active locale
- **WHEN** a METAR is displayed while the viewer's locale is `es`, `en`, or `pt`
- **THEN** its decoded explanation is requested and rendered in that same locale

#### Scenario: Raw report unchanged
- **WHEN** a decoded explanation is rendered
- **THEN** the raw METAR text shown alongside it is unchanged from the value `get_metar` returned

#### Scenario: Undecodable report noted, not hidden
- **WHEN** `decode_metar` marks a report as undecoded
- **THEN** the screen still shows the raw report and a localized note that it could not be decoded

### Requirement: Upstream failure surfaced per indicator, never fabricated
When a tool call for one requested indicator fails — timeout, provider error, or rate-limit rejection — the screen SHALL show a localized, structured error for that indicator alone and MUST NOT display any METAR, TAF, NOTAM, or SIGMET text for it.

#### Scenario: Timeout shown without fabricated content
- **WHEN** a provider request for one indicator times out
- **THEN** that indicator's section shows a localized timeout error naming the provider
- **AND** contains no report text

#### Scenario: Provider error shown without fabricated content
- **WHEN** a provider request for one indicator returns an error
- **THEN** that indicator's section shows a localized error state
- **AND** contains no report text

#### Scenario: Rate-limit rejection shown with retry indication
- **WHEN** a request is rejected for exceeding the configured rate ceiling
- **THEN** the affected section shows a localized message indicating the pilot may retry
- **AND** other, unaffected indicators in the same lookup still render normally

#### Scenario: One failing indicator does not block the others
- **WHEN** a multi-indicator lookup has one indicator fail and others succeed
- **THEN** the succeeding indicators' sections render their data normally alongside the failing indicator's error state

### Requirement: Localized and responsive weather screen
The weather screen SHALL render inside the application shell at the localized `/meteorologia`-equivalent path in each supported locale, follow the shell's fragment/full-page rendering contract, and remain fully usable from a 320px viewport to desktop widths.

#### Scenario: Locale-appropriate path and content
- **WHEN** the weather screen is requested under `es`, `en`, and `pt`
- **THEN** each responds at its own localized path segment with its labels, caveats, and error messages in that locale

#### Scenario: Fragment response for htmx navigation
- **WHEN** the weather screen is requested with `HX-Request: true`
- **THEN** the response contains the results partial only, without the document shell

#### Scenario: Usable at phone width
- **WHEN** the weather screen is viewed at a 320px viewport width
- **THEN** the lookup form and all rendered results are reachable by vertical scrolling alone
