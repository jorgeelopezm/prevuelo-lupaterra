## MODIFIED Requirements

### Requirement: A pilot owns and edits their aircraft's checklists
A member of an aircraft's operator SHALL be able to create, rename, reorder, and delete checklists for that aircraft, and to add, edit, reorder, and delete the items within a checklist. Every checklist and item MUST be owned by exactly the operator that owns its aircraft, MUST NOT be visible or referenceable by any pilot who is not a member of that operator, and the system MUST reject a write naming an aircraft, checklist, or item of an operator the pilot does not belong to without disclosing anything about it.

#### Scenario: Creating a checklist
- **WHEN** a pilot submits a new checklist naming an aircraft of an operator they belong to, a name, and a kind
- **THEN** the checklist is stored against that aircraft's operator and that aircraft and appears in the matching group

#### Scenario: Editing an item
- **WHEN** a pilot edits the text of an item in a checklist of an operator they belong to
- **THEN** the item's text is updated and the checklist's order is unchanged

#### Scenario: Reordering
- **WHEN** a pilot moves a checklist or an item up or down
- **THEN** the new order is stored and is the order rendered on the next request

#### Scenario: Empty name is rejected
- **WHEN** a checklist or item is submitted with an empty or whitespace-only name or text
- **THEN** it is not stored and a localized message names the conflicting field

#### Scenario: Cross-pilot access is denied
- **WHEN** a pilot requests or submits against a checklist or item identifier of an operator they are not a member of
- **THEN** the request fails as not found, disclosing nothing about the other operator's data

#### Scenario: Co-owner sees the shared library
- **WHEN** a member of an aircraft's operator opens that aircraft's checklists
- **THEN** they see the same library as every other member, including edits another member made

#### Scenario: Unauthenticated access
- **WHEN** an unauthenticated visitor requests any checklists screen
- **THEN** they are sent to sign in and no checklist content is disclosed
