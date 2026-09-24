# Design

## Context

See proposal.md for why. The decisions come from the scaffold-ga-core task 11.1 interview; see that task's record.

- **Schema today.** 12 migrations. The aircraft-bound tables anchor on `aircraft (id, pilot_id)` with composite FKs. `flight_intents` and `checklist_runs` (personal) also point through composite `(…, pilot_id)` FKs into `aircraft` and `checklists`. There is no CI.
- **Query layer.** About 70 repository call sites use `pool.query` (autocommit); none run in a request transaction. Repositories are built once at startup (`createXRepo(pool)`).
- **Tests.** The web suite runs against `fake-pool.ts` (about 1,700 lines, a pattern-based SQL emulator), which cannot evaluate RLS. Live tests are guarded by `TEST_DATABASE_URL` (8 skipped by default).
- **Database role.** docker-compose connects the app as `ga`, a superuser. Superusers bypass RLS, so policies would be inert today.

### RLS spike (2026-09-23, throwaway `pgvector/pgvector:pg16` container)

16 checks against the proposed model, run as a non-owner `NOBYPASSRLS` app role with `FORCE ROW LEVEL SECURITY` and `set_config('app.pilot_id', …, true)`:

| Check | Result |
|---|---|
| No pilot set → 0 rows (fails closed) | ✓ |
| Co-owner sees the shared aircraft and maintenance, but only their own flight rows; no other member's remark leaks | ✓ |
| SECURITY DEFINER aggregate = offset + all members' flights | ✓ |
| Foreign aircraft absent; UPDATE/DELETE of a foreign row touches 0 rows (keeps the 404 behavior) | ✓ |
| The transaction-local setting is gone after COMMIT (pooled-connection safety) | ✓ |
| Stranger's aggregate → NULL, not an error | ✓ |
| Stranger's INSERT into a foreign aircraft/operator → `violates row-level security policy` | ✓ |
| Leaver loses the aircraft, keeps the logbook, and still counts in the total | ✓ |
| Membership subplan hashed once per query, not per row | ✓ |
| **Aggregate function owned by a `NOBYPASSRLS` role → 72054 instead of 72144, a silent undercount** | ⚠ pitfall |

## Goals / Non-Goals

**Goals:** co-owner-ready ownership with nothing visible changing for single owners; defense in depth, where the database still isolates operators if an application query forgets to scope; aggregate-only sharing of hours.

**Non-Goals:** invites and co-owner management UI; roles beyond `member`; clubs and schools; an aircraft hour-meter log; opt-in sharing of personal records.

## Decisions

1. **Split ownership by the nature of the data.** Operator-owned: `aircraft`, `aircraft_documents`, `aircraft_load_stations`, `aircraft_cg_envelope_points`, `maintenance_items`, `maintenance_completions`, `checklists`, `checklist_items`, `engine_data_files`. Pilot-owned: `flight_entries`, `flight_intents`, `risk_assessments`, `checklist_runs`, `checklist_run_items`, `sessions`. `pilots.active_aircraft_id` stays per pilot and is cleared when the pilot loses access to that aircraft.
2. **Composite FKs re-anchored on `(id, operator_id)`** for the aircraft-bound children, so the database still rejects cross-operator children. Personal → aircraft-bound links (`flight_entries.aircraft_id`, `flight_intents.aircraft_id`, `checklist_runs.checklist_id`) become plain FKs. "The pilot is a member" is enforced by RLS `WITH CHECK` (spike T12) and by the repository, because an FK cannot express membership.
3. **Personal operator.** Migration 013 creates one operator (`kind = 'personal'`) and one membership per existing pilot, and `identity-service` does the same in the registration transaction. Registration uniqueness (`aircraft_registration` per pilot) becomes per operator.
4. **Request-scoped connection.**
   - A Fastify `onRequest`/`onResponse` pair opens one transaction per authenticated request on a pooled client, runs `SELECT set_config('app.pilot_id', $1, true)`, and exposes it as `req.db: Queryable`. The transaction commits on 2xx/3xx and rolls back otherwise.
   - Repositories stop capturing the pool at startup. Their factories take a `Queryable` per call, e.g. `aircraftRepo(req.db).findById(...)`.
   - Anonymous requests get a connection with no pilot set, which fails closed.
   - The migration runner and seeds keep using the owner connection.
   - *Alternative:* session-level `set_config(..., false)` on checkout, reset on release. Rejected, because a missed reset leaks one pilot's identity into the next request. The transaction-local setting cannot leak (spike T8).
5. **Two database roles plus a definer owner.** A migration creates:
   - `ga_app` (LOGIN, NOSUPERUSER, NOBYPASSRLS, DML grants only);
   - `ga_aggregate` (NOLOGIN, BYPASSRLS, SELECT only on `aircraft`, `memberships`, `flight_entries`), which owns the aggregate functions.

   The app connects with `DATABASE_URL` as `ga_app`, and migrations use `MIGRATION_DATABASE_URL` as the owner. The docker-compose init script creates `ga_app` for local development. A live test asserts the aggregate function's owner has `rolbypassrls` (spike T16).
6. **Policies.**
   - Operator-owned: `USING / WITH CHECK (operator_id IN (SELECT my_operators()))`, where `my_operators()` is SECURITY DEFINER, reads only the caller's memberships, and is owned by `ga_aggregate`.
   - Pilot-owned: `pilot_id = current_pilot()`, plus for `flight_entries`/`flight_intents` a `WITH CHECK` that the referenced aircraft is visible.
   - `memberships`: a pilot sees only their own rows. `operators`: visible if a member.
   - All tables use `FORCE ROW LEVEL SECURITY`.
7. **Aggregate-only totals.** `aircraft_totals(aircraft_id)` is a SECURITY DEFINER SQL function returning airframe/engine/tach minutes and landings. It returns NULL for a non-member. It is the only path by which a member's page receives other members' hours. The fleet repository's totals and maintenance "hours remaining" call it. Pre-fill queries the pilot's own entries only.
8. **Engine-monitor data.** `engine_data_files` gains `aircraft_id` and `operator_id` and keeps its `flight_entry_id` FK. Members see imports for the aircraft (provenance + channels). The linked flight's personal fields are never joined in.
9. **Fake pool.** `fake-pool.ts` models `operators`/`memberships` and membership-scoped queries, so the application-level checks stay covered by `npm run check`. RLS behavior is covered only by the live suite (`TEST_DATABASE_URL`), which becomes part of this change's gate.

## Risks / Trade-offs

- [The request-transaction refactor touches every repository] → Done mechanically in one group, module by module, with the full web suite run after each module.
- [RLS is inert if the app ever connects as the owner or a superuser] → A startup check queries `current_user`'s `rolsuper`/`rolbypassrls` and **refuses to start in production** if either is true. A live test asserts policies are forced on every feature table (`relforcerowsecurity`).
- [Silent aggregate undercount (spike T16)] → A dedicated `ga_aggregate` owner with BYPASSRLS, plus a live test on the function owner and a two-member total.
- [Long requests hold a transaction] → Weather MCP calls happen outside the DB transaction. The weather fragment routes take no DB connection, or release it before calling the MCP.
- [Two-member inference] → Documented limitation (spec).
- [No CI, so the live suite depends on the developer] → The tasks gate requires the live-suite output recorded before archive.

## Migration Plan

1. 013: `operators`, `memberships`, personal-operator backfill (idempotent `ON CONFLICT DO NOTHING`).
2. 014: add `operator_id` + audit columns to aircraft-bound tables, backfill from the personal operator, re-anchor composite FKs, drop the old `pilot_id` columns on those tables, re-point personal → aircraft-bound FKs, and rewrite the checklist backfill's `pilot_id` usage.
3. 015: roles, grants, functions, policies, `FORCE ROW LEVEL SECURITY`.
4. Deploy: create `ga_app` credentials, split `DATABASE_URL` / `MIGRATION_DATABASE_URL`, run migrations as the owner, then start the app as `ga_app`.
5. Rollback: forward-only per repo convention. A fix-forward migration can `DISABLE ROW LEVEL SECURITY` in an emergency, and the application-level checks still hold.

## Open Questions

- Whether `operators` needs a display name now or only once co-owners are invited. It is deferrable, because the column can be added with the invite change without changing these specs.
