## MODIFIED Requirements

### Requirement: A flight intent records the minimal identity of a planned flight
The system SHALL let a pilot record a flight intent naming a non-retired aircraft of an operator the pilot is a member of, a planned flight date, a departure aerodrome, and a destination aerodrome. A flight intent MUST be owned by exactly the pilot who created it and MUST NOT be visible or referenceable by any other pilot, including other members of the aircraft's operator.

#### Scenario: Creating a flight intent
- **WHEN** a pilot submits a flight intent naming an aircraft of an operator they belong to, a planned date, and four-letter ICAO departure and destination designators
- **THEN** the flight intent is stored against that pilot and that aircraft

#### Scenario: Aerodrome designators are validated
- **WHEN** a flight intent is submitted with a departure or destination designator that is not a four-letter ICAO location indicator
- **THEN** it is not stored and a localized message names the conflicting field

#### Scenario: Aircraft belonging to another pilot
- **WHEN** a flight intent is submitted naming an aircraft of an operator the pilot is not a member of
- **THEN** the flight intent is not stored and the response discloses nothing about that aircraft

#### Scenario: Cross-pilot visibility is denied
- **WHEN** a pilot requests a flight intent identifier that belongs to another pilot, including a co-member of the aircraft's operator
- **THEN** the request fails as not found, disclosing nothing about the other pilot's flight intent
