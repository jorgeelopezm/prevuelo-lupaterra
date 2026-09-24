# Weather MCP Specification

## Purpose

A runnable MCP server exposing `get_metar`, `get_taf`, `get_notams`, `get_sigmet`, and `decode_metar` as typed tools over stdio and HTTP, behind a provider interface with a mock provider.

## Requirements

### Requirement: Runnable MCP server
The system SHALL provide a standalone MCP server for aeronautical data that starts independently of the web application, completes the MCP initialization handshake, and advertises its tools to a connecting client.

#### Scenario: Handshake and tool discovery
- **WHEN** an MCP client connects and requests the tool list
- **THEN** the server completes initialization and returns its advertised tools with names, descriptions, and input schemas

#### Scenario: Independent lifecycle
- **WHEN** the MCP server is started with the web application not running
- **THEN** it starts successfully and serves tool calls

### Requirement: Transport support
The MCP server SHALL support stdio transport for local client integration and an HTTP transport for networked clients. The selected transport MUST be determined by configuration or invocation flag.

#### Scenario: Stdio transport
- **WHEN** the server is launched in stdio mode
- **THEN** it exchanges MCP messages over standard input and output and writes no protocol-breaking output to stdout

#### Scenario: HTTP transport
- **WHEN** the server is launched in HTTP mode on a configured port
- **THEN** an MCP client can connect over HTTP and invoke tools

### Requirement: Aeronautical data tools
The server SHALL expose the tools `get_metar`, `get_taf`, `get_notams`, `get_sigmet`, and `decode_metar`, each with a declared input schema and a structured result. `get_metar`, `get_taf`, and `get_notams` accept one or more ICAO location indicators; `get_sigmet` accepts a FIR identifier; `decode_metar` accepts a raw report and a target locale from `es`, `pt`, `en`.

#### Scenario: METAR retrieval for multiple aerodromes
- **WHEN** `get_metar` is called with several ICAO location indicators
- **THEN** the result contains one entry per requested indicator, each carrying the raw report text, its observation time, and its source

#### Scenario: Unknown aerodrome
- **WHEN** `get_metar` is called with an indicator the provider has no data for
- **THEN** that indicator's entry reports no data available rather than the call failing entirely

#### Scenario: Decoding into a target locale
- **WHEN** `decode_metar` is called with a raw report and locale `pt`
- **THEN** the result contains Portuguese explanatory text
- **AND** the raw report string is echoed back unchanged

#### Scenario: Malformed input rejected
- **WHEN** a tool is called with arguments failing its declared input schema
- **THEN** the call returns a validation error identifying the offending field and performs no fetch

#### Scenario: Invalid ICAO format
- **WHEN** `get_metar` is called with a string that is not a four-character ICAO location indicator
- **THEN** the call returns a validation error rather than querying a provider

### Requirement: Provider interface with a mock default
All tool implementations SHALL obtain data through one internal provider interface. A mock provider MUST be supplied, MUST be the default when no provider credentials are configured, and MUST return representative sample data for Iberian aerodromes so every tool is exercisable with no external account. A globally-scoped real provider (`avwx`) MUST also be selectable, backed by an external API and its own required credential, so tools return real data for aerodromes and FIRs outside the mock provider's fixture set.

#### Scenario: Default provider selection
- **WHEN** the server starts with no provider credentials configured
- **THEN** the mock provider is selected and startup succeeds
- **AND** the selected provider is stated in the startup log

#### Scenario: Mock coverage
- **WHEN** any advertised tool is invoked against the mock provider with valid arguments
- **THEN** it returns a well-formed result rather than an unimplemented error

#### Scenario: Provider named without credentials
- **WHEN** a non-mock provider is named in configuration without its required credentials
- **THEN** startup aborts with an error naming the provider and its own missing credential variable, not another provider's

#### Scenario: Real global provider selection
- **WHEN** `WEATHER_PROVIDER=avwx` is configured with its required credential
- **THEN** the AVWX provider is selected and startup succeeds
- **AND** the selected provider is stated in the startup log

#### Scenario: Real provider serves data outside the mock fixture set
- **WHEN** `get_metar` or `get_taf` is called against the AVWX provider with an ICAO indicator that has no mock fixture data (e.g. an aerodrome outside Iberia)
- **THEN** the result contains that indicator's real report data when the upstream source has it, rather than an unconditional no-data entry

#### Scenario: Real provider results are not mislabeled as sample data
- **WHEN** any tool result originates from the AVWX provider
- **THEN** its `sample` field is `false` and it carries no sample-data caveat

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

### Requirement: Upstream failure handling
When an upstream provider is unreachable, returns an error, or exceeds the configured timeout, the tool SHALL return a structured error identifying the failure. The server MUST NOT substitute fabricated data for a failed fetch.

#### Scenario: Upstream timeout
- **WHEN** a provider request exceeds the configured timeout
- **THEN** the tool returns a structured timeout error naming the provider
- **AND** no report content is included in the result

#### Scenario: No fabrication on failure
- **WHEN** an upstream provider returns an error
- **THEN** the tool result contains no METAR, TAF, NOTAM, or SIGMET text

### Requirement: Response caching and rate limiting
The server SHALL cache provider responses with a configurable time-to-live and SHALL respect a configurable request rate ceiling per provider, so repeated calls do not exceed upstream terms of use.

#### Scenario: Cache hit within the TTL
- **WHEN** the same tool is called twice for the same indicator within the configured TTL
- **THEN** the second call is served from cache without a second upstream request

#### Scenario: Rate ceiling enforced
- **WHEN** calls would exceed the configured per-provider rate ceiling
- **THEN** the excess calls are queued or rejected with a retry indication rather than dispatched upstream

### Requirement: Batched METAR/TAF requests respect the upstream provider's own batch limit
When a provider's batch endpoint accepts fewer stations per call than a single tool call may request, the provider implementation SHALL split the request into multiple upstream calls and reassemble one ordered result, transparently to the tool caller.

#### Scenario: Request exceeding the upstream batch limit
- **WHEN** `get_metar` or `get_taf` is called with more ICAO indicators than the AVWX provider accepts in one upstream call
- **THEN** the tool result still contains one entry per requested indicator, in the order requested, with no visible difference from a request within the upstream limit

### Requirement: SIGMET FIR matching against a provider with no native FIR filter
When the selected provider's upstream API exposes SIGMET/AIRMET data as an unfiltered global list rather than by FIR, the provider implementation SHALL filter that list by matching the requested FIR designator against each advisory's raw text as a discrete token, and MUST NOT fabricate a match or invent SIGMET content when none is found.

#### Scenario: FIR match found in the global advisory list
- **WHEN** `get_sigmet` is called against the AVWX provider for a FIR whose designator appears in one or more advisories' raw text
- **THEN** the result's SIGMET entries include exactly those matching advisories

#### Scenario: No FIR match found
- **WHEN** `get_sigmet` is called against the AVWX provider for a FIR with no matching advisory in the current global list
- **THEN** the result's SIGMET entries are empty, identical in shape to the "none in force" case, and no advisory content is fabricated

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
