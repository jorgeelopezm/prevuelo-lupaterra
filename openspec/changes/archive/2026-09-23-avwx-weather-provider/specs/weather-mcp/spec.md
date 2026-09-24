## MODIFIED Requirements

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

## ADDED Requirements

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
