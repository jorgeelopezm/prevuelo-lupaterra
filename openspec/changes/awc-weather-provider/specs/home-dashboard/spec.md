## ADDED Requirements

### Requirement: Official briefing link in the NOTAM attention band
When the NOTAM attention band for the departure indicator is not confirmed complete, the home screen SHALL offer the same official-briefing link the weather screen offers for that indicator, chosen by the same ICAO-prefix rule. It MUST render no link for other prefixes or for a confirmed complete list, and the link MUST meet the 44px touch-target rule.

#### Scenario: Departure aerodrome in Spain
- **WHEN** the attention band for departure `LEMD` renders with `unknown` coverage
- **THEN** it contains the ENAIRE ICARO XXI link

#### Scenario: Departure aerodrome outside Spain and Portugal
- **WHEN** the attention band for departure `SUMU` renders with `unknown` coverage
- **THEN** it contains no official-briefing link
