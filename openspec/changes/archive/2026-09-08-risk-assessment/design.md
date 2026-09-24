## Context

`/riesgo` is a stub (`src/modules/risk/index.ts` → `registerPlaceholderScreen`). The `diseno/` prototype brief and the already-shipped `risk.*` i18n strings commit the product to an IMSAFE/PAVE pre-flight self-assessment with an aircraft-telemetry-fed auto-score and a Low/Medium/High verdict — this design fills in the capability behind that screen.

International grounding used for the scoring model:
- **ICAO Doc 9859 (Safety Management Manual)** and **EASA GM1 ORO.GEN.200(a)(3)** require a documented, repeatable risk-assessment process but do not mandate a specific tool — a scored checklist with a fixed threshold-to-verdict mapping satisfies both.
- **IMSAFE** (Illness, Medication, Stress, Alcohol, Fatigue, Emotion) — the standard personal-fitness self-check, used here as the item set for the **Pilot** domain.
- **PAVE** (Pilot, Aircraft, enVironment, External pressures) — the standard four-domain framework for GA pre-flight risk, used here as the top-level structure.
- **FAA / AOPA Air Safety Institute Flight Risk Assessment Tool (FRAT)** precedent — per-item weighted points summed to a domain score and an overall score, mapped to Low/Medium/High bands. This is the same shape already fixed by the existing `risk.low`/`risk.medium`/`risk.high` copy in the catalogs, so this design adopts it rather than a probability×severity matrix (which fits SMS-scale operators with historical incident data, not a single-pilot GA tool with no such corpus).

The existing `aircraft-fleet` platform layer (`src/platform/fleet/*`) already computes the values the prototype's Aircraft domain shows: engine-limit exceedances, hours to next maintenance, and fuel-related fields are derivable from `EngineLimits`, `MaintenanceItemView`, and `AircraftTotals`. This design reads that layer; it does not change it.

"New flight" (the future feature that records a pre-flight flight plan) does not exist yet. This change must not block on it, but also must not create a record shape that "New flight" would have to migrate away from later.

## Goals / Non-Goals

**Goals:**
- A pilot can complete a PAVE/IMSAFE questionnaire for a specific aircraft and planned flight, get an aggregated Low/Medium/High verdict with top contributing factors, and have that evaluation persisted permanently.
- The Aircraft domain blends pilot-answered items with values auto-scored from existing fleet data, visibly (per the prototype brief: "let those visibly feed the risk score").
- Every completed evaluation is retained as an immutable, timestamped record — the audit trail a documented risk-assessment process requires.
- The record a risk assessment attaches to (`flight_intent`) is deliberately minimal so the future "New flight" capability can become its primary writer without a breaking migration.

**Non-Goals:**
- No dispatcher/instructor countersignature or multi-crew workflow — this is a single-pilot GA tool.
- No probability×severity risk-matrix scoring (SMS-scale approach) — out of proportion to a single-pilot tool with no incident-history corpus.
- No editing or deleting a submitted evaluation — corrections happen by submitting a new one.
- No building "New flight" itself — only the minimal `flight_intent` seam it will later extend.
- No automated reminders/expiry ("this assessment is now stale") in this change.

## Decisions

### Domain structure: PAVE at the top, IMSAFE inside Pilot
The questionnaire has four domains — Pilot, Aircraft, enVironment, External pressures — matching `risk.title`/`risk.subtitle` ("IMSAFE / PAVE self-assessment tool") already in the catalogs. The Pilot domain's items are the six IMSAFE checks. This avoids inventing a fifth ad hoc taxonomy and matches what pilots trained under either mnemonic already recognize.

### Scoring: per-item weighted points, summed per domain, summed overall
Each questionnaire item carries a fixed point value (e.g., 0/2/4/6, following the AOPA ASI FRAT convention already implicit in the prototype's "puntuación automática" aircraft strip). Domain score = sum of its items' points. Overall score = sum of domain scores. Two fixed thresholds map the overall score to Low/Medium/High, matching the three verdict strings already shipped. Thresholds and item weights live in a versioned config object in code (not the database) — alternative considered: store weights in the DB for admin tuning, rejected as premature since there is exactly one pilot-facing product surface and no admin UI to change them safely.

### Aircraft domain auto-score is a snapshot, not a live join
When an evaluation is submitted, the values read from `aircraft-fleet` (last-flight engine-trend flags, hours to next maintenance, fuel vs. required) are copied into the risk-assessment record at submission time, not referenced by ID. Alternative considered: store only the aircraft ID and recompute the auto-score on every read — rejected because a risk assessment is a point-in-time judgment (design goal: immutable record); if the aircraft's logged data changes later (new flight logged, maintenance completed), a past evaluation must keep showing what was actually known at the moment the pilot made the go/no-go call.

### `flight_intent`: the minimal seam for the future "New flight" feature
A `flight_intent` row is `{id, pilot_id, aircraft_id, planned_date, departure_icao, destination_icao, created_at}` — nothing else. A risk assessment always references exactly one `flight_intent`; a `flight_intent` may have zero or more risk assessments (a pilot can re-assess if conditions change before departure). Since "New flight" doesn't exist yet, this change lets a pilot create a `flight_intent` inline as step one of starting an assessment. When "New flight" ships, it becomes the primary writer of this table and is free to add its own richer columns (route legs, planned fuel, etc.) alongside these; existing risk-assessment records keep resolving through the same `flight_intent_id` foreign key, so no migration of historical risk data is needed. Alternative considered: skip the intermediate table and store the flight fields directly on `risk_assessments` — rejected because it would force "New flight" to either duplicate flight-identifying fields or migrate every historical risk-assessment row to point at its new table.

### Persistence and ownership pattern
Both new tables follow the existing per-pilot ownership and route-authorization pattern used by `aircraft-fleet` (`identity-access`'s route-level scoping) — every read/write is scoped to the authenticated pilot, and cross-pilot access fails closed exactly like the flight-logbook's "aircraft belonging to another pilot" scenario.

### Module wiring
`src/modules/risk/` gains `service.ts`/`forms.ts`/`paths.ts` mirroring `src/modules/fleet/`'s structure, and a `src/platform/risk/` layer (`flight-intent-repo.ts`, `risk-assessment-repo.ts`, `scoring.ts`, `types.ts`) mirroring `src/platform/fleet/`. This keeps the module boundary and repo pattern consistent with the rest of the app rather than introducing a new structural convention.

## Risks / Trade-offs

- **[Risk]** Fixed code-defined item weights/thresholds can't be tuned without a deploy → **Mitigation**: acceptable at current scale (single product surface, no admin tooling); revisit if a future change needs operator-tunable scoring.
- **[Risk]** `flight_intent`'s minimal shape might still not match what "New flight" needs → **Mitigation**: keep it to the four fields every flight-planning feature needs regardless of design (who, what aircraft, when, where); richer fields are additive columns or a companion table, not a redesign of these four.
- **[Risk]** Snapshotting aircraft telemetry into each evaluation duplicates data → **Mitigation**: intentional (immutability requirement); the duplicated fields are small (a handful of numbers/flags), not the full aircraft record.
- **[Risk]** A pilot with no logged flights/maintenance data yet gets an Aircraft domain with nothing to auto-score → **Mitigation**: same pattern flight-logbook already uses for "no entries" — state plainly that no telemetry is available rather than fabricating a zero/favorable score.

## Migration Plan

1. Add `db/migrations/00X_flight_intents.sql` and `00X_risk_assessments.sql` (append-only, no backfill needed — new tables).
2. Add `src/platform/risk/*` (repos, scoring, types) reading from the existing `src/platform/fleet/*` exports.
3. Replace the `src/modules/risk/index.ts` placeholder registration with the real module (start-assessment flow, questionnaire form, result view, history list).
4. Add remaining i18n keys for `flight_intent.*` (most `risk.*` copy already exists in `en.json`/`es.json`/`pt.json` — verify `pt.json` parity, which the design brief doesn't mention was checked).
5. No rollback complexity: this is new, additive capability behind a currently-unimplemented route; reverting is deleting the new module/migrations.

## Open Questions

- Should a `flight_intent` be deletable/cancelable before "New flight" exists, or does it live forever once created (even if the flight never happens)? Proposed default: no delete — same "SHALL NOT be an independently editable/deletable" posture as other historical records in this app — but flagged for confirmation since it affects the inline-creation UX.
- Exact point weights and Low/Medium/High thresholds are an implementation-detail decision for tasks/implementation, not fixed here — the prototype's copy fixes the three verdict labels but not the numeric bands.
