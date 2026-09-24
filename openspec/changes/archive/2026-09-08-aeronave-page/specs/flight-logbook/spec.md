## ADDED Requirements

### Requirement: Flight entry records both the aircraft leg and the pilot's flight time
The logbook SHALL record one entry per flight leg, owned by the pilot and linked to exactly one of that pilot's aircraft. Each entry MUST carry the flight date, departure aerodrome and off-block or take-off time in UTC, arrival aerodrome and on-block or landing time in UTC, total flight time, the capacity in which the pilot acted, and the number of day and night landings. Each entry MUST additionally be able to carry the aircraft-side counters — Hobbs reading out and in, tach reading out and in, fuel uplifted, fuel burned, and passengers carried — and the remaining EASA FCL.050 columns: single-engine or multi-engine, night time, IFR time, cross-country time, instrument time, and free-text remarks.

#### Scenario: Logging a flight
- **WHEN** a pilot submits a flight entry naming one of their aircraft, a date, departure and arrival aerodromes with UTC times, a total flight time, a pilot function, and landing counts
- **THEN** the entry is stored against that pilot and that aircraft
- **AND** it appears in the aircraft's recent-flights list

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

### Requirement: Flight entry validation
A flight entry SHALL be rejected, with a localized field-level message and the pilot's other entered values preserved, when its values are not internally consistent. The system MUST reject an entry whose aircraft is not one of the pilot's non-retired aircraft, whose aerodrome designators are not four-letter ICAO location indicators, whose total flight time is not positive, whose night, IFR, cross-country, instrument, or function time exceeds the total flight time, whose sum of function times exceeds the total flight time, whose in-readings are lower than its out-readings, whose landing counts or passenger count are negative, or whose date is in the future.

#### Scenario: Night time exceeding total time
- **WHEN** an entry is submitted with a night time greater than its total flight time
- **THEN** it is not stored and a localized message names the conflicting fields

#### Scenario: Hobbs reading decreasing
- **WHEN** an entry is submitted whose Hobbs-in reading is lower than its Hobbs-out reading
- **THEN** it is not stored and a localized message names the conflict

#### Scenario: Malformed aerodrome designator
- **WHEN** an entry is submitted with a departure aerodrome of `LE` or `LEMDX`
- **THEN** it is not stored and a localized message names the departure field

#### Scenario: Aircraft belonging to another pilot
- **WHEN** an entry is submitted naming an aircraft identifier that belongs to a different pilot
- **THEN** the entry is not stored and the response discloses nothing about that aircraft

#### Scenario: Future date
- **WHEN** an entry is submitted with a flight date after the current date
- **THEN** it is not stored and a localized message names the date field

### Requirement: Aircraft hour totals are derived from logged flights
An aircraft's total airframe time, engine time, tach time, and landing count SHALL be computed from its logged flight entries plus a per-aircraft opening offset recorded when the pilot begins logging that aircraft. The system MUST NOT store an aircraft total as an independently editable number, and MUST NOT display a total it cannot compute.

#### Scenario: Total after logging a flight
- **WHEN** a pilot logs a flight of 0.9 hours on an aircraft whose opening airframe offset is 1,200.0 hours and which has no other entries
- **THEN** the aircraft's displayed airframe total is 1,200.9 hours

#### Scenario: Correcting an entry updates the total
- **WHEN** a pilot edits a logged flight's total time
- **THEN** the aircraft's displayed total changes accordingly without any separate total being edited

#### Scenario: Totals are not stored
- **WHEN** the stored representation of an aircraft is inspected
- **THEN** it contains an opening offset but no current airframe total, engine total, or landing count

#### Scenario: No offset recorded
- **WHEN** an aircraft has no opening offset and no logged flights
- **THEN** the screen states that no hours have been recorded rather than displaying zero as an airframe total

### Requirement: Pilot totals and recent experience are derived from logged flights
The screen SHALL present the pilot's totals computed from their flight entries — total time, time per pilot function, time per engine class, night time, IFR time, cross-country time, instrument time, and total landings — together with recent-experience windows: take-offs and landings in the preceding 90 days, and night take-offs and landings in the preceding 90 days. Every one of these figures MUST be computed at render time from the entries and MUST NOT be stored.

#### Scenario: Recent experience window
- **WHEN** the pilot has logged three landings within the last 90 days and two landings 120 days ago
- **THEN** the 90-day landing figure is three

#### Scenario: Night recency counted separately
- **WHEN** the pilot has logged landings within the last 90 days of which one was at night
- **THEN** the 90-day night landing figure is one and the 90-day total landing figure counts all of them

#### Scenario: Recency is a count, not a currency verdict
- **WHEN** the recent-experience panel is rendered
- **THEN** it presents the counted figures and the window they cover
- **AND** it does not assert that the pilot is or is not legally current

#### Scenario: No entries
- **WHEN** the pilot has logged no flights
- **THEN** the totals panel states that no flights have been logged rather than displaying zeroes as totals

### Requirement: Simulator sessions are recorded separately
Flight simulation training device sessions SHALL be recorded as their own entries carrying the date, the device type, the device qualification number, the session duration, and the pilot function. An FSTD session MUST NOT contribute to any aircraft's airframe, engine, tach, or landing totals, and MUST be totaled separately from flight time in the pilot's totals.

#### Scenario: Logging a simulator session
- **WHEN** a pilot logs a two-hour FSTD session with a device type and qualification number
- **THEN** it appears in the logbook identified as a simulator session

#### Scenario: Simulator time excluded from aircraft totals
- **WHEN** an FSTD session has been logged
- **THEN** no aircraft's airframe, engine, tach, or landing total changes

#### Scenario: Simulator time totaled separately
- **WHEN** the pilot's totals are rendered
- **THEN** FSTD time is presented under its own total and is not added into total flight time

### Requirement: Editing and deleting entries
A pilot SHALL be able to edit and delete their own flight entries. Every derived aircraft and pilot total MUST reflect the change immediately afterwards. A deletion MUST be confirmed before it takes effect.

#### Scenario: Deleting an entry
- **WHEN** a pilot confirms deletion of a logged flight
- **THEN** the entry no longer appears in the logbook
- **AND** the aircraft and pilot totals are recomputed without it

#### Scenario: Deletion requires confirmation
- **WHEN** a delete action is initiated
- **THEN** the entry is not removed until the pilot confirms

#### Scenario: Another pilot's entry
- **WHEN** a pilot submits an edit or delete for a flight entry belonging to a different pilot
- **THEN** the response is a not-found result and the entry is unchanged

### Requirement: New entry is pre-filled from the aircraft's last flight
When a pilot opens the new-entry form for an aircraft that already has logged flights, the form SHALL pre-fill the Hobbs-out and tach-out readings from that aircraft's most recent entry's in-readings, and the departure aerodrome from that entry's arrival aerodrome. Every pre-filled value MUST remain editable and MUST be visibly presented as a starting value rather than a recorded one.

#### Scenario: Continuing from the last flight
- **WHEN** a pilot opens the new-entry form for an aircraft whose last flight ended at `LEMD` with a Hobbs-in of 1,203.7
- **THEN** the form offers `LEMD` as departure and 1,203.7 as Hobbs-out
- **AND** both remain editable

#### Scenario: First flight on an aircraft
- **WHEN** the aircraft has no previous entries
- **THEN** the form is presented empty, with no invented readings

### Requirement: Logbook listing
The logbook SHALL list a pilot's entries in reverse chronological order, filterable by aircraft, and paged so that a long history does not render as a single unbounded page. Each listed entry MUST show at least the date, the aircraft registration, the route, the total time, and the pilot function.

#### Scenario: Reverse chronological order
- **WHEN** the logbook is listed
- **THEN** the most recent flight appears first

#### Scenario: Filtering by aircraft
- **WHEN** an aircraft is selected
- **THEN** the listing shows only that aircraft's entries and the totals shown alongside are that aircraft's

#### Scenario: Paging a long history
- **WHEN** a pilot has more entries than one page holds
- **THEN** the listing renders one page with navigation to the rest, and the derived totals still cover every entry, not only the visible page
