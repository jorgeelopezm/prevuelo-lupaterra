## ADDED Requirements

### Requirement: Every aircraft has a checklist library from the moment it exists
The system SHALL create a checklist library for an aircraft in the same transaction that creates the aircraft, seeded from a built-in generic general-aviation template of normal and emergency procedures. The seeded rows MUST be owned by the pilot who owns the aircraft, and the template MUST NOT be re-applied to, merged into, or otherwise allowed to modify those rows afterwards. Aircraft recorded before this capability existed SHALL be backfilled with the same seed.

#### Scenario: Seeding on aircraft creation
- **WHEN** a pilot records a new aircraft
- **THEN** that aircraft has a checklist library containing the template's normal and emergency checklists with their items in order
- **AND** every seeded row is owned by that pilot

#### Scenario: Seeding failure does not create a half-created aircraft
- **WHEN** seeding the checklist library fails while an aircraft is being recorded
- **THEN** the aircraft is not recorded either, and the pilot sees a localized failure message

#### Scenario: Template changes do not reach existing libraries
- **WHEN** the built-in template is revised after an aircraft was seeded from it
- **THEN** that aircraft's checklists and items are unchanged

#### Scenario: Aircraft recorded before this capability
- **WHEN** an aircraft that predates this capability is opened
- **THEN** it has the same seeded checklist library as a newly recorded aircraft

### Requirement: Seeded content is labeled generic until the pilot makes it theirs
Checklist content that came from the built-in template SHALL be marked as template-sourced, and every screen that displays a template-sourced checklist MUST state in localized text that the content is generic and is not the aircraft's Pilot Operating Handbook or Aircraft Flight Manual. The system MUST NOT present template-sourced content as aircraft-specific, certificated, or authoritative. A checklist SHALL cease to be template-sourced once the pilot edits it.

#### Scenario: Caveat on template-sourced content
- **WHEN** a template-sourced checklist is rendered, whether as a list, a run, or an emergency reference
- **THEN** the rendered output contains a localized statement that the content is generic and is not the aircraft's POH or AFM

#### Scenario: Caveat is conveyed in text
- **WHEN** the generic-content caveat is rendered
- **THEN** it is stated in text, not by color alone

#### Scenario: Caveat disappears once the pilot edits
- **WHEN** a pilot edits a template-sourced checklist's name or any of its items
- **THEN** that checklist is no longer template-sourced and the generic-content caveat is no longer rendered for it

#### Scenario: No aircraft-specific claim
- **WHEN** any screen displays template-sourced content
- **THEN** it does not describe that content as the aircraft's own, approved, or certificated procedures

### Requirement: Checklists are grouped as normal or emergency
Every checklist SHALL declare exactly one kind: normal procedures or emergency procedures. The system MUST render the two groups as distinct, labeled groups in the selector, and MUST convey the emergency grouping by a text label, not by color alone.

#### Scenario: Grouped selector
- **WHEN** a pilot opens an aircraft's checklists
- **THEN** its normal checklists and its emergency checklists are rendered as two separately labeled groups

#### Scenario: Emergency grouping is not color-only
- **WHEN** the emergency group is rendered
- **THEN** its emergency status is stated in localized text

### Requirement: Emergency checklists are reference-only
An emergency checklist SHALL be displayed as read-only procedure text. The system MUST NOT render confirmation controls, progress, or completion state for an emergency checklist, MUST NOT record a run against one, and MUST reject a request to start, toggle, reset, or complete a run against one. The emergency screen MUST state in localized text that it is a ground reference and that this application makes no availability guarantee without connectivity.

#### Scenario: No confirmation controls
- **WHEN** an emergency checklist is rendered
- **THEN** its items appear as read-only text with no checkbox, no toggle control, and no completion counter or progress indicator

#### Scenario: Starting a run against an emergency checklist
- **WHEN** a request attempts to start or modify a run against an emergency checklist
- **THEN** the request is rejected and no run is recorded

#### Scenario: Connectivity caveat
- **WHEN** an emergency checklist is rendered
- **THEN** it contains a localized statement that it is a ground reference with no offline availability guarantee

### Requirement: A pilot owns and edits their aircraft's checklists
A pilot SHALL be able to create, rename, reorder, and delete checklists for one of their own aircraft, and to add, edit, reorder, and delete the items within a checklist. Every checklist and item MUST be owned by exactly the pilot who owns its aircraft, MUST NOT be visible or referenceable by any other pilot, and the system MUST reject a write naming an aircraft, checklist, or item that belongs to another pilot without disclosing anything about it.

#### Scenario: Creating a checklist
- **WHEN** a pilot submits a new checklist naming one of their aircraft, a name, and a kind
- **THEN** the checklist is stored against that pilot and that aircraft and appears in the matching group

#### Scenario: Editing an item
- **WHEN** a pilot edits the text of an item in one of their checklists
- **THEN** the item's text is updated and the checklist's order is unchanged

#### Scenario: Reordering
- **WHEN** a pilot moves a checklist or an item up or down
- **THEN** the new order is stored and is the order rendered on the next request

#### Scenario: Empty name is rejected
- **WHEN** a checklist or item is submitted with an empty or whitespace-only name or text
- **THEN** it is not stored and a localized message names the conflicting field

#### Scenario: Cross-pilot access is denied
- **WHEN** a pilot requests or submits against a checklist or item identifier belonging to another pilot
- **THEN** the request fails as not found, disclosing nothing about the other pilot's data

#### Scenario: Unauthenticated access
- **WHEN** an unauthenticated visitor requests any checklists screen
- **THEN** they are sent to sign in and no checklist content is disclosed

### Requirement: Deleting a checklist preserves completed runs
Deleting a checklist SHALL remove it from the aircraft's library without altering or deleting any completed run recorded against it, because a completed run is a record of what the pilot confirmed rather than a view of the library.

#### Scenario: Deleting a checklist that has completed runs
- **WHEN** a pilot deletes a checklist that has at least one completed run
- **THEN** the checklist no longer appears in the library
- **AND** its completed runs remain in the history with their recorded items unchanged

#### Scenario: Deleting an item that appears in a completed run
- **WHEN** a pilot deletes an item that a completed run recorded
- **THEN** the completed run still shows that item's recorded text and confirmation

### Requirement: One checklist per aircraft may carry the pre-flight role
The system SHALL allow at most one checklist per aircraft to be designated the pre-flight checklist, SHALL apply that designation to the seeded pre-flight procedure, and SHALL allow the pilot to move it to another normal checklist. The designation is what other capabilities resolve; it MUST NOT be inferred from a checklist's name.

#### Scenario: Seeded designation
- **WHEN** an aircraft's library is seeded
- **THEN** the seeded pre-flight procedure carries the pre-flight designation

#### Scenario: Moving the designation
- **WHEN** a pilot designates a different normal checklist as the pre-flight checklist
- **THEN** that checklist carries the designation and the previous one no longer does

#### Scenario: Designation cannot go to an emergency checklist
- **WHEN** a request designates an emergency checklist as the pre-flight checklist
- **THEN** the request is rejected and the existing designation is unchanged

#### Scenario: Renaming does not lose the designation
- **WHEN** a pilot renames the designated pre-flight checklist
- **THEN** it still carries the designation

### Requirement: Empty fleet state
When a pilot has no non-retired aircraft, the checklists screen SHALL state in localized text that no aircraft has been recorded and link to recording one. It MUST NOT display any checklist name, item text, or progress figure.

#### Scenario: Pilot with no aircraft
- **WHEN** a pilot with no non-retired aircraft opens the checklists screen
- **THEN** it states in localized text that no aircraft has been recorded and offers to record one
- **AND** it contains no checklist name, item text, or completion figure

### Requirement: The checklists screen is fully localized and reachable on a phone
Every label, message, empty state, caveat, and URL segment of the checklists screens SHALL be resolved from the localization catalogs for the request's locale. The screens MUST be usable one-handed at 320 pixels wide, every interactive control MUST present a touch target of at least 44 pixels, and each screen MUST render identically whether requested as a full page or as an htmx fragment of the same partial.

#### Scenario: Locale segments
- **WHEN** a checklists screen is requested in each supported locale
- **THEN** its path segments and all of its visible text come from that locale's catalog

#### Scenario: Touch targets
- **WHEN** any checklists screen is rendered
- **THEN** every interactive control presents a touch target of at least 44 pixels

#### Scenario: Fragment and full page agree
- **WHEN** a checklists screen is requested with and without the htmx fragment header
- **THEN** both render the same partial with the same content, the fragment without the surrounding shell

#### Scenario: Phone-width navigation
- **WHEN** the checklists screens are used at 320 pixels wide
- **THEN** the aircraft, checklist, and item levels are each reachable as their own screen with a way back
