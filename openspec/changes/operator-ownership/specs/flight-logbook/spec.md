## MODIFIED Requirements

### Requirement: Flight entry records both the aircraft leg and the pilot's flight time
The logbook SHALL record one entry per flight leg, owned by the pilot and linked to exactly one aircraft of an operator the pilot is a member of at the time of logging. Each entry MUST carry the flight date, departure aerodrome and off-block or take-off time in UTC, arrival aerodrome and on-block or landing time in UTC, total flight time, the capacity in which the pilot acted, and the number of day and night landings. Each entry MUST additionally be able to carry the aircraft-side counters — Hobbs reading out and in, tach reading out and in, fuel uplifted, fuel burned, and passengers carried — and the remaining EASA FCL.050 columns: single-engine or multi-engine, night time, IFR time, cross-country time, instrument time, and free-text remarks.

#### Scenario: Logging a flight
- **WHEN** a pilot submits a flight entry naming an aircraft of an operator they belong to, a date, departure and arrival aerodromes with UTC times, a total flight time, a pilot function, and landing counts
- **THEN** the entry is stored against that pilot and that aircraft
- **AND** it appears in the pilot's own recent-flights list for that aircraft

#### Scenario: Aircraft of an operator the pilot does not belong to
- **WHEN** a pilot submits a flight entry naming an aircraft of an operator they are not a member of
- **THEN** the entry is not stored and the response discloses nothing about that aircraft

#### Scenario: Aircraft-side counters are optional
- **WHEN** a flight entry is submitted with no Hobbs or tach readings
- **THEN** the entry is stored and listed, with the counter columns shown as not recorded rather than as zero

#### Scenario: Pilot function is recorded
- **WHEN** a flight entry is logged with the pilot acting as pilot-in-command
- **THEN** the entry records that function
- **AND** its total flight time contributes to the pilot's pilot-in-command total and not to the dual, co-pilot, or instructor totals

#### Scenario: Night and IFR conditions
- **WHEN** a flight entry records night time and IFR time no greater than its total flight time
- **THEN** both are stored and contribute to the corresponding pilot totals

### Requirement: Aircraft hour totals are derived from logged flights
An aircraft's total airframe time, engine time, tach time, and landing count SHALL be computed from the logged flight entries of every pilot who has logged that aircraft, plus a per-aircraft opening offset recorded when logging of that aircraft begins. The system MUST NOT store an aircraft total as an independently editable number, MUST NOT display a total it cannot compute, and MUST expose these totals only as aggregates.

#### Scenario: Total after logging a flight
- **WHEN** a pilot logs a flight of 0.9 hours on an aircraft whose opening airframe offset is 1,200.0 hours and which has no other entries
- **THEN** the aircraft's displayed airframe total is 1,200.9 hours

#### Scenario: Total across co-owners
- **WHEN** a second member of the aircraft's operator logs a flight of 1.5 hours on that aircraft
- **THEN** both members see an airframe total of 1,202.4 hours
- **AND** neither sees the other's entry

#### Scenario: Correcting an entry updates the total
- **WHEN** a pilot edits a logged flight's total time
- **THEN** the aircraft's displayed total changes accordingly without any separate total being edited

#### Scenario: Totals are not stored
- **WHEN** the stored representation of an aircraft is inspected
- **THEN** it contains an opening offset but no current airframe total, engine total, or landing count

#### Scenario: No offset recorded
- **WHEN** an aircraft has no opening offset and no logged flights
- **THEN** the screen states that no hours have been recorded rather than displaying zero as an airframe total

### Requirement: New entry is pre-filled from the aircraft's last flight
When a pilot opens the new-entry form for an aircraft on which that pilot has already logged flights, the form SHALL pre-fill the Hobbs-out and tach-out readings from that pilot's own most recent entry's in-readings on that aircraft, and the departure aerodrome from that entry's arrival aerodrome. The form MUST NOT pre-fill any value from another pilot's entry. Every pre-filled value MUST remain editable and MUST be visibly presented as a starting value rather than a recorded one.

#### Scenario: Continuing from the last flight
- **WHEN** a pilot opens the new-entry form for an aircraft whose last flight by that pilot ended at `LEMD` with a Hobbs-in of 1,203.7
- **THEN** the form offers `LEMD` as departure and 1,203.7 as Hobbs-out
- **AND** both remain editable

#### Scenario: A co-owner flew it since
- **WHEN** another member has logged a later flight on the same aircraft
- **THEN** the form still pre-fills only from the opening pilot's own last flight
- **AND** no value from the other member's entry appears in the form

#### Scenario: First flight on an aircraft
- **WHEN** the pilot has no previous entries on the aircraft
- **THEN** the form is presented empty, with no invented readings
