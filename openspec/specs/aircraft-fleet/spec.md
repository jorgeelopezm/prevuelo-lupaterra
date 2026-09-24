# Aircraft Fleet Specification

## Purpose

The pilot's aircraft records: identity, per-pilot registration uniqueness, retirement, ownership scoping, the one-active-aircraft designation, airworthiness/document validity tracking with derived expiry status, and the weight & balance profile.

## Requirements

### Requirement: Pilot maintains a set of aircraft
The aircraft and logbook screen SHALL let a signed-in pilot create, view, edit, and retire any number of aircraft they operate. Every aircraft record MUST carry a registration mark, an ICAO aircraft type designator, a manufacturer, and a model/variant designation; and MAY carry a serial number, an aircraft class/category (single-engine piston land, multi-engine piston land, TMG, and the other FCL class/type groupings), an engine designation, a propeller designation, a year of manufacture, a home base aerodrome, and a display nickname.

#### Scenario: Adding an aircraft
- **WHEN** a signed-in pilot submits the add-aircraft form with a registration, type designator, manufacturer, and model
- **THEN** the aircraft is stored against that pilot
- **AND** the screen lists it among the pilot's aircraft with its registration and model shown

#### Scenario: Missing required identification
- **WHEN** the add-aircraft form is submitted without a registration mark
- **THEN** the aircraft is not created
- **AND** the form is redisplayed with a localized field-level validation message and the pilot's other entered values preserved

#### Scenario: Registration format
- **WHEN** a registration is submitted that is not a plausible tail mark (empty, longer than the ICAO maximum, or containing characters outside letters, digits, and hyphen)
- **THEN** the aircraft is not created and a localized validation message names the registration field

#### Scenario: Editing an aircraft
- **WHEN** a pilot changes the model designation of one of their aircraft and saves
- **THEN** the stored record reflects the new value
- **AND** flight entries already logged against that aircraft remain associated with it

#### Scenario: Multiple aircraft
- **WHEN** a pilot has added more than one aircraft
- **THEN** all of them are listed and each can be selected to show its own details, logbook, and maintenance

### Requirement: Registration is unique per pilot
An aircraft registration SHALL be unique within one pilot's set of aircraft. The system MUST NOT prevent two different pilots from recording the same registration.

#### Scenario: Duplicate registration for the same pilot
- **WHEN** a pilot adds an aircraft whose registration matches one they already have
- **THEN** the aircraft is not created
- **AND** a localized message states that the registration is already in use in their aircraft

#### Scenario: Same registration for different pilots
- **WHEN** two different pilots each add an aircraft with the same registration
- **THEN** both records are created and neither pilot's screen reveals the other's

#### Scenario: Registration comparison ignores case and separators
- **WHEN** a pilot who already has `EC-ABC` adds `ec abc`
- **THEN** it is treated as the same registration and rejected as a duplicate

### Requirement: Retiring an aircraft preserves its history
Removing an aircraft from active use SHALL retire it rather than delete its logged history. A retired aircraft MUST NOT be selectable as the active aircraft or as the aircraft of a new flight entry, and MUST remain visible in the pilot's records with its logged flights intact.

#### Scenario: Retiring an aircraft
- **WHEN** a pilot retires an aircraft that has logged flights
- **THEN** those flight entries and their contribution to the pilot's totals are unchanged
- **AND** the aircraft is shown as retired rather than removed from the screen

#### Scenario: Retired aircraft is not offered for new entries
- **WHEN** a pilot opens the new-flight-entry form after retiring an aircraft
- **THEN** the retired aircraft is not offered as a choice

#### Scenario: Retired aircraft cannot be active
- **WHEN** the pilot's active aircraft is retired
- **THEN** the pilot has no active aircraft until they designate another

### Requirement: Aircraft records are scoped to their owner
Every read and write of an aircraft record SHALL be constrained by the authenticated pilot's identifier. A request naming an aircraft belonging to another pilot MUST be answered as though the record did not exist, disclosing nothing about its existence.

#### Scenario: Another pilot's aircraft
- **WHEN** a signed-in pilot requests an aircraft identifier that belongs to a different pilot
- **THEN** the response is a not-found result, not a forbidden result
- **AND** the response body contains no registration, model, or other detail of that aircraft

#### Scenario: Unauthenticated request
- **WHEN** an unauthenticated request is made to any aircraft or logbook route
- **THEN** it is redirected to sign in and no aircraft data is rendered

### Requirement: One active aircraft per pilot
A pilot SHALL be able to designate exactly one of their non-retired aircraft as active. The designation MUST be persisted against the pilot, MUST survive sign-out and sign-in, and MUST be readable by other feature modules. A pilot with no aircraft, or who has not chosen one, has no active aircraft.

#### Scenario: Designating an active aircraft
- **WHEN** a pilot designates one of their aircraft as active
- **THEN** that aircraft is recorded as their active aircraft
- **AND** any previously active aircraft is no longer active

#### Scenario: Active aircraft persists across sessions
- **WHEN** a pilot signs out and signs back in
- **THEN** the aircraft they designated is still their active aircraft

#### Scenario: No active aircraft
- **WHEN** a pilot has not designated an active aircraft
- **THEN** the screen and the shell header state that no aircraft is selected, in text, and offer the means to choose one

### Requirement: Airworthiness and document validity records
Each aircraft SHALL carry a set of validity records covering at least the certificate of airworthiness, the airworthiness review certificate, the certificate of registration, the insurance policy, the aircraft radio station licence, the noise certificate, the mass and balance statement, and the ELT registration. Each record MUST carry a document kind, an optional issue date, an expiry date where the kind has one, and an optional reference/serial. Documents whose kind does not expire MUST be recordable without an expiry date.

#### Scenario: Recording a document
- **WHEN** a pilot records an ARC with an expiry date for one of their aircraft
- **THEN** the document appears in that aircraft's airworthiness panel with its kind, reference, and expiry date

#### Scenario: Non-expiring document
- **WHEN** a pilot records a certificate of registration with no expiry date
- **THEN** it is stored and displayed without an expiry, and without being reported as expired

#### Scenario: Invalid dates
- **WHEN** a document is submitted with an expiry date earlier than its issue date
- **THEN** it is not stored and a localized validation message names the conflict

### Requirement: Document validity status is derived, never entered
The expiring-soon and expired states of a document SHALL be computed from its expiry date and the current date at render time. The system MUST NOT store, accept, or display a hand-entered status, and MUST convey the status in text as well as by color.

#### Scenario: Expired document
- **WHEN** a document's expiry date is earlier than the current date
- **THEN** the panel marks it expired with a localized text label, not by color alone

#### Scenario: Expiring soon
- **WHEN** a document's expiry date falls within the configured advance-warning window
- **THEN** the panel marks it as expiring soon with a localized text label and the number of days remaining

#### Scenario: No status without a date
- **WHEN** a document has no expiry date
- **THEN** no validity countdown or status chip is rendered for it

#### Scenario: Status is not stored
- **WHEN** the stored representation of a document is inspected
- **THEN** it contains no status, countdown, or days-remaining field

### Requirement: Weight and balance profile
Each aircraft SHALL be able to carry a weight and balance profile consisting of the empty weight, the empty-weight arm or moment, the maximum take-off weight, the maximum landing weight, the maximum zero-fuel weight where applicable, the usable fuel quantity and its arm, an ordered list of load stations each with a name, arm, and maximum weight, and an ordered list of centre-of-gravity envelope points. The profile MUST record the mass and length units it was entered in, and MUST NOT be required in order to create an aircraft.

#### Scenario: Storing a profile
- **WHEN** a pilot enters an empty weight, empty-weight arm, MTOW, and two load stations for an aircraft
- **THEN** the profile is stored against that aircraft and redisplayed with the same values and units

#### Scenario: Aircraft without a profile
- **WHEN** an aircraft has no weight and balance profile
- **THEN** the panel states that no profile has been entered
- **AND** no weight, arm, or envelope value is displayed

#### Scenario: Inconsistent limits
- **WHEN** a profile is submitted whose empty weight is greater than its maximum take-off weight
- **THEN** it is not stored and a localized validation message names the conflict

#### Scenario: Units are preserved
- **WHEN** a profile entered in kilograms and millimetres is redisplayed
- **THEN** its values are shown in the units they were entered in, labeled with those units, with no silent conversion

### Requirement: Aircraft screen is fully localized
Every label, heading, unit abbreviation, validation message, empty state, and status word introduced by the aircraft screen SHALL come from the locale catalogs. The catalogs for all supported locales MUST carry the same key set.

#### Scenario: Locale rendering
- **WHEN** the aircraft screen is requested under each supported locale
- **THEN** each renders its own locale's text with no untranslated key and no hardcoded source-language string

#### Scenario: Catalog parity
- **WHEN** the locale catalogs are compared
- **THEN** every key used by the aircraft screen is present in all of them

### Requirement: Empty fleet state
A pilot who has not yet added an aircraft SHALL be shown a localized empty state explaining what the screen is for and offering the add-aircraft action. That state MUST NOT display any sample registration, hour reading, or due date.

#### Scenario: First visit
- **WHEN** a pilot with no aircraft opens the aircraft screen
- **THEN** it renders the shell, a localized empty state, and an add-aircraft control
- **AND** it contains no registration, Hobbs, tach, fuel, maintenance, or engine value
