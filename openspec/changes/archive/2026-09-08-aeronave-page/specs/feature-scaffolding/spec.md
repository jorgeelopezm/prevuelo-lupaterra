## MODIFIED Requirements

### Requirement: Placeholder screens state their status honestly
A feature screen whose capability is not yet implemented SHALL render the application shell together with an explicit, localized statement that the capability is not yet available. Such a screen MUST NOT display invented weather, NOTAM, telemetry, checklist, risk, or regulatory values, and MUST NOT present any value that could be mistaken for operational data. A screen governed by its own implemented capability is no longer a placeholder and is excluded from this requirement — including the aircraft and logbook screen, governed by the `aircraft-fleet`, `flight-logbook`, `maintenance-tracking`, and `engine-data-import` capabilities, and the weather and NOTAMs screen, governed by the `weather-notams-page` capability. The no-fabrication rule those capabilities carry is not relaxed by the exclusion: an implemented screen states unavailability in text and displays no value it cannot source.

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

#### Scenario: Implemented screen with nothing to show
- **WHEN** the aircraft and logbook screen is requested by a pilot who has recorded nothing
- **THEN** it states in localized text that no aircraft, flight, maintenance item, or engine data has been recorded
- **AND** it displays no registration, hour reading, due date, or engine value

## ADDED Requirements

### Requirement: Shell header presents the pilot's active aircraft
The application shell's active-aircraft control SHALL render the registration of the aircraft the signed-in pilot has designated as active, in every navigation presentation and at every supported viewport width. When the pilot has designated none, the control MUST state that in localized text rather than being blank or showing a sample registration. The control MUST link to the aircraft screen so the designation can be made or changed, and MUST meet the shell's touch-target requirement.

#### Scenario: Active aircraft shown
- **WHEN** a pilot with a designated active aircraft renders any screen
- **THEN** the shell header shows that aircraft's registration

#### Scenario: No active aircraft
- **WHEN** a pilot with no designated active aircraft renders any screen
- **THEN** the header states in localized text that no aircraft is selected
- **AND** it shows no registration

#### Scenario: Control is a navigation destination
- **WHEN** the active-aircraft control is activated
- **THEN** the aircraft screen is reached, without JavaScript being required

#### Scenario: Control at phone width
- **WHEN** the shell is rendered at a 320px viewport width
- **THEN** the active-aircraft control is present and its activatable region measures at least 44 by 44 CSS pixels

#### Scenario: Unauthenticated shell
- **WHEN** the shell is rendered for a request with no signed-in pilot
- **THEN** the active-aircraft control shows no registration
