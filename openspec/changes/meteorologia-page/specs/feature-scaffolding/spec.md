## MODIFIED Requirements

### Requirement: Placeholder screens state their status honestly
A feature screen whose capability is not yet implemented SHALL render the application shell together with an explicit, localized statement that the capability is not yet available. Such a screen MUST NOT display invented weather, NOTAM, telemetry, checklist, risk, or regulatory values, and MUST NOT present any value that could be mistaken for operational data. The weather and NOTAMs screen is no longer a placeholder: it is excluded from this requirement and instead governed by the `weather-notams-page` capability.

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
