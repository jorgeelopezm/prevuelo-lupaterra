# Engine Data Import Specification

## Purpose

Importing an avionics engine-monitor data export attached to one flight entry: recognized channels and units, explicit lossless failure handling, provenance on every display, pilot-entered-only limits, and the rule that no engine value is ever shown without a real imported file behind it.

## Requirements

### Requirement: Engine monitor data is imported from a file attached to a flight
The system SHALL let a pilot import an engine-monitor data export and associate it with exactly one of their own flight entries. The import MUST record, for every accepted file, the original filename, the byte size, a content digest, the declared or detected monitor format, the import timestamp, and the pilot who imported it. Parsed samples MUST retain their recorded timestamp or elapsed offset and the channel values as recorded.

#### Scenario: Importing a file
- **WHEN** a pilot uploads a supported engine-monitor CSV export against one of their flight entries
- **THEN** the file's samples are stored against that entry
- **AND** the flight shows that engine data is available for it

#### Scenario: Provenance recorded
- **WHEN** an imported file is inspected
- **THEN** its filename, size, digest, detected format, and import time are recorded

#### Scenario: Import onto another pilot's flight
- **WHEN** a pilot uploads a file naming a flight entry belonging to a different pilot
- **THEN** the upload is rejected as a not-found result and nothing is stored

#### Scenario: Replacing an import
- **WHEN** a pilot imports a second file against a flight that already has one
- **THEN** the pilot is asked to confirm replacement, and on confirmation the previous file and its samples are removed and replaced

### Requirement: Recognized channels and units
The importer SHALL map the file's columns onto a defined set of channels — cylinder head temperature and exhaust gas temperature per cylinder, oil temperature, oil pressure, engine speed, manifold pressure, fuel flow, fuel remaining, bus voltage, and outside air temperature — and MUST record the unit each channel was expressed in. Columns the importer does not recognize MUST be ignored without failing the import, and MUST be reported to the pilot as ignored. A channel's values MUST NOT be converted to another unit silently.

#### Scenario: Per-cylinder channels
- **WHEN** a file containing four CHT and four EGT columns is imported
- **THEN** each cylinder's channel is stored separately and identified by its cylinder number

#### Scenario: Unrecognized column
- **WHEN** a file contains a column the importer does not recognize
- **THEN** the import succeeds for the recognized channels
- **AND** the result names the ignored column

#### Scenario: Units preserved
- **WHEN** a file records temperatures in degrees Celsius
- **THEN** the stored samples and the rendered strip are labeled in degrees Celsius, with no silent conversion to another unit

#### Scenario: No recognized channel
- **WHEN** a file contains no recognizable engine channel
- **THEN** the import is rejected with a localized message and nothing is stored

### Requirement: Import failures are explicit and lossless
A file the importer cannot parse SHALL be rejected with a localized message naming the reason — unsupported format, malformed content, no recognizable channel, empty file, or exceeding the configured maximum size. A rejected import MUST leave no partial samples behind and MUST NOT alter the flight entry.

#### Scenario: Malformed file
- **WHEN** a file whose contents are not parseable as a supported export is uploaded
- **THEN** the import is rejected with a localized reason
- **AND** no sample rows exist for that flight afterwards

#### Scenario: Oversized file
- **WHEN** a file larger than the configured maximum is uploaded
- **THEN** it is rejected before parsing, with a localized message stating the limit

#### Scenario: Partial parse failure
- **WHEN** a file parses correctly up to a corrupt row
- **THEN** the whole import is rejected rather than storing the rows before the corruption

#### Scenario: Flight unchanged after a failed import
- **WHEN** an import is rejected for any reason
- **THEN** the flight entry's own recorded values are unchanged

### Requirement: No engine value is displayed without an imported file behind it
The engine trend panel SHALL render values only from samples belonging to an imported file. When the selected aircraft's most recent flight has no imported engine data, the panel MUST state that in localized text and MUST display no temperature, pressure, engine speed, fuel flow, voltage, or limit value of any kind. The system MUST NOT display a sample, example, typical, or estimated engine value anywhere.

#### Scenario: No engine data imported
- **WHEN** the aircraft's most recent flight has no imported engine data
- **THEN** the panel states that no engine data has been imported
- **AND** the rendered output contains no CHT, EGT, oil temperature, oil pressure, RPM, manifold pressure, fuel flow, or voltage value

#### Scenario: Aircraft with no flights
- **WHEN** the selected aircraft has no logged flights at all
- **THEN** the engine panel states that there is no flight to show engine data for, and displays no engine value

#### Scenario: Values shown are the imported ones
- **WHEN** engine data has been imported for the most recent flight
- **THEN** every displayed value corresponds to a stored sample from that file

### Requirement: Displayed engine data carries its provenance
Every rendering of engine data SHALL identify the flight it belongs to, the source filename, the detected monitor format, and the import time, and SHALL state that the data is a pilot-supplied recording rather than a live or authoritative reading.

#### Scenario: Provenance shown with the strip
- **WHEN** the engine trend strip is rendered
- **THEN** it shows the flight date, source filename, format, and import time alongside the values

#### Scenario: Not presented as live
- **WHEN** the engine trend strip is rendered
- **THEN** it carries a localized statement that the values are an imported recording of a past flight, not a current reading

### Requirement: Limits are shown only when the pilot has entered them
A limit or redline marker SHALL be drawn on a channel only when the pilot has recorded that limit for the aircraft. When no limit is recorded, the channel MUST render its values with no limit marker and no exceedance indication, and the system MUST NOT infer a limit from the aircraft type, from the data itself, or from a built-in default.

#### Scenario: Limit recorded
- **WHEN** the pilot has recorded a CHT limit for the aircraft
- **THEN** the CHT channels render that limit as a marker, labeled with its value and its source as a pilot-entered limit

#### Scenario: No limit recorded
- **WHEN** no limit is recorded for a channel
- **THEN** that channel renders without a marker and without any exceedance wording

#### Scenario: No inferred limits
- **WHEN** engine data is rendered for an aircraft with no recorded limits
- **THEN** the output contains no limit, redline, maximum, or exceedance value

### Requirement: Engine data is removed with what it belongs to
Deleting an imported file, its flight entry, or the aircraft SHALL remove the associated samples. Retiring an aircraft MUST NOT remove them.

#### Scenario: Deleting the flight
- **WHEN** a flight entry with imported engine data is deleted
- **THEN** its imported file and samples are removed

#### Scenario: Deleting the import only
- **WHEN** the imported file is deleted without deleting the flight
- **THEN** the flight entry remains with its own recorded values, and the engine panel returns to the no-data-imported state

#### Scenario: Retirement preserves data
- **WHEN** an aircraft is retired
- **THEN** its flights' imported engine data remain viewable
