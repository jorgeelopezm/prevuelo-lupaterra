# Tasks

## 1. Operators and memberships

- [ ] 1.1 Migration 013: `operators` (standard columns, `kind` = `personal`) and `memberships (pilot_id, operator_id, role = 'member')` with an index on `pilot_id`, plus an idempotent personal-operator backfill. Verify with `migrations.test.ts`/`schema.test.ts`: tables, keys, index; backfill run twice creates no duplicates.
- [ ] 1.2 `identity-service` registration creates the personal operator and membership in the same transaction as the pilot. Verify with a test: registration → exactly one personal operator with that pilot as sole member; a failing insert leaves neither.
- [ ] 1.3 `fake-pool.ts` models `operators` and `memberships`. Verify with the existing fake-pool-backed suites still green.

## 2. Re-anchor aircraft-bound tables

- [ ] 2.1 Migration 014: add `operator_id`, `created_by`, `updated_by` to the nine aircraft-bound tables; backfill from the personal operator; re-anchor composite FKs on `(id, operator_id)`; drop their `pilot_id`; make per-operator registration uniqueness; re-point `flight_entries.aircraft_id`, `flight_intents.aircraft_id`, and `checklist_runs.checklist_id` to plain FKs; add `aircraft_id`/`operator_id` to `engine_data_files`. Verify with `schema.test.ts`: every aircraft-bound table has a non-null `operator_id` FK and audit columns; a cross-operator child insert is rejected; the backfilled data is identical per pilot.
- [ ] 2.2 Update the drift guard for the checklist backfill (`schema.test.ts` "the checklist backfill matches the generated template output") to the operator shape. Verify the drift test passes.

## 3. Request-scoped connection

- [ ] 3.1 A Fastify plugin opens one transaction per request, sets `app.pilot_id` transaction-locally for authenticated requests, exposes `req.db`, and commits on success or rolls back on error. Weather MCP calls run outside it. Verify with tests: committed on 2xx; rolled back on thrown error; no pilot set for anonymous requests; the connection is always released.
- [ ] 3.2 Refactor repository factories to take a `Queryable` per call, module by module: fleet, checklists, risk, identity. Run the full web suite after each module. Verify with `npm test` green after each module, and `grep` showing no repository captures the startup pool.

## 4. Application-level membership scoping

- [ ] 4.1 Aircraft, documents, W&B, maintenance, checklists, and engine data repositories scope by `operator_id IN (memberships of pilot)` and stamp `created_by`/`updated_by`. Verify with repo tests:
  - *happy:* a member reads and edits;
  - *sad:* a non-member gets `null` → 404 on every read and write path;
  - *audit:* the updater is recorded.
- [ ] 4.2 Flight entries and flight intents accept only an aircraft of a member operator. Personal reads stay `pilot_id` only. Verify with repo tests: logging in a non-member aircraft is rejected with no disclosure; a co-owner cannot read another member's entry or intent.
- [ ] 4.3 Aggregate totals through `aircraft_totals` (live) or its fake-pool equivalent, used by the aircraft screen and maintenance "hours remaining". Pre-fill queries only the pilot's own entries. Verify with tests: *Total across co-owners* (1,202.4); a leaver's flights still count; pre-fill ignores a co-owner's later flight; a non-member gets no total.
- [ ] 4.4 `pilots.active_aircraft_id` is cleared when the pilot is no longer a member of that aircraft's operator. Verify with a test.

## 5. Database enforcement

- [ ] 5.1 Migration 015: roles `ga_app` (NOBYPASSRLS, DML grants) and `ga_aggregate` (BYPASSRLS, owner of `my_operators`, `current_pilot`, `aircraft_totals`); policies per design decision 6; `FORCE ROW LEVEL SECURITY` on every feature table. Verify with the live tests in 5.3.
- [ ] 5.2 Config and deployment: add `MIGRATION_DATABASE_URL`; the migration runner uses it. A startup guard refuses to start in production when the app role has `rolsuper` or `rolbypassrls`. Add a docker-compose init script creating `ga_app`, and update `.env.example`. Verify with `config.test.ts` (new variable validated, secrets never echoed) and a unit test of the guard with a stubbed role row.
- [ ] 5.3 Live suite (`TEST_DATABASE_URL`), one test per scenario of *Access is enforced by the database as well as the application*: no pilot set → no rows and writes rejected; the setting does not leak across a committed transaction; a deliberately unscoped query still returns only member rows; a write outside the pilot's operators is rejected; the aggregate function's owner has `rolbypassrls` and the two-member total is complete (spike T16); every feature table has `relrowsecurity` and `relforcerowsecurity`.

## 6. Tests: scenario traceability

- [ ] 6.1 Web suite (fake pool) per modified capability: `aircraft-fleet` *Co-owned aircraft*; `maintenance-tracking` *Co-owner completes a shared item*; `aircraft-checklists` *Co-owner sees the shared library*; `flight-logbook` *Aircraft of an operator the pilot does not belong to*, *Total across co-owners*, *A co-owner flew it since*; `flight-intent` cross-pilot including a co-member; `identity-access` both new scenarios; `data-foundation` both new scenarios. Existing scenarios stay covered by their current tests.
- [ ] 6.2 Evals:
  - every aircraft-bound route answers 404, never 403, for a non-member;
  - no co-owner page contains another member's remark, passenger count, route, or name (fixtures carry distinctive strings);
  - single-owner pages render identically before and after the migration (snapshot of the aircraft, logbook, and home screens for a seeded pilot).
- [ ] 6.3 Privacy documentation: state the two-member inference limitation where the aggregate is shown (developer docs, and a catalog string if surfaced). Verify by review.

## 7. Verification gate

- [ ] 7.1 Record, per spec scenario (8 capabilities), the test that verifies it.
- [ ] 7.2 Developer-authorized: `npx prettier --write src db mcp/aviation-weather/src`, `npm run check`, and **`TEST_DATABASE_URL=postgres://… npm test` (live suite, required for this change)**, plus `openspec validate operator-ownership --strict`. All green, with the output recorded here.
- [ ] 7.3 Update the AGENTS.md "Conventions to keep" ownership line (pilot-owned vs operator-owned, RLS, two DB roles).
- [ ] 7.4 Manual: with a seeded pilot, the aircraft, logbook, maintenance, checklists, risk, and home screens look unchanged; then add a second membership by SQL and confirm the co-owner sees the aircraft and the aggregate total but none of the first pilot's flights.
