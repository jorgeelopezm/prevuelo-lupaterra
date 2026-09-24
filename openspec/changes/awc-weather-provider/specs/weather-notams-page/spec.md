## ADDED Requirements

### Requirement: Official briefing link on unconfirmed NOTAM sections
When an aerodrome's NOTAM section is not confirmed complete (its coverage is `unknown` or absent, whether or not the list is empty), the weather screen SHALL offer a localized link to the official NOTAM briefing for that aerodrome's state, chosen by ICAO prefix: `LE` and `GC` to ENAIRE ICARO XXI, and `LP` to NAV Portugal AIS. An aerodrome with any other prefix MUST get no link. The link MUST be a plain navigation to the official site; the application MUST NOT fetch, embed, or display content from it. The link MUST meet the 44px touch-target rule.

#### Scenario: Spanish aerodrome with unconfirmed NOTAMs
- **WHEN** the NOTAM section for `LEMD` is rendered with `unknown` coverage
- **THEN** it contains a localized link to the ENAIRE ICARO XXI briefing

#### Scenario: Canary Islands aerodrome
- **WHEN** the NOTAM section for `GCLP` is rendered with `unknown` coverage
- **THEN** it contains the ENAIRE ICARO XXI link

#### Scenario: Portuguese aerodrome
- **WHEN** the NOTAM section for `LPPT` is rendered with `unknown` coverage
- **THEN** it contains a localized link to the NAV Portugal AIS briefing

#### Scenario: Other prefix
- **WHEN** the NOTAM section for `SUMU` is rendered with `unknown` coverage
- **THEN** it contains no official-briefing link
- **AND** the unconfirmed-empty text still tells the pilot to check the official AIS

#### Scenario: Confirmed complete list
- **WHEN** a NOTAM section is rendered with `complete` coverage
- **THEN** it contains no official-briefing link
