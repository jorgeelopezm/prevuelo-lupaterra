## Context

The `checklists` module owns `destinationPath('checklists', locale)` and currently delegates to `registerPlaceholderScreen`. This change makes it the fifth real feature module, following the pattern `fleet` and `risk` established: a locale-scoped root, localized sub-segments resolved from `chrome.ts`, repositories under `src/platform/<domain>/`, form validation in `src/modules/<module>/forms.ts`, and one route handler serving both the full page and the htmx fragment.

What already exists and is reused unchanged:

| Need | Source already in the repository |
| --- | --- |
| Pilot identity, auth gate | `req.pilot`, `createRequireAuthHook` (`src/server/auth/auth-plugin.ts`) |
| The pilot's fleet | `aircraftRepo.list` / `listActive` / `getActiveAircraft` |
| Active aircraft in the shell | `req.activeAircraftRegistration` (`active-aircraft-plugin.ts`) |
| The flight a run belongs to | `flightIntentRepo.listForPilot` (`src/platform/risk/flight-intent-repo.ts`) |
| Localized sub-segments | `src/platform/i18n/chrome.ts` + the `fleetPath`/`riskPath` precedent |
| Transactions | `pool.withTransaction` (`src/platform/db/pool.ts`) |
| Per-pilot row integrity | the `(id, pilot_id)` composite-unique + composite-FK pattern from `004_aircraft.sql` and `009_flight_intents.sql` |
| Fragment rendering | `app.views.render(req, { fragment, locals })` (`src/server/views/views.ts`) |

Binding constraints from `AGENTS.md` and the existing specs:

- **No operational-looking data without provenance.** Checklist item text *is* operational-looking: it reads as procedure. Seeded content is generic and must say so in text until the pilot has made it theirs.
- **No fabricated favorable defaults.** A progress figure with no run behind it is never `0 / 0` or a blank bar — it is an explicit, text-stated unavailable state.
- **Fragment convention.** The fragment is always the same partial the full page embeds — never a second copy.
- **Mobile-first.** Authored at 320px, widened with `md:`/`lg:`; every interactive control keeps a 44px minimum touch target (test-enforced). The prototype's three-pane desktop layout is not authorable as-is at phone width; see decision 2.
- **No SPA.** Server-rendered Nunjucks, htmx for swaps, no client router, no hydration, no client-held checklist state.

The visual reference is `diseno/src/App.tsx` → `Checklists` (lines 383–524), read-only; never modified.

## Goals / Non-Goals

**Goals:**

- Replace the checklists placeholder with a per-aircraft checklist library the pilot owns and can edit.
- Reproduce the prototype's fleet → checklist → items hierarchy, completion counter, progress bar, reset, emergency band, and all-complete confirmation.
- Persist run progress server-side so it survives reload, sign-out, and a change of device, without introducing client-held state.
- Make a completed run an immutable record of what the pilot actually confirmed.
- Give the home screen's Checklists tile a real, sourced figure.
- Keep seeded content honestly labeled as generic, never as the aircraft's certificated procedures.

**Non-Goals:**

- Parsing or importing a POH/AFM. That is the documents/AIS capability's problem.
- Any offline or in-flight availability guarantee. There is no service worker and no offline story in this application; emergency procedures here are a convenience reference on a connected device, and the UI must not imply otherwise.
- Sharing, publishing, or forking checklists between pilots.
- Type-level (rather than instance-level) checklist content.
- Attaching a completed run to a logbook entry, or gating a risk assessment on checklist completion.

## Decisions

### 1. Two tables per concern, four tables total: library and runs are separate

`checklists` + `checklist_items` hold the pilot's editable library. `checklist_runs` + `checklist_run_items` hold executions, and `checklist_run_items` carries a **copy** of the item's text and ordinal, not a foreign key to `checklist_items`.

*Why:* the interview settled that a run snapshots its items — a later edit must never rewrite history. A foreign key would make the run a live view of the library, so a completed run could later display wording the pilot never read. The precedent is already in the repository: `risk_assessments.aircraft_snapshot` is a point-in-time copy for exactly this reason, and `009_flight_intents.sql` documents the same immutability posture.

`checklist_run_items` still keeps a nullable `checklist_item_id` for provenance ("this confirmation came from that item"), set to `NULL` on item delete. It is never read for display text.

*Alternative rejected:* a single `runs.items jsonb` document (as `risk_assessments.answers` does). Rejected because run items are toggled individually and very frequently — one `UPDATE ... SET checked = ...` on a narrow row beats a read-modify-write of a JSONB document under concurrent taps, and a per-row index makes the tile's count a cheap aggregate.

### 2. The prototype's three panes become progressive disclosure on phone

Desktop (`lg:`) renders the prototype's three columns: fleet (w-44), checklist selector (w-52), items. Below `lg:` the same three levels become three **routes**, each a full screen with a back affordance:

```
/es/listas                          → fleet list (one row per aircraft)
/es/listas/<aircraftId>             → that aircraft's checklists, normal + emergency
/es/listas/<aircraftId>/<checklistId>  → the items (run, or emergency reference)
```

The desktop layout renders all three at once from the *same* route; the URL always names the deepest selected level, and the two outer panes are rendered from the same view model. One template set, no viewport sniffing, no JavaScript-driven layout.

*Why:* three side-by-side panes at 320px gives roughly 100px per pane — unusable one-handed, and incompatible with the 44px touch-target rule. The pattern is already in the repository: the fleet module's aircraft list → detail split works the same way.

*Alternative rejected:* a collapsible accordion holding all three levels in one route. Rejected because the item list is the screen the pilot actually uses, in a cockpit, and it should own the whole viewport rather than sit below two collapsed headers.

### 3. Seeding happens inside `aircraftRepo.create`'s transaction, via an injected seeder

`createAircraftRepo` takes an optional `onAircraftCreated` hook; the checklists platform module supplies `seedChecklistsForAircraft(tx, pilotId, aircraftId, locale)`, and it runs in the **same transaction** as the aircraft insert.

*Why:* an aircraft that exists with no checklists is a state the UI would have to special-case forever. Same-transaction seeding means the invariant "every aircraft has a library" holds at the database level from the first moment. Injection rather than a direct import keeps `platform/fleet` from depending on `platform/checklists` — the module-boundary test (`src/modules/boundary.test.ts`) exists to catch exactly that kind of coupling.

*Alternative rejected:* lazy seeding on first visit to the checklists screen. Rejected because it makes a `GET` a write, and because the home tile reads the library without the pilot ever opening the screen.

### 4. Template content lives in a versioned code module, not in the i18n catalogs

`src/platform/checklists/template.ts` exports `GENERIC_GA_TEMPLATE`, a versioned structure holding the nine checklists and their items with `es`/`en`/`pt` text side by side, plus `templateVersion`. Seeding copies the rows in the pilot's locale at aircraft-creation time.

*Why:* the UI catalogs are for chrome — labels, messages, segments. Procedure text is content: it is versioned, it is copied into rows at a point in time, and it must not change under a pilot who has already run it. The prototype's `cl.items` JSON blob in `i18n.ts` is exactly the anti-pattern to avoid — a translation key whose value is a JSON document of operational text.

*Consequence:* a pilot who switches locale after seeding keeps the item text they were seeded with. This is correct — those rows are now the pilot's own edited content, and silently retranslating a procedure the pilot may have amended would be worse than leaving it. The screen chrome around it still follows the request locale.

### 5. Emergency checklists are a `kind` column, not a separate table

`checklists.kind` is `'normal' | 'emergency'` with a CHECK constraint. Emergency checklists render read-only: no checkbox markup, no run route, no progress state. Attempting to start a run against an emergency checklist is a 400, not a silent no-op.

*Why:* they are the same shape of data and belong in the same per-aircraft library and the same CRUD screens; only their *presentation and runnability* differ. Enforcing the restriction at the route boundary rather than only in the template means the rule survives a future template refactor.

### 6. One open run per `(pilot, flight_intent, checklist)`, enforced by a partial unique index

```sql
CREATE UNIQUE INDEX checklist_runs_open_uniq
  ON checklist_runs (pilot_id, flight_intent_id, checklist_id)
  WHERE completed_at IS NULL;
```

Opening the run route finds the open run or creates one (snapshotting items) in a single transaction. Completing sets `completed_at`; a new run against the same pair is then permitted, and the completed one stays.

*Why:* it makes "resume where you left off" the database's guarantee rather than application logic racing itself across two tabs. The partial-index-on-a-nullable-timestamp shape is already used in `004_aircraft.sql` for per-pilot registration uniqueness among non-retired aircraft.

### 7. Toggling an item is a `POST` that returns the item row *and* an out-of-band progress swap

`POST <run>/items/<runItemId>/toggle` writes the new state and re-renders `partials/checklist-item.njk` for the swapped row, plus `partials/checklist-progress.njk` with `hx-swap-oob="true"` for the counter, bar, and all-complete banner.

*Why:* the counter and the bar are not adjacent to the row in the DOM, and the alternative — re-rendering the whole item list on every tap — loses scroll position on a 25-item preflight list and sends far more markup than the interaction warrants. Out-of-band swaps are the htmx-native answer and require no client state.

*No-JavaScript behavior:* each item is a real `<form method="post">` with a submit button; without htmx the post round-trips and the server redirects back to the run URL. The screen degrades to full page loads, never to a dead control.

### 8. The run is bound to the pilot's next flight intent, resolved at route time

Opening a normal checklist resolves the pilot's next flight intent (soonest `plannedDate` on or after today, the same selection `home-dashboard`'s service makes). With no flight intent, the screen shows the checklist read-only with a localized prompt to plan a flight first, and a link to the flight-intent screen — it does not invent an intent and does not silently run unattached.

*Why:* the interview settled that runs are flight-scoped, and `flight_intents` is already documented as "the minimal seam for the future 'New flight' feature". Binding here means checklist history becomes per-flight history for free once that feature lands.

*Alternative rejected:* an aircraft-scoped run with an optional intent link. Rejected because a nullable scope column makes every query and every history grouping conditional, for a case the product does not want.

### 9. Reset clears the open run's items; it never deletes a completed run

The prototype's Reset button maps to `POST <run>/reset`, which sets every `checklist_run_items.checked_at` to `NULL` for the open run. If the run is already completed, reset is a 400 — the pilot starts a new run instead.

*Why:* keeping completed runs is the point of the history view. A reset that could erase a completed pre-flight record would make the record untrustworthy exactly where it matters.

### 10. `nav.segment.checklists` is localized; sub-segments follow the `risk.segment.*` precedent

`chrome.ts` gains `checklist.segment.{run,edit,new,delete,history,items}` per locale, and `nav.segment.checklists` becomes `listas` for `es` and `pt`. `src/modules/checklists/paths.ts` mirrors `risk/paths.ts` exactly.

*Why:* every other destination and sub-route in the application is localized; `checklists` sitting in a Spanish URL was an artifact of the module never having been implemented. Nothing links to the old path but the nav itself, which is generated.

### 11. The home tile reads a single aggregate, not the run's rows

`checklistRunRepo.preflightProgressForIntent(pilotId, flightIntentId, aircraftId)` returns `{ checklistName, checkedCount, totalCount } | null`. The dashboard's `checklistsTile` renders the count when it is non-null and an `unavailableKey` when it is null (no intent, no active aircraft, no pre-flight checklist, or no run started).

**Which checklist is "the pre-flight one"** is `checklists.role`, a nullable column set to `'preflight'` on the seeded Preflight/Walkaround list. The pilot can move the role to another checklist; a partial unique index keeps at most one per aircraft. Without it, the tile would have to match on a name the pilot is free to rename.

*Why:* a name-matched tile breaks the moment a pilot renames "Preflight / Walkaround" to "Walkaround", and breaks silently — the tile would just say unavailable forever with no way for the pilot to understand why.

### 12. `checklists` is excluded from the placeholder-only eval, `documents` is not

`src/modules/modules.test.ts` keeps asserting that every *remaining* placeholder module renders the shared partial and carries no operational-looking values. `documents` stays in that set; `checklists` joins `dashboard`, `weather`, `fleet`, and `risk` outside it, and its own no-fabrication obligations move into the new capabilities' specs.

## Risks / Trade-offs

- **Seeded generic procedures could be mistaken for the aircraft's POH.** This is the real risk in the change, and the reason the emergency content is held to the Tier 1 bar. → Mitigation: a `source` column (`'template' | 'pilot'`) per checklist, set to `'template'` at seed and flipped to `'pilot'` on first edit; a localized caveat banner renders on every screen showing a `'template'` checklist, including the run screen and the emergency reference; an eval test asserts the caveat is present whenever a `'template'` checklist is rendered and that no screen labels seeded content as aircraft-specific.
- **Emergency reference on a connected-only web app.** A pilot could come to rely on it in flight where there is no connectivity. → Mitigation: scope explicitly excludes any offline claim; the emergency screen states that it is a ground reference and not a substitute for the aircraft's checklist. No caching promise is made anywhere in the UI or the copy.
- **Snapshot rows multiply storage.** Every run copies up to ~25 rows per checklist. → Mitigation: acceptable — a GA pilot generates on the order of hundreds of runs per year, rows are narrow, and the alternative (live FKs) was rejected on correctness, not size. Revisit with retention only if a pilot's run-item count becomes a real number.
- **Seeding inside `aircraftRepo.create` widens that transaction.** A seeding bug would now fail aircraft creation. → Mitigation: the seeder is pure data plus inserts with no external calls; happy- and sad-path tests cover aircraft creation with the seeder present, and a test asserts that a seeder failure rolls back the aircraft insert rather than leaving a half-created aircraft.
- **Backfilling existing aircraft in migration `011`.** Aircraft created before this change need the same seed, in SQL rather than TypeScript, duplicating the template content in two places. → Mitigation: generate the backfill `INSERT`s into the migration from `template.ts` via a small script committed alongside it, and assert in a test that the migration's seeded rows match `GENERIC_GA_TEMPLATE` at `templateVersion` 1, so the duplication cannot drift silently.
- **`home-dashboard` is not yet a main spec.** The `home-dashboard` delta modified by this change lives under `openspec/changes/inicio-page/` (47/48 tasks). → Mitigation: land or sync `inicio-page` before starting this change's dashboard task group; the tasks file orders the tile work last and states the dependency.

## Open Questions

- **Reordering interaction.** Drag-and-drop needs JavaScript beyond htmx. The design assumes up/down buttons on each row (44px targets, one `POST` each), which works with and without htmx. Confirm before building the edit screens if a richer interaction is wanted.
- **Item types.** The prototype has flat text items only. Real checklists often have `CHALLENGE — RESPONSE` pairs and section headers. This change ships flat text; the schema leaves room (`checklist_items.response` nullable, unused in v1) so adding them later is not a migration of existing rows. Confirm that flat text is acceptable for the first release.
