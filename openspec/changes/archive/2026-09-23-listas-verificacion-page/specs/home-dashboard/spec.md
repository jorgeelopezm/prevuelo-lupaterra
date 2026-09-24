## REMOVED Requirements

### Requirement: Status tiles show a real value or state their unavailability
**Reason**: The checklists tile now reports real pre-flight progress, so the scenario "Checklists tile reflects an unimplemented capability" is no longer true. openspec cannot drop a scenario from a MODIFIED requirement, so the requirement is replaced under a new name.
**Migration**: Replaced by "Status tiles show a sourced value or state why it is unavailable" below. It carries the other scenarios unchanged, and replaces the retired scenario with the three checklists-tile scenarios.

## ADDED Requirements

### Requirement: Status tiles show a sourced value or state why it is unavailable
The home screen SHALL present one status tile per summarized destination — weather and NOTAMs, risk assessment, aircraft status, and checklists — each linking to that destination. Each tile SHALL render either a value sourced from the pilot's own data, with the status band that value implies, or a localized statement that the value is unavailable. A tile MUST NOT display a value the application cannot source, and MUST NOT omit its unavailability. The checklists tile SHALL report the pre-flight checklist progress the `checklist-runs` capability exposes for the pilot's next flight intent, and MUST state the reason in localized text whenever that progress is unavailable.

#### Scenario: Tile with data
- **WHEN** a tile's underlying data is available for the pilot
- **THEN** the tile shows that value together with its status band and links to the owning destination

#### Scenario: Tile without data
- **WHEN** a tile's underlying data is unavailable for the pilot
- **THEN** the tile states in localized text that the value is unavailable
- **AND** it displays no substituted, sample, or favorable value

#### Scenario: Checklists tile shows pre-flight progress
- **WHEN** the pilot has a next flight intent and a run of the designated pre-flight checklist for its aircraft
- **THEN** the checklists tile shows that run's confirmed and recorded item counts and links to the checklists destination

#### Scenario: Checklists tile with no run started
- **WHEN** the pilot has a next flight intent but has not opened the designated pre-flight checklist for its aircraft
- **THEN** the checklists tile states in localized text that the pre-flight checklist has not been started
- **AND** it displays no completion count or progress value

#### Scenario: Checklists tile with no flight to check against
- **WHEN** the pilot has no next flight intent, no active aircraft, or the aircraft has no designated pre-flight checklist
- **THEN** the checklists tile states that reason in localized text
- **AND** it displays no completion count or progress value

#### Scenario: Every tile is reachable by touch
- **WHEN** the screen is rendered at the smallest supported viewport width
- **THEN** each tile's interactive target meets the shell's minimum touch-target size
