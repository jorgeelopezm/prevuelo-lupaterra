## ADDED Requirements

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
All tool implementations SHALL obtain data through one internal provider interface. A mock provider MUST be supplied, MUST be the default when no provider credentials are configured, and MUST return representative sample data for Iberian aerodromes so every tool is exercisable with no external account.

#### Scenario: Default provider selection
- **WHEN** the server starts with no provider credentials configured
- **THEN** the mock provider is selected and startup succeeds
- **AND** the selected provider is stated in the startup log

#### Scenario: Mock coverage
- **WHEN** any advertised tool is invoked against the mock provider with valid arguments
- **THEN** it returns a well-formed result rather than an unimplemented error

#### Scenario: Provider named without credentials
- **WHEN** a non-mock provider is named in configuration without its required credentials
- **THEN** startup aborts with an error naming the provider and the missing credential

### Requirement: Provenance and staleness on every result
Every tool result carrying aeronautical data SHALL identify its provider, the time the data was issued or observed, and the time it was retrieved. A result served from cache MUST be marked as cached with its age.

#### Scenario: Provenance fields present
- **WHEN** any data-returning tool succeeds
- **THEN** its result includes the provider identifier, the issue or observation time, and the retrieval time

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
