# home-dashboard Specification

## Purpose
The locale root for a signed-in pilot: a pre-flight brief of the next planned flight, its derived go/no-go verdict, status tiles, weather and NOTAMs with provenance, and aircraft stat cards. Every value on it is sourced from the pilot's records or is explicitly marked unavailable.

## Requirements

### Requirement: The locale root renders the pre-flight brief
The locale root path of each supported locale SHALL render the home screen — the pre-flight brief — inside the application shell for a signed-in pilot, rather than the shared not-yet-available partial. The locale root is a protected route: an unauthenticated request MUST be redirected to the sign-in screen with the locale root preserved as the return target, and MUST NOT render any part of the brief.

#### Scenario: Signed-in pilot reaches the brief
- **WHEN** a signed-in pilot requests the locale root
- **THEN** the pre-flight brief renders inside the shell with the home destination marked as the current navigation item

#### Scenario: Anonymous visitor is sent to sign-in
- **WHEN** a request without a valid session targets the locale root
- **THEN** the server redirects to that locale's sign-in screen with the locale root as the return target
- **AND** the response body contains no greeting, flight intent, risk verdict, aircraft registration, or weather, maintenance, or flight value

#### Scenario: Localized per locale
- **WHEN** a signed-in pilot requests the locale root for each supported locale
- **THEN** every label, status word, and empty-state message on the screen is rendered from that locale's catalog
- **AND** no user-facing string on the screen is hardcoded in a template or handler

#### Scenario: Fragment and full page render the same partial
- **WHEN** a signed-in pilot requests the locale root with the `HX-Request` header
- **THEN** the response is the bare home partial without the shell
- **AND** it is the same partial the full-page response embeds

#### Scenario: Root redirect lands on the brief
- **WHEN** a signed-in pilot requests the application root
- **THEN** it redirects to a locale root that renders the pre-flight brief

### Requirement: The brief is headed by the pilot's next flight intent
For a signed-in pilot, the home screen SHALL present a localized greeting naming the pilot, the current date, and the pilot's next flight intent — the intent with the soonest planned date on or after the current date — showing its departure and destination indicators, its aircraft, and its planned date. When the pilot has no such intent, the screen MUST state that in localized text and offer a link to plan one, and MUST NOT display a sample or placeholder route.

#### Scenario: Next intent shown
- **WHEN** a signed-in pilot has one or more flight intents planned on or after the current date
- **THEN** the header shows the soonest of them, with its departure indicator, destination indicator, aircraft, and planned date

#### Scenario: Only past intents
- **WHEN** every one of the pilot's flight intents is planned before the current date
- **THEN** the header states in localized text that no upcoming flight is planned
- **AND** it offers a link to create a flight intent

#### Scenario: No intents at all
- **WHEN** a signed-in pilot has recorded no flight intent
- **THEN** the header states in localized text that no upcoming flight is planned
- **AND** it displays no route, aircraft, or planned date value

### Requirement: The go/no-go verdict is derived, never defaulted
The home screen SHALL present a decision indicator derived from the most recent risk assessment attached to the pilot's next flight intent, showing that assessment's verdict band, its overall score, and the time it was submitted. When the intent has no assessment, the indicator MUST state that no assessment exists and MUST NOT present a favorable verdict; when there is no next flight intent, no decision indicator is presented at all.

#### Scenario: Assessed intent
- **WHEN** the pilot's next flight intent has at least one risk assessment
- **THEN** the decision indicator shows the most recently submitted assessment's verdict band, its overall score, and its submission time

#### Scenario: Unassessed intent never reads as GO
- **WHEN** the pilot's next flight intent has no risk assessment
- **THEN** the decision indicator states in localized text that the flight has not been assessed
- **AND** it does not display a favorable verdict or any score
- **AND** it links to starting an assessment for that intent

#### Scenario: Verdict state is conveyed in text
- **WHEN** any decision indicator state is rendered
- **THEN** its meaning is carried by localized text, not by color alone

### Requirement: Weather and NOTAM content loads without blocking the brief
The home screen's weather and NOTAM regions SHALL be retrieved independently of the rest of the brief, so that a slow or failing weather source delays or degrades only those regions. The remainder of the screen MUST render from the pilot's own stored data without waiting on any weather retrieval.

#### Scenario: Brief renders while weather is pending
- **WHEN** the locale root is requested
- **THEN** the greeting, flight intent, decision indicator, risk tile, aircraft tile, and stat cards are present in the response
- **AND** the response does not wait on a weather retrieval to be produced

#### Scenario: Weather retrieval failure is confined
- **WHEN** the weather retrieval fails, times out, or is rate-limited
- **THEN** only the weather and NOTAM regions show a localized error state naming the reason
- **AND** every other region of the brief renders its own value normally

#### Scenario: Usable without client-side scripting
- **WHEN** the screen is rendered and client-side scripting does not run
- **THEN** the weather and NOTAM region contains a working link to the weather screen for the flight intent's departure indicator
- **AND** it contains no indefinite loading state

#### Scenario: No flight intent means no weather retrieval
- **WHEN** the pilot has no next flight intent, and therefore no departure indicator
- **THEN** no weather retrieval is performed
- **AND** the region states in localized text that no aerodrome is selected

### Requirement: Weather and NOTAM values on the brief carry provenance
Any METAR or NOTAM value the home screen displays SHALL carry the provider, the observation or issue time, the retrieval time, the cache marking, and the mock-data caveat exactly as returned by the weather source, rendered the same way the weather screen renders them. The home screen MUST NOT recompute, abbreviate away, or omit any of these fields. An empty NOTAM list MUST be presented as "no NOTAMs in force" only when the result marks its coverage as `complete`; otherwise the home screen MUST present the same unconfirmed-empty state the weather screen uses.

#### Scenario: METAR summary with provenance
- **WHEN** a METAR is retrieved for the flight intent's departure indicator
- **THEN** the weather tile shows the report together with its provider, its observation time, and its retrieval time

#### Scenario: NOTAMs listed with provenance
- **WHEN** NOTAMs are returned for the departure indicator
- **THEN** the attention band lists them with their validity window, their provenance, and the mock-data caveat

#### Scenario: No NOTAMs is distinct from a failed retrieval
- **WHEN** the NOTAM retrieval succeeds and returns an empty list with `complete` coverage
- **THEN** the screen states in localized text that no NOTAMs are in force, together with the result's provenance
- **AND** that state is distinguishable in text from the retrieval-failure state

#### Scenario: Unconfirmed empty NOTAM list on the brief
- **WHEN** the NOTAM retrieval succeeds with an empty list and `unknown` or absent coverage, or returns no entry for the departure indicator
- **THEN** the attention band shows the localized unconfirmed-empty state together with the result's provenance
- **AND** it does not state that no NOTAMs are in force

#### Scenario: Mock-provider caveat carried through
- **WHEN** a displayed weather value originates from the mock provider
- **THEN** the screen displays the localized caveat that it is sample data not suitable for operational use

### Requirement: Aircraft stat cards are sourced or explicitly unavailable
The home screen SHALL present stat cards for the active aircraft's usable fuel capacity, its nearest-due maintenance item, and its most recent logged flight. Each card SHALL render its value from the pilot's own recorded data or state in localized text that the data has not been recorded. The usable-fuel card MUST be labeled as the aircraft's capacity and MUST NOT be presented as a current fuel quantity, a fuel-on-board reading, or an endurance figure.

#### Scenario: Usable fuel from the weight-and-balance profile
- **WHEN** the active aircraft has a weight-and-balance profile recording a usable fuel quantity
- **THEN** the card shows that quantity with its unit, labeled as the aircraft's usable fuel capacity

#### Scenario: No weight-and-balance profile
- **WHEN** the active aircraft has no weight-and-balance profile, or records no usable fuel quantity
- **THEN** the card states in localized text that the value has not been recorded
- **AND** it displays no fuel quantity

#### Scenario: Nearest-due maintenance item
- **WHEN** the active aircraft has at least one maintenance item whose remaining hours are computable
- **THEN** the card shows the item with the fewest remaining hours, its remaining hours, its hours basis, and its status band

#### Scenario: Maintenance not computable
- **WHEN** the active aircraft has no maintenance item, or none whose remaining hours are computable
- **THEN** the card states in localized text that no maintenance due condition is computable
- **AND** it displays no hour reading

#### Scenario: Last logged flight
- **WHEN** the active aircraft has at least one logged flight entry
- **THEN** the card shows that flight's date, its route, and its duration

#### Scenario: No logged flight
- **WHEN** the active aircraft has no logged flight entry
- **THEN** the card states in localized text that no flight has been logged
- **AND** it displays no date, route, or duration value

#### Scenario: No active aircraft
- **WHEN** the pilot has designated no active aircraft
- **THEN** all three stat cards state in localized text that no aircraft is selected
- **AND** they link to the aircraft screen so an aircraft can be designated

### Requirement: The home screen fabricates no value
The home screen SHALL derive every displayed value from the signed-in pilot's own stored data or from a weather retrieval carrying its own provenance. It MUST NOT display any prototype sample value, and the catalogs supporting this screen MUST contain labels, messages, and empty-state text only — no weather report, registration, score, hour reading, or route value.

#### Scenario: Pilot with no recorded data
- **WHEN** a signed-in pilot who has recorded no aircraft, flight, maintenance item, or flight intent requests the locale root
- **THEN** every region of the brief states in localized text that its data has not been recorded
- **AND** the response contains no registration, score, hour reading, route, or weather value

#### Scenario: Catalogs carry no operational values
- **WHEN** the catalog entries supporting the home screen are inspected in every supported locale
- **THEN** none of them contains a METAR, TAF, NOTAM identifier, aircraft registration, risk score, hour reading, or route value

#### Scenario: Prototype sample data is not carried over
- **WHEN** the rendered home screen is inspected in every supported locale
- **THEN** it contains none of the prototype's sample values

### Requirement: The brief is usable at every supported viewport width
The home screen SHALL be authored mobile-first and remain usable one-handed at the smallest supported viewport width, widening into the prototype's multi-column arrangement at larger widths without a second template set, client-side layout scripting, or viewport sniffing.

#### Scenario: Single column on a phone
- **WHEN** the screen is rendered at the smallest supported viewport width
- **THEN** its regions stack in a single column in the brief's priority order
- **AND** every interactive control meets the shell's minimum touch-target size

#### Scenario: Multi-column at desktop width
- **WHEN** the screen is rendered at the largest supported viewport width
- **THEN** the status tiles and stat cards lay out in the prototype's multi-column arrangement
- **AND** the same templates produce both widths

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
