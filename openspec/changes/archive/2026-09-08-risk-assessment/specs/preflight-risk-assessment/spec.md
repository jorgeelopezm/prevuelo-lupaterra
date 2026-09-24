## ADDED Requirements

### Requirement: A pre-flight risk assessment is a PAVE questionnaire with IMSAFE-based Pilot items
The system SHALL present a pre-flight risk questionnaire organized into the four PAVE domains — Pilot, Aircraft, enVironment, External pressures — with the Pilot domain's items drawn from the IMSAFE checklist (Illness, Medication, Stress, Alcohol, Fatigue, Emotion). Every item MUST be answered before the assessment can be submitted.

#### Scenario: Domains are presented
- **WHEN** a pilot opens a new risk assessment
- **THEN** the questionnaire shows the Pilot, Aircraft, enVironment, and External pressures domains, each with its items

#### Scenario: Incomplete questionnaire cannot be submitted
- **WHEN** a pilot attempts to submit the questionnaire with at least one unanswered item
- **THEN** submission is rejected and the unanswered items are identified to the pilot

### Requirement: The Aircraft domain is enriched with auto-scored aircraft data
The Aircraft domain SHALL include, alongside its pilot-answered items, values auto-scored from the selected aircraft's existing fleet data: engine-trend flags from the aircraft's last logged flight, fuel status versus the flight's required reserve, and hours remaining to the next maintenance interval. These auto-scored values MUST contribute to the Aircraft domain score and MUST be visibly distinguished from the pilot-answered items.

#### Scenario: Auto-scored values feed the domain score
- **WHEN** the selected aircraft's last logged flight recorded an engine-limit exceedance
- **THEN** the Aircraft domain score reflects that exceedance without the pilot entering it manually

#### Scenario: No fleet data available yet
- **WHEN** the selected aircraft has no logged flights or maintenance items to derive auto-scored values from
- **THEN** the Aircraft domain states that no telemetry is available for those items rather than scoring them as favorable

### Requirement: Responses are aggregated into a Low/Medium/High verdict
The system SHALL score each answered item with a fixed point value, sum item points into a domain score, sum domain scores into an overall score, and map the overall score to one of three verdicts — Low, Medium, or High risk — using fixed thresholds. The result MUST be presented with a text label in every case, never by color alone, together with the top contributing factors.

#### Scenario: Low-risk result
- **WHEN** a completed assessment's overall score falls below the low/medium threshold
- **THEN** the result is presented as low risk with its text label and the standard low-risk guidance message

#### Scenario: High-risk result
- **WHEN** a completed assessment's overall score meets or exceeds the medium/high threshold
- **THEN** the result is presented as high risk with its text label and the standard high-risk guidance message, and the highest-scoring items are listed as contributing factors

#### Scenario: Verdict never relies on color alone
- **WHEN** a result is rendered
- **THEN** the verdict is shown with a text label in addition to any color coding

### Requirement: Every completed evaluation is persisted as an immutable record
The system SHALL store one record per completed risk assessment, carrying the owning pilot, the referenced flight intent, the per-item answers, the per-domain scores, the overall score and verdict, and the submission timestamp. A stored risk-assessment record MUST NOT be edited or deleted after submission; a correction is made by submitting a new assessment.

#### Scenario: Submission creates a record
- **WHEN** a pilot submits a complete questionnaire
- **THEN** a new risk-assessment record is stored with its score, verdict, and timestamp, linked to the pilot and the flight intent

#### Scenario: Records are not editable
- **WHEN** a pilot views a previously submitted risk assessment
- **THEN** no control is offered to modify its answers, score, or verdict

#### Scenario: Re-assessment creates a new record rather than replacing the old one
- **WHEN** a pilot completes a second assessment for the same flight intent
- **THEN** both the earlier and the new assessment remain stored as separate records, and both appear in the flight intent's assessment history

### Requirement: A risk assessment is created against a flight intent
The system SHALL require every risk assessment to reference exactly one flight intent identifying the aircraft and planned flight it was made for. When the pilot has no existing flight intent to select, the system MUST let them create one inline as the first step of starting an assessment.

#### Scenario: Starting an assessment from an existing flight intent
- **WHEN** a pilot starts a risk assessment and selects one of their existing flight intents
- **THEN** the questionnaire proceeds and the resulting record references that flight intent

#### Scenario: Starting an assessment with no existing flight intent
- **WHEN** a pilot with no existing flight intents starts a risk assessment
- **THEN** the system prompts them to create a flight intent (aircraft, date, departure and destination aerodromes) before the questionnaire proceeds

### Requirement: Risk assessment records are scoped to the owning pilot
Every risk-assessment record SHALL be readable only by the pilot who created it. The system MUST NOT disclose the existence, contents, or score of another pilot's risk assessment.

#### Scenario: Cross-pilot access is denied
- **WHEN** a pilot requests a risk-assessment record identifier belonging to another pilot
- **THEN** the request fails as not found, disclosing nothing about the other pilot's record
