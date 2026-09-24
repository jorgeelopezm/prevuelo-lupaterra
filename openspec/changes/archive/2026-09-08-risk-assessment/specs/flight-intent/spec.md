## ADDED Requirements

### Requirement: A flight intent records the minimal identity of a planned flight
The system SHALL let a pilot record a flight intent naming one of their own non-retired aircraft, a planned flight date, a departure aerodrome, and a destination aerodrome. A flight intent MUST be owned by exactly the pilot who created it and MUST NOT be visible or referenceable by any other pilot.

#### Scenario: Creating a flight intent
- **WHEN** a pilot submits a flight intent naming one of their aircraft, a planned date, and four-letter ICAO departure and destination designators
- **THEN** the flight intent is stored against that pilot and that aircraft

#### Scenario: Aerodrome designators are validated
- **WHEN** a flight intent is submitted with a departure or destination designator that is not a four-letter ICAO location indicator
- **THEN** it is not stored and a localized message names the conflicting field

#### Scenario: Aircraft belonging to another pilot
- **WHEN** a flight intent is submitted naming an aircraft identifier that belongs to a different pilot
- **THEN** the flight intent is not stored and the response discloses nothing about that aircraft

#### Scenario: Cross-pilot visibility is denied
- **WHEN** a pilot requests a flight intent identifier that belongs to another pilot
- **THEN** the request fails as not found, disclosing nothing about the other pilot's flight intent

### Requirement: A flight intent is a stable attachment point for other records
A flight intent's identifier SHALL remain valid and resolvable for the lifetime of the record, so that other capabilities (present or future) can reference it by identifier without that reference becoming invalid. The system MUST NOT allow a flight intent to be deleted once at least one other record references it.

#### Scenario: Flight intent persists after being referenced
- **WHEN** a flight intent has at least one risk assessment recorded against it
- **THEN** the flight intent cannot be deleted

#### Scenario: Flight intent with no references
- **WHEN** a flight intent has no risk assessment or other record referencing it
- **THEN** the pilot may delete it
