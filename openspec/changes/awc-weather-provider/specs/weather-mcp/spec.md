## ADDED Requirements

### Requirement: Keyless AWC provider for METAR, TAF, and SIGMET
The server SHALL offer an `awc` weather provider, backed by the aviationweather.gov Data API, that requires no credential and serves METAR, TAF, and international SIGMET results. Its results MUST carry the standard provenance, MUST be marked as not sample data, and MUST follow the no-fabrication rules: a report the upstream does not return is "no data", a time the upstream does not state is null, and an upstream failure is a structured error with no report text.

#### Scenario: Selected without a credential
- **WHEN** the server starts with `awc` named as the weather provider and a NOTAM provider named
- **THEN** startup succeeds with no weather credential configured
- **AND** the startup log states both the weather provider and the NOTAM provider

#### Scenario: METAR and TAF for several aerodromes
- **WHEN** `get_metar` or `get_taf` is invoked with several ICAO indicators against the `awc` provider
- **THEN** the result has one entry per requested indicator, in request order, each carrying the raw report and its observation or issue time as stated upstream
- **AND** the result's provenance names `awc`

#### Scenario: Indicator with no report
- **WHEN** the upstream returns no report for a requested indicator, including an empty response
- **THEN** that indicator's entry has no report and a null time
- **AND** the entries for the other indicators are unaffected

#### Scenario: SIGMETs matched by exact FIR
- **WHEN** `get_sigmet` is invoked for a FIR against the `awc` provider
- **THEN** the result contains exactly the upstream advisories whose FIR identifier equals the requested FIR, each with its validity window as stated upstream or null
- **AND** the report is marked with `unknown` coverage

#### Scenario: Upstream rejects or fails the request
- **WHEN** the upstream answers with a client error, a rate-limit response, or a server error
- **THEN** the tool returns a structured error naming `awc`
- **AND** the result contains no METAR, TAF, or SIGMET text

#### Scenario: Requests identify the client
- **WHEN** the `awc` provider sends any request upstream
- **THEN** the request carries the application's own User-Agent

### Requirement: Separate NOTAM provider
The server SHALL obtain NOTAMs from a NOTAM provider that may differ from the weather provider. The NOTAM provider SHALL default to the weather provider when that provider supplies NOTAMs. When the weather provider does not supply NOTAMs, a NOTAM provider MUST be named explicitly, or startup MUST abort naming the missing setting. Each result MUST name the provider that actually produced it. Rate ceilings, timeouts, and errors MUST apply per upstream provider, so one upstream's failures or budget never affect another's.

#### Scenario: Weather provider without NOTAMs and no NOTAM provider named
- **WHEN** the server starts with `awc` as the weather provider and no NOTAM provider named
- **THEN** startup aborts with an error naming the NOTAM provider setting

#### Scenario: NOTAM provider defaults to the weather provider
- **WHEN** the server starts with a weather provider that supplies NOTAMs and no NOTAM provider named
- **THEN** NOTAMs are served by that same provider

#### Scenario: NOTAM results name their own provider
- **WHEN** `get_notams` is served by a NOTAM provider different from the weather provider
- **THEN** the NOTAM result's provenance names the NOTAM provider, not the weather provider

#### Scenario: Upstream budgets and failures are independent
- **WHEN** the NOTAM provider's rate ceiling is exhausted or its upstream fails
- **THEN** `get_notams` returns a structured error naming the NOTAM provider
- **AND** `get_metar`, `get_taf`, and `get_sigmet` continue to be served by the weather provider

#### Scenario: NOTAM provider named without its credential
- **WHEN** a NOTAM provider that requires a credential is named without it
- **THEN** startup aborts with an error naming that provider and its missing credential
