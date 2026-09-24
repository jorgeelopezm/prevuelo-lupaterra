# Maintenance Tracking Specification

## Purpose

Pilot-maintained maintenance and inspection items with date- and/or hours-based due conditions, remaining-time/remaining-hours derived from the aircraft's logged flights, text-conveyed due status, and completion with recurrence roll-forward — an advisory record, not the aircraft's official continuing-airworthiness record.

## Requirements

### Requirement: Maintenance and inspection items
Each aircraft SHALL carry a pilot-maintained list of maintenance and inspection items. Each item MUST carry a description and at least one due condition: a calendar due date, a due-at airframe or engine hour reading, or both. Each item MAY carry a recurrence interval expressed in months, in hours, or in both, and a reference to the record or work order that last satisfied it.

#### Scenario: Adding a date-based item
- **WHEN** a pilot adds an ELT battery item with a due date for one of their aircraft
- **THEN** the item appears in that aircraft's maintenance panel with its description and due date

#### Scenario: Adding an hours-based item
- **WHEN** a pilot adds an oil change item due at an airframe reading of 1,222.0 hours
- **THEN** the item appears with that due reading

#### Scenario: Item with both conditions
- **WHEN** a pilot adds a 50-hour service item with both a due date and a due hour reading
- **THEN** both conditions are stored and both are shown

#### Scenario: Item with no due condition
- **WHEN** an item is submitted with neither a due date nor a due hour reading
- **THEN** it is not stored and a localized message states that a due condition is required

### Requirement: Remaining time and hours are derived
The time remaining and hours remaining for a maintenance item SHALL be computed at render time — time remaining from the due date and the current date, hours remaining from the due hour reading and the aircraft's current derived hour total. Neither figure may be stored or hand-entered.

#### Scenario: Hours remaining
- **WHEN** an item is due at 1,222.0 airframe hours and the aircraft's derived airframe total is 1,203.7 hours
- **THEN** the panel shows 18.3 hours remaining

#### Scenario: Recomputed after a flight
- **WHEN** a flight is logged on that aircraft
- **THEN** the hours remaining for its items decrease accordingly with no separate value being edited

#### Scenario: Remaining figures are not stored
- **WHEN** the stored representation of a maintenance item is inspected
- **THEN** it contains due conditions but no remaining-time or remaining-hours field

### Requirement: No countdown without the data to compute it
An hours-based countdown SHALL be displayed only when the aircraft has a derivable current hour total. When the aircraft has neither an opening hour offset nor logged flights, the item MUST be shown with its due condition and an explicit localized statement that hours remaining cannot be computed, and MUST NOT show a substituted, assumed, or zero figure.

#### Scenario: Aircraft with no hour data
- **WHEN** an hours-based item belongs to an aircraft with no opening offset and no logged flights
- **THEN** the panel states that hours remaining cannot be computed
- **AND** it displays no numeric hours-remaining value

#### Scenario: Date-based item is unaffected
- **WHEN** the same aircraft has a date-based item
- **THEN** its time remaining is still computed and displayed

### Requirement: Due status is stated in text
Each item SHALL be presented in one of the states — not due, due soon, or overdue — determined from whichever of its due conditions is nearest. The state MUST be conveyed by a localized text label and MUST NOT be conveyed by color alone. An item is due soon when it falls within the configured advance-warning window in days or in hours.

#### Scenario: Overdue item
- **WHEN** an item's due date has passed
- **THEN** it is labeled overdue in localized text alongside any color treatment

#### Scenario: Due soon by hours
- **WHEN** an item's hours remaining fall within the advance-warning hour window
- **THEN** it is labeled due soon in localized text and the hours remaining are shown

#### Scenario: Nearest condition governs
- **WHEN** an item is not yet due by date but is overdue by hours
- **THEN** it is labeled overdue

#### Scenario: Status without color
- **WHEN** the maintenance panel is rendered and color is disregarded
- **THEN** every item's state is still readable from its text

### Requirement: Completing an item
A pilot SHALL be able to record an item as completed, giving the completion date and, where the item is hours-based, the hour reading at completion. When the item has a recurrence interval, completing it MUST roll the due condition forward by that interval from the completion values; when it has none, completing it MUST close the item without inventing a new due condition.

#### Scenario: Recurring item rolls forward
- **WHEN** a 50-hour item due at 1,222.0 hours is completed at 1,220.0 hours
- **THEN** its next due reading becomes 1,270.0 hours

#### Scenario: Recurring by months
- **WHEN** an annual item with a 12-month recurrence is completed on a given date
- **THEN** its next due date is 12 months after that date

#### Scenario: Non-recurring item closes
- **WHEN** an item with no recurrence interval is completed
- **THEN** it is shown as completed with its completion date and no new due condition is created

#### Scenario: Completion history
- **WHEN** an item has been completed and rolled forward
- **THEN** the previous completion remains visible as history

### Requirement: Maintenance data is scoped to its owner
Every read and write of a maintenance item SHALL be constrained by the authenticated pilot's identifier and the ownership of the aircraft it belongs to. A request naming an item on another pilot's aircraft MUST be answered as though it did not exist.

#### Scenario: Another pilot's maintenance item
- **WHEN** a pilot submits an edit or completion for a maintenance item on an aircraft belonging to a different pilot
- **THEN** the response is a not-found result, not a forbidden result
- **AND** the item is unchanged and nothing about it is disclosed

### Requirement: Maintenance panel is advisory, not a release to service
The maintenance panel SHALL present the pilot's own recorded due conditions and the figures derived from them, and MUST state that it is a pilot-maintained record. It MUST NOT assert that an aircraft is airworthy, is released to service, or may legally fly, and MUST NOT present its contents as the aircraft's official continuing-airworthiness record.

#### Scenario: Advisory caveat present
- **WHEN** the maintenance panel is rendered with any item
- **THEN** it carries a localized statement that the items are pilot-entered and are not the official maintenance record

#### Scenario: No airworthiness verdict
- **WHEN** every item on an aircraft is within its due conditions
- **THEN** the panel states that no item is due
- **AND** it does not state that the aircraft is airworthy or cleared to fly
