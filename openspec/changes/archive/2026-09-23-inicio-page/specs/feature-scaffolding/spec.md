## MODIFIED Requirements

### Requirement: Placeholder screens state their status honestly
A feature screen whose capability is not yet implemented SHALL render the application shell together with an explicit, localized statement that the capability is not yet available. Such a screen MUST NOT display invented weather, NOTAM, telemetry, checklist, risk, or regulatory values, and MUST NOT present any value that could be mistaken for operational data. A screen governed by its own implemented capability is no longer a placeholder and is excluded from this requirement — including the aircraft and logbook screen, governed by the `aircraft-fleet`, `flight-logbook`, `maintenance-tracking`, and `engine-data-import` capabilities; the weather and NOTAMs screen, governed by the `weather-notams-page` capability; and the locale-root home screen, governed by the `home-dashboard` capability. The no-fabrication rule those capabilities carry is not relaxed by the exclusion: an implemented screen states unavailability in text and displays no value it cannot source.

#### Scenario: Placeholder content
- **WHEN** an unimplemented feature screen is rendered
- **THEN** it contains a localized not-yet-available notice identifying the capability
- **AND** it contains no METAR, TAF, NOTAM, engine, fuel, maintenance, or risk-score value

#### Scenario: Placeholder is visually identifiable
- **WHEN** an unimplemented feature screen is rendered
- **THEN** its not-yet-available state is conveyed by text, not by color alone

#### Scenario: Prototype sample data is not carried over
- **WHEN** the rendered output of any placeholder screen is inspected
- **THEN** it contains none of the prototype's sample values

#### Scenario: Weather screen no longer a placeholder
- **WHEN** the weather and NOTAMs screen is requested
- **THEN** it renders real METAR/TAF/NOTAM/SIGMET data per the `weather-notams-page` capability rather than the shared not-yet-available partial

#### Scenario: Aircraft and logbook screen no longer a placeholder
- **WHEN** the aircraft and logbook screen is requested by a signed-in pilot
- **THEN** it renders the pilot's own aircraft, logbook, maintenance, and engine-data state rather than the shared not-yet-available partial

#### Scenario: Home screen no longer a placeholder
- **WHEN** the locale root is requested
- **THEN** it renders the pre-flight brief per the `home-dashboard` capability rather than the shared not-yet-available partial

#### Scenario: Implemented screen with nothing to show
- **WHEN** the aircraft and logbook screen is requested by a pilot who has recorded nothing
- **THEN** it states in localized text that no aircraft, flight, maintenance item, or engine data has been recorded
- **AND** it displays no registration, hour reading, due date, or engine value

#### Scenario: Checklists and documents remain placeholders
- **WHEN** the checklists screen or the documents and AIS screen is requested
- **THEN** it renders the shared not-yet-available partial
- **AND** it contains no METAR, TAF, NOTAM, engine, fuel, maintenance, or risk-score value
