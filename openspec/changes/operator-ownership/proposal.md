# Proposal

## Why

Every feature row is owned by `pilot_id`, and child tables use composite `(id, pilot_id)` foreign keys, so the database enforces "a pilot can only log a flight in an aircraft they own". That rules out the first realistic multi-user case for owner-pilots: **co-owners sharing one aircraft**. Every new aircraft-bound table makes a later migration more expensive. The decisions were made in the scaffold-ga-core task 11.1 exploration and interview (2026-09-23). An RLS spike against a throwaway Postgres 16 confirmed that the database-side model works, and found one silent-undercount pitfall that this change guards against.

## What Changes

- **Operators and memberships.**
  - New `operators` and `memberships (pilot_id, operator_id, role)` tables.
  - Each pilot gets a **personal operator**, created automatically at registration and backfilled for existing pilots, so nothing visible changes.
  - There is a single `member` role, and every member has equal edit rights.
- **Aircraft-bound records move to operator ownership:** `aircraft`, `aircraft_documents`, `aircraft_load_stations`, `aircraft_cg_envelope_points`, `maintenance_items`, `maintenance_completions`, `checklists`, `checklist_items`, and `engine_data_files`.
  - Their composite keys are re-pointed from `(id, pilot_id)` to `(id, operator_id)`.
  - They gain `created_by` / `updated_by` pilot audit columns.
  - **BREAKING (schema):** the `pilot_id` columns on these tables are replaced by `operator_id`.
- **Personal records stay pilot-owned:** `flight_entries`, `flight_intents`, `risk_assessments`, `checklist_runs`, `checklist_run_items`, `sessions`, and preferences.
  - Their links to aircraft-bound rows (`flight_entries.aircraft_id`, `flight_intents.aircraft_id`, `checklist_runs.checklist_id`) become plain foreign keys, with access checked by membership.
- **Aggregate-only aircraft totals.**
  - The airframe, engine, and tach totals and the landing count are the opening offset plus the sum across **all members'** flights, including members who have left.
  - They are exposed only as an aggregate; no query returns another member's flight rows.
  - Logbook pre-fill uses the pilot's **own** last flight on that aircraft.
- **Standing privacy rule:** personal records are never visible to an operator or its members. Any future sharing is an explicit, revocable opt-in by the pilot.
- **Enforcement at both layers:**
  - **App-level:** repositories scope every read and write by membership, keeping "foreign row is a 404". This is tested on every `npm run check` through the fake pool.
  - **Postgres row-level security (RLS):** a non-owner, non-superuser application role, a transaction-local `app.pilot_id` per request, and `FORCE ROW LEVEL SECURITY` policies on every feature table, failing closed when no pilot is set.
- **Out of scope:** invites and a co-owner interface, roles beyond `member`, clubs and schools, and an aircraft-level hour-meter log. These are follow-up changes.

## Capabilities

### New Capabilities
- `operator-ownership`: operators, memberships, personal operators, membership-scoped access at both layers, aggregate-only shared totals, audit columns, and the personal-records privacy rule.

### Modified Capabilities
- `identity-access`: "Ownership scoping" extends to operator membership and database-enforced isolation.
- `data-foundation`: "Standard table columns" covers operator-owned tables (operator FK plus audit columns) alongside pilot-owned ones.
- `aircraft-fleet`: "Aircraft records are scoped to their owner" becomes the operator.
- `maintenance-tracking`: "Maintenance data is scoped to its owner" becomes the aircraft's operator.
- `aircraft-checklists`: "A pilot owns and edits their aircraft's checklists" becomes checklists owned by the aircraft's operator, editable by members.
- `flight-logbook`:
  - entries link to an aircraft of an operator the pilot belongs to;
  - hour totals sum across members;
  - pre-fill comes from the pilot's own last flight.
- `flight-intent`: an intent names an aircraft of an operator the pilot belongs to, and stays personal.

## Impact

- **Tier:** mixed. The ownership boundary is security-critical, and hour totals feed hours-based maintenance due, which is Tier 1-adjacent. Every scenario needs a test; the RLS scenarios need live-DB tests.
- **Migrations:** 013 operators/memberships plus backfill; 014 re-point aircraft-bound tables; 015 the RLS role, policies, and functions. All are forward-only, and the backfill is idempotent.
- **Code:**
  - `src/platform/db/` gains a request-scoped connection: each request runs in one transaction with `set_config('app.pilot_id', …, true)`.
  - About 70 repository query sites move from the shared pool to the request's connection.
  - All `src/platform/{fleet,checklists,risk}/*-repo.ts` change their scoping from pilot to membership.
  - `fake-pool.ts` models `operators`/`memberships`.
  - `identity-service` creates the personal operator at registration.
- **Deployment (BREAKING):**
  - The app must connect as a new `ga_app` role (non-owner, `NOBYPASSRLS`). Migrations keep running as the owner role.
  - The SECURITY DEFINER aggregate functions are owned by a dedicated role that has `BYPASSRLS` (spike T16).
  - `DATABASE_URL` / `MIGRATION_DATABASE_URL` are split, and `.env.example` and the docker-compose init script are updated.
- **Verification gate:** there is no CI in this repository, so this change's gate includes the live-DB suite (`TEST_DATABASE_URL=… npm test`) run by the developer in addition to `npm run check`.
- **Docs:** the AGENTS.md "Conventions to keep" line on `pilot_id` ownership columns is updated.
