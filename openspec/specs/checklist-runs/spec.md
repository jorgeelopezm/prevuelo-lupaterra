# checklist-runs Specification

## Purpose
Records a pilot working through a normal checklist for a planned flight: which items were confirmed and when, completion, reset, and a browsable history. The resulting pre-flight progress feeds the pre-flight brief.

## Requirements

### Requirement: Running a normal checklist is scoped to a planned flight
A run SHALL belong to exactly one pilot, one flight intent, and one normal checklist. Opening a normal checklist while the pilot has an upcoming flight intent SHALL resume that pilot's open run for the pair, or start one if none is open. The system MUST allow at most one open run per pilot, flight intent, and checklist.

#### Scenario: Starting a run
- **WHEN** a pilot opens a normal checklist and has an upcoming flight intent with no open run for it
- **THEN** a run is started against that flight intent with every item unconfirmed

#### Scenario: Resuming a run
- **WHEN** a pilot reopens a normal checklist for which they already have an open run against the same flight intent
- **THEN** the same run is shown with its previously confirmed items still confirmed

#### Scenario: No duplicate open runs
- **WHEN** the same checklist is opened twice concurrently for the same flight intent
- **THEN** only one open run exists for that pilot, flight intent, and checklist

#### Scenario: No upcoming flight intent
- **WHEN** a pilot opens a normal checklist and has no upcoming flight intent
- **THEN** the checklist is shown read-only with a localized prompt to plan a flight first and a link to do so
- **AND** no run is started and no progress figure is displayed

#### Scenario: Cross-pilot run access is denied
- **WHEN** a pilot requests or modifies a run identifier belonging to another pilot
- **THEN** the request fails as not found, disclosing nothing about the other pilot's run

#### Scenario: Unauthenticated access
- **WHEN** an unauthenticated visitor requests a run screen
- **THEN** they are sent to sign in and no run content is disclosed

### Requirement: A run records the items it was started from
Starting a run SHALL copy each of the checklist's items — its text and its position — into the run as it stands at that moment. The system MUST render a run from its own recorded items, never from the checklist's current items, so that editing, reordering, or deleting an item never changes what an in-progress or completed run shows.

#### Scenario: Editing an item during an open run
- **WHEN** a pilot edits an item's text while a run started before the edit is still open
- **THEN** the open run continues to show the text it recorded at start

#### Scenario: Editing an item after completion
- **WHEN** a pilot edits or deletes an item that a completed run recorded
- **THEN** the completed run still shows the text and position it recorded

#### Scenario: Reordering during an open run
- **WHEN** a pilot reorders a checklist's items while a run is open
- **THEN** the open run's items keep the order they were recorded in

#### Scenario: A new run picks up the edits
- **WHEN** a pilot completes a run, edits the checklist, and starts a new run
- **THEN** the new run records the edited items

### Requirement: Confirming an item persists immediately
Confirming or un-confirming an item SHALL be written to the run before the response is rendered, so that progress survives a page reload, a sign-out and sign-in, and a change of device. The system MUST NOT hold run state only in the browser. The response MUST re-render the affected item together with the run's completion count, progress, and completed state.

#### Scenario: Confirming an item
- **WHEN** a pilot confirms an item of an open run
- **THEN** the item is recorded as confirmed with the time of confirmation
- **AND** the response renders that item as confirmed and the updated completion count

#### Scenario: Un-confirming an item
- **WHEN** a pilot un-confirms a previously confirmed item of an open run
- **THEN** the item is recorded as unconfirmed and the completion count decreases

#### Scenario: Progress survives a reload
- **WHEN** a pilot confirms several items and then reloads the screen
- **THEN** the same items are still shown confirmed with the same count

#### Scenario: Progress survives a different device
- **WHEN** the same pilot opens the same run signed in on another device
- **THEN** it shows the same confirmed items and count

#### Scenario: Working without client scripting
- **WHEN** a pilot confirms an item with client scripting unavailable
- **THEN** the confirmation is still recorded and the run screen is re-rendered with the updated state

### Requirement: A run completes when every recorded item is confirmed
Confirming the last unconfirmed item of an open run SHALL mark the run complete and record the completion time, and the screen MUST state completion in localized text. A completed run is immutable: the system MUST reject confirming, un-confirming, or resetting its items.

#### Scenario: Completing a run
- **WHEN** a pilot confirms the last unconfirmed item of an open run
- **THEN** the run is marked complete with the time of completion
- **AND** the screen states in localized text that the checklist is complete

#### Scenario: Completion is not color-only
- **WHEN** a completed run is rendered
- **THEN** its completion is stated in localized text, not by color alone

#### Scenario: Modifying a completed run
- **WHEN** a request attempts to confirm, un-confirm, or reset an item of a completed run
- **THEN** the request is rejected and the completed run is unchanged

#### Scenario: Starting again after completion
- **WHEN** a pilot opens the same checklist for the same flight intent after completing a run
- **THEN** a new run is started and the completed run is retained

### Requirement: Reset clears the open run only
Reset SHALL un-confirm every item of the pilot's open run for the checklist. The system MUST NOT delete, alter, or hide any completed run, and MUST reject a reset addressed to a completed run.

#### Scenario: Resetting an open run
- **WHEN** a pilot resets an open run
- **THEN** every item of that run is unconfirmed and the completion count is zero

#### Scenario: Reset does not touch history
- **WHEN** a pilot resets an open run for a checklist that has completed runs
- **THEN** those completed runs are unchanged and still appear in the history

#### Scenario: Resetting a completed run
- **WHEN** a request attempts to reset a completed run
- **THEN** the request is rejected and the run remains complete

### Requirement: Completed runs are kept and browsable per aircraft
The system SHALL retain every completed run and SHALL present a per-aircraft history listing each completed run with its checklist name, the flight intent it was run for, and its completion time, most recent first. Opening a completed run from the history SHALL show its recorded items as confirmed, read-only.

#### Scenario: History listing
- **WHEN** a pilot opens the history for an aircraft with completed runs
- **THEN** each completed run is listed with its checklist name, flight intent, and completion time, most recent first

#### Scenario: Opening a completed run
- **WHEN** a pilot opens a completed run from the history
- **THEN** its recorded items are shown as confirmed and read-only, with no control that would modify them

#### Scenario: Empty history
- **WHEN** a pilot opens the history for an aircraft with no completed runs
- **THEN** it states in localized text that no checklist has been completed for that aircraft
- **AND** it displays no checklist name, item text, or completion figure

#### Scenario: History is scoped to its owner
- **WHEN** a pilot requests the history of an aircraft belonging to another pilot
- **THEN** the request fails as not found, disclosing nothing about the other pilot's runs

### Requirement: Pre-flight progress is exposed to the pre-flight brief
The system SHALL expose, for a pilot's upcoming flight intent, the confirmation progress of the run of that aircraft's designated pre-flight checklist, as the checklist's name, the count of confirmed items, and the count of recorded items. When there is no upcoming flight intent, no active aircraft, no designated pre-flight checklist, or no run started, the system MUST report the absence rather than a count.

#### Scenario: Progress for an upcoming flight
- **WHEN** a pilot has an upcoming flight intent and an open run of the designated pre-flight checklist
- **THEN** the reported progress is that run's checklist name with its confirmed and recorded item counts

#### Scenario: No run started
- **WHEN** a pilot has an upcoming flight intent but has not opened the designated pre-flight checklist
- **THEN** the absence of progress is reported, not a count

#### Scenario: Nothing to report is stated, never implied
- **WHEN** progress is unavailable for any reason
- **THEN** the consuming screen states the reason in localized text
- **AND** it displays no completion count, ratio, or progress indicator
