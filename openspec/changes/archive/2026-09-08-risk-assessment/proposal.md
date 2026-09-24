## Why

The `/riesgo` screen is currently a placeholder (`src/modules/risk/index.ts` registers a stub). The `diseno/` prototype and the shipped i18n strings (`risk.*` in `en.json`/`es.json`) already commit the product to an IMSAFE/PAVE-style pre-flight self-assessment with an aircraft-telemetry-fed auto-score and a Low/Medium/High verdict, but no capability spec exists to define what a compliant, auditable version of that tool must do. Pilots need a documented, repeatable go/no-go judgment before each flight, and the operator needs a durable record of every evaluation performed — both for the pilot's own risk-management discipline and as the evidentiary trail international SMS guidance (ICAO Doc 9859, EASA GM1 ORO.GEN.200(a)(3)) expects of a risk-assessment process. Building this now, ahead of the "New flight" pre-flight-record feature, requires a deliberate, minimal seam so the risk record can attach to a flight without becoming throwaway work once "New flight" ships.

## What Changes

- Implement the `/riesgo` screen as a real feature: a pilot selects an aircraft, states the planned flight's basic parameters (date, departure/destination aerodromes), and completes an IMSAFE/PAVE-domain questionnaire.
- Score the questionnaire using a FRAT-style method (per-item weighted points aggregated per domain, per ICAO Doc 9859 / GM1 ORO.GEN.200(a)(3) risk-matrix practice and the FAA/AOPA ASI Flight Risk Assessment Tool precedent), plus an **Aircraft** domain that is partly auto-scored from the selected aircraft's existing fleet data (last-flight engine trend flags, fuel vs. required, hours to next maintenance) rather than pilot-entered.
- Aggregate the domain scores into an overall **Low / Medium / High** rating, shown with the top contributing factors — never a bare color, always paired with a text label per the design system's accessibility rule already used elsewhere in the app.
- Persist **one immutable record per completed evaluation** (score, per-domain breakdown, verdict, timestamp, aircraft, pilot) — a risk assessment is a point-in-time judgment, so edits create a new record rather than mutating history.
- Introduce a minimal **flight intent** record (aircraft + planned date + departure/destination) that a risk assessment is created against. This is the forward-compatible attachment point for the not-yet-built "New flight" feature: when "New flight" ships, it becomes the primary way flight intents are created and gains its own richer fields, but the identifier and shape it writes into stay compatible with what this change defines, so existing risk-assessment records don't need to be migrated.
- Let a pilot start a risk assessment either from an existing flight intent or by creating one inline as the first step of the assessment (since "New flight" doesn't exist yet).

## Capabilities

### New Capabilities
- `preflight-risk-assessment`: The IMSAFE/PAVE questionnaire, aircraft-telemetry auto-scoring, Low/Medium/High aggregation, and the immutable per-evaluation record.
- `flight-intent`: The minimal planned-flight record (aircraft, date, route) that a risk assessment attaches to, designed as the seam the future "New flight" capability will extend.

### Modified Capabilities
(none — this change only reads existing `aircraft-fleet` data, it does not change that capability's requirements)

## Impact

- Affected code: `src/modules/risk/` (replaces the placeholder registration), a new `src/platform/risk/` service/repo layer analogous to `src/platform/fleet/`, new `db/migrations/*_flight_intents.sql` and `*_risk_assessments.sql`, new Nunjucks views under `src/views/`, new `risk.*`/`flight_intent.*` i18n coverage (largely already present for `risk.*`).
- Affected data: two new tables (`flight_intents`, `risk_assessments`), both owned-by-pilot and scoped like existing fleet tables (see `identity-access` route-level authorization pattern).
- Dependencies: reads aircraft/engine/maintenance data from the existing `aircraft-fleet` platform layer (`src/platform/fleet/*`) for the Aircraft domain auto-score; no changes to that layer's public shape.
- No breaking changes — this is new capability on a currently unimplemented screen.
