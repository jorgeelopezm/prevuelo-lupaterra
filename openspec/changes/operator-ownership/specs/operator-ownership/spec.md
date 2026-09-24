## Purpose

Lets aircraft-bound records be shared by the members of an operator while every pilot's personal records stay private to that pilot, with access enforced both in the application and in the database.

## ADDED Requirements

### Requirement: Every pilot belongs to a personal operator
The system SHALL maintain operators and pilot memberships in them. Every pilot MUST be a member of exactly one personal operator, created in the same transaction as the pilot's account. Existing pilots MUST be backfilled with a personal operator that takes ownership of their existing aircraft-bound records. A pilot MAY also be a member of other operators, and one sign-in SHALL give access to the aircraft of every operator the pilot belongs to, without switching context.

#### Scenario: Registration creates a personal operator
- **WHEN** a new pilot registers
- **THEN** a personal operator exists with that pilot as its only member

#### Scenario: Backfill preserves existing data
- **WHEN** the migration runs against a database with existing pilots and aircraft
- **THEN** each pilot has a personal operator owning exactly the aircraft-bound records that pilot owned before
- **AND** every screen shows the same records to that pilot as before the migration

#### Scenario: Backfill is idempotent
- **WHEN** the backfill runs a second time
- **THEN** no operator or membership is duplicated

#### Scenario: Member of several operators
- **WHEN** a pilot who is a member of two operators views the aircraft screen
- **THEN** the aircraft of both operators are listed without any context switch

### Requirement: Aircraft-bound records are owned by an operator and shared by its members
Aircraft and every record bound to an aircraft (documents, weight and balance, maintenance items and completions, checklists and their items, and imported engine-monitor data) SHALL be owned by the aircraft's operator. Every member of that operator MUST be able to read and edit them. A pilot who is not a member MUST receive a not-found result that discloses nothing. The database MUST reject an aircraft-bound row whose operator differs from its parent aircraft's operator. Each aircraft-bound row MUST record the pilot who created it and the pilot who last updated it.

#### Scenario: Co-owner sees and edits a shared aircraft
- **WHEN** a pilot who is a member of an aircraft's operator opens that aircraft's maintenance, documents, or checklists
- **THEN** the records are shown and the member can edit them

#### Scenario: Non-member is answered not-found
- **WHEN** a pilot who is not a member of an aircraft's operator requests or submits against that aircraft or any record bound to it
- **THEN** the response is a not-found result, not a forbidden result, and nothing is changed or disclosed

#### Scenario: Cross-operator child row is rejected
- **WHEN** a write attempts to store an aircraft-bound row naming an operator other than its aircraft's operator
- **THEN** the database rejects it

#### Scenario: Audit of who changed a shared record
- **WHEN** a member edits a shared maintenance item
- **THEN** the item records that member as its last updater, and its creator is unchanged

### Requirement: Personal records are never visible to an operator
A pilot's logbook entries, flight intents, risk assessments, and checklist runs SHALL remain owned by that pilot alone and MUST NOT be readable by any other pilot, including co-members of the operator of the aircraft they reference. Any future sharing of a personal record MUST be an explicit, revocable opt-in by its owner; this change introduces none.

#### Scenario: Co-owner cannot read another member's flights
- **WHEN** a co-owner of an aircraft requests the logbook, a flight entry, a flight intent, a risk assessment, or a checklist run belonging to another member
- **THEN** the response is a not-found result and none of that record's fields appear in it

#### Scenario: Leaving an operator keeps the logbook
- **WHEN** a member leaves an operator
- **THEN** they lose access to its aircraft-bound records
- **AND** their own logbook entries on its aircraft remain in their logbook

### Requirement: Shared aircraft totals are aggregate only
An aircraft's airframe, engine, and tach totals and landing count SHALL be computed from its opening offset plus the flight entries of every pilot who has logged it, including pilots who are no longer members. These totals MUST be exposed only as aggregate values to members of the aircraft's operator. No query available to a member SHALL return another pilot's individual flight entries. The system MUST return no total, rather than a partial one, when it cannot compute the complete aggregate.

#### Scenario: Total includes every member's flights
- **WHEN** an aircraft with an opening offset of 1,200.0 hours has flights of 0.9 hours by one member and 1.5 hours by another
- **THEN** both members see an airframe total of 1,202.4 hours

#### Scenario: Leaver's flights still count
- **WHEN** a member who logged 1.5 hours on an aircraft leaves its operator
- **THEN** the remaining members' airframe total still includes those 1.5 hours

#### Scenario: Hours-based maintenance uses the complete aggregate
- **WHEN** an hours-based maintenance item's remaining hours are computed for a shared aircraft
- **THEN** they use the aggregate across all members' flights, never a single member's flights

#### Scenario: Non-member gets no total
- **WHEN** a pilot who is not a member requests an aircraft's totals
- **THEN** no total is returned and nothing about the aircraft is disclosed

#### Scenario: Known inference limitation
- **WHEN** an operator has exactly two members
- **THEN** each can derive the other's total time on the aircraft from the aggregate and their own flights, and this limitation is stated in the privacy documentation

### Requirement: Access is enforced by the database as well as the application
Every feature table SHALL have row-level security enabled and forced. The application MUST connect as a role that owns no table and cannot bypass row-level security. Each request MUST run in a transaction that sets the acting pilot as a transaction-local setting. With no acting pilot set, every policy MUST expose no rows and accept no writes. A function that computes an aggregate across members MUST be owned by a role that bypasses row-level security, so it never silently computes a partial result.

#### Scenario: No acting pilot set
- **WHEN** a query runs on the application role without an acting pilot
- **THEN** it returns no rows from any feature table and any write is rejected

#### Scenario: Setting does not leak across requests
- **WHEN** a request's transaction commits and its pooled connection serves the next request
- **THEN** the next request starts with no acting pilot until it sets its own

#### Scenario: Application bug is caught by the database
- **WHEN** an application query omits its membership scoping for an aircraft-bound table
- **THEN** the database still returns only rows of operators the acting pilot belongs to

#### Scenario: Write outside the pilot's operators is rejected
- **WHEN** a write names an aircraft or operator the acting pilot does not belong to
- **THEN** the database rejects it

#### Scenario: Aggregate function cannot undercount
- **WHEN** the aggregate-total function's owner is inspected by the live test suite
- **THEN** it is a role that bypasses row-level security
- **AND** the aggregate for a two-member aircraft equals the offset plus both members' flights
