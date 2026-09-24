## MODIFIED Requirements

### Requirement: Maintenance data is scoped to its owner
Every read and write of a maintenance item SHALL be constrained to items whose aircraft's operator the authenticated pilot is a member of. A request naming an item on an aircraft of an operator the pilot does not belong to MUST be answered as though it did not exist.

#### Scenario: Another pilot's maintenance item
- **WHEN** a pilot submits an edit or completion for a maintenance item on an aircraft of an operator they are not a member of
- **THEN** the response is a not-found result, not a forbidden result
- **AND** the item is unchanged and nothing about it is disclosed

#### Scenario: Co-owner completes a shared item
- **WHEN** a member of an aircraft's operator records a completion for one of its maintenance items
- **THEN** the completion is stored, and the item records that member as its last updater
