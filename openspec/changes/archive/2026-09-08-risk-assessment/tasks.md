## 1. Data model & migrations

- [x] 1.1 Add `db/migrations/00X_flight_intents.sql` — `id, pilot_id, aircraft_id, planned_date, departure_icao, destination_icao, created_at`, FK to pilots and aircraft, scoped/indexed by `pilot_id`
- [x] 1.2 Add `db/migrations/00X_risk_assessments.sql` — `id, pilot_id, flight_intent_id, answers (jsonb), domain_scores (jsonb), overall_score, verdict, aircraft_snapshot (jsonb), submitted_at`, FK to pilots and flight_intents, indexed by `flight_intent_id` and `pilot_id`
- [x] 1.3 Update `db/seed/seed.ts` (and its test) with a representative flight intent + risk assessment for the development pilot

## 2. Platform layer (`src/platform/risk/`)

- [x] 2.1 Define `types.ts`: `FlightIntentRecord`, `CreateFlightIntentInput`, `RiskAssessmentRecord`, `RiskAnswer`, `DomainScore`, `RiskVerdict`, mirroring the style of `src/platform/fleet/types.ts`
- [x] 2.2 Implement `flight-intent-repo.ts`: create, get-by-id (pilot-scoped, not-found on cross-pilot), list-for-pilot, delete-if-unreferenced
- [x] 2.3 Implement `risk-assessment-repo.ts`: create (immutable insert only), get-by-id (pilot-scoped), list-for-flight-intent, list-for-pilot
- [x] 2.4 Implement `scoring.ts`: PAVE domain/IMSAFE item definitions with fixed point weights, domain-score and overall-score aggregation, Low/Medium/High threshold mapping, top-contributing-factors extraction
- [x] 2.5 Implement the Aircraft-domain auto-score reader: pull last-flight engine-trend flags, fuel-vs-required, and hours-to-next-maintenance from the existing `src/platform/fleet/*` repos; return an explicit "not available" per field when the aircraft has no data to derive it from
- [x] 2.6 Unit tests for `scoring.ts` (threshold boundaries, missing-telemetry handling, contributing-factor ranking) and both repos (ownership scoping, immutability, delete-if-unreferenced)

## 3. Module layer (`src/modules/risk/`)

- [x] 3.1 Replace the placeholder registration in `index.ts` with real routes: flight-intent creation, assessment start/questionnaire/submit, result view, history list
- [x] 3.2 Implement `forms.ts`: flight-intent form validation (ICAO designator format, non-retired aircraft ownership, future-or-today date) and questionnaire submission validation (all items answered)
- [x] 3.3 Implement `paths.ts` mirroring `src/modules/fleet/paths.ts` conventions
- [x] 3.4 Wire auth/CSRF the same way `src/modules/fleet/index.ts` does (`createRequireAuthHook`, `verifyCsrfToken`)
- [x] 3.5 Unit tests for route handlers and form validation, mirroring `src/modules/fleet/index.test.ts`

## 4. Views

- [x] 4.1 Flight-intent inline-creation view (aircraft picker, date, departure/destination fields)
- [x] 4.2 Questionnaire view: four PAVE domain sections, IMSAFE items under Pilot, auto-scored fields visibly marked under Aircraft, submit disabled until complete
- [x] 4.3 Result view: Low/Medium/High verdict with text label (never color alone), domain breakdown, top contributing factors, standard guidance message per verdict
- [x] 4.4 History view: past risk assessments for a flight intent / for the pilot, read-only (no edit/delete controls)
- [x] 4.5 View tests mirroring `src/server/views/fragment.test.ts` patterns

## 5. Localization

- [x] 5.1 Audit existing `risk.*` keys in `en.json`/`es.json`/`pt.json` against the built questionnaire and result copy; fill any gaps (item labels, domain names, "no telemetry available" copy, history/flight-intent copy)
- [x] 5.2 Add `flight_intent.*` keys (form labels, validation messages) to all three catalogs
- [x] 5.3 `src/platform/i18n/catalog.test.ts` — extend coverage to the new keys if the test asserts catalog parity across locales

## 6. Integration

- [x] 6.1 End-to-end check: create flight intent → complete questionnaire → view result → view history, across all three locales
- [x] 6.2 Verify cross-pilot access is denied for both flight intents and risk assessments (route + repo level)
- [x] 6.3 Run `npm run check` (build assets, typecheck, lint, tests) and fix any fallout
