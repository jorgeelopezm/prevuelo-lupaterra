# Tasks

## 0. Prerequisite

- [x] 0.1 Archive `provenance-issued-at-nullable` (developer-authorized) so the `weather-mcp` provenance requirement allows a null issue time. Verify with `openspec list --specs`, which shows the updated requirement. Done 2026-09-23.

## 1. Configuration

- [x] 1.1 `src/platform/config/schema.ts`: add `awc` to `WEATHER_PROVIDER` (no credential entry) and add `NOTAM_PROVIDER` (`mock` | `avwx`, optional) to both the web and MCP schemas. The refine step defaults it to the weather provider for `mock`/`avwx`, aborts naming `NOTAM_PROVIDER` for `awc` when it is unset, and aborts naming `AVWX_API_TOKEN` when `NOTAM_PROVIDER=avwx` has no token. Verify with `src/server/config.test.ts` and `mcp/aviation-weather/src/config.test.ts`: awc + avwx parses; awc alone aborts naming `NOTAM_PROVIDER`; `NOTAM_PROVIDER=avwx` without a token aborts naming `AVWX_API_TOKEN`; mock and avwx configurations are unchanged.
- [x] 1.2 `.env.example`: document `WEATHER_PROVIDER=awc` and `NOTAM_PROVIDER`, including the note about sample NOTAMs. Verify by reading it (no secrets).

## 2. AWC provider

- [x] 2.1 `mcp/aviation-weather/src/provider/awc.ts`: `getMetar`/`getTaf` (batched `ids=`, request order, missing indicator → no data, 204/empty → no data, Unix seconds → ISO, unparseable → null, `issuedAt` = latest or null), `getSigmet` (exact `firId` match, validity from `validTimeFrom`/`validTimeTo` or null, `coverage: 'unknown'`), `getNotams` (never called; throws a programming error if reached), a User-Agent on every request, and the existing abort timeout. Verify with `awc.test.ts` using a stubbed `fetch`:
  - *happy:* multi-ICAO METAR/TAF in order, SIGMET exact-FIR match (a `firId` that merely contains the requested FIR's letters is excluded);
  - *sad:* 204, empty array, unknown indicator, 400/403/429/500 throw with no report text, null or garbage times → null;
  - *eval:* no result ever carries the current time as an observation, issue, or validity time; the User-Agent header is present; `sample: false`.
- [x] 2.2 `provider/create.ts`: return `{ weather, notams }`. `awc` builds `AwcWeatherProvider` with no credential; the NOTAM side builds `mock` or `avwx` per `NOTAM_PROVIDER`. Also fix the misleading AEMET-key fallthrough for `ipma`/`ead` so each unimplemented provider aborts as not-yet-implemented. Verify with `create.test.ts`: awc + avwx builds two distinct providers; awc + mock; avwx alone shares one instance; `ipma` aborts naming itself, not AEMET.

## 3. Tool service and startup

- [x] 3.1 `tools/service.ts`: accept `{ weather, notams }`. Use `notams.id` for `get_notams` and `weather.id` otherwise, in the rate-limiter key, the cache key, and both error types. Verify with `service.test.ts`: an exhausted NOTAM budget rejects `get_notams` while `get_metar` still succeeds; a failing NOTAM upstream yields a `ProviderError` naming `avwx` while METAR is unaffected; a NOTAM result's provenance names the NOTAM provider.
- [x] 3.2 `index.ts` and `server.ts` wiring: the startup log states `weatherProvider` and `notamProvider`. Verify with the `transports.test.ts` startup-log test, extended to assert both fields.

## 4. Official briefing link (web)

- [x] 4.1 `src/platform/weather-mcp/briefing.ts`: `officialBriefingFor(icao)` with the static prefix table. Verify with unit tests: `LEMD`, `GCLP` → ENAIRE; `LPPT`, `LPPD` → NAV Portugal; `SUMU`, `KJFK` → null; lower-case input is normalized.
- [x] 4.2 Attach `briefing` to the NOTAM view models in `src/modules/weather/service.ts` and `src/modules/dashboard/service.ts`, only when coverage is not `complete`. Add catalog keys `weather.briefing_link_enaire` and `weather.briefing_link_nav_portugal` in `es`/`pt`/`en`, and update the pinned key count in `catalog.test.ts` (+2). Verify with the service tests: complete coverage → no briefing; unknown coverage for LEMD → ENAIRE.
- [x] 4.3 A `briefingLink` macro in `weather-results.njk` (`touch-target`, `rel="noopener noreferrer"`, `target="_blank"`), used in `weather.njk` and `home-weather.njk`. Verify with the tests in group 5.

## 5. Tests: scenario traceability (Tier 1)

- [x] 5.1 Weather screen (`src/modules/weather/index.test.ts`), full page and fragment: one named test per scenario of *Official briefing link on unconfirmed NOTAM sections* (LEMD, GCLP, LPPT, SUMU with no link and the AIS text still present, complete coverage with no link).
- [x] 5.2 Home brief (`src/modules/dashboard/index.test.ts`): *Departure aerodrome in Spain*, *Departure aerodrome outside Spain and Portugal*.
- [x] 5.3 Evals:
  - the briefing link carries the `touch-target` class and `rel="noopener noreferrer"`;
  - no rendered page contains text fetched from ENAIRE/NAV Portugal (the fixtures make no such request, and `fetch` is asserted uncalled on the web side);
  - an AWC-backed page never shows `Datos de muestra` on METAR/TAF but does show it on mock-sourced NOTAMs when `NOTAM_PROVIDER=mock`.

## 6. Verification gate

- [x] 6.1 Record, per spec scenario (`weather-mcp`: the 2 new requirements, 11 scenarios; `weather-notams-page`: 5; `home-dashboard`: 2), the test that verifies it.
- [x] 6.2 Propose `npx prettier --write src mcp/aviation-weather/src`, `npm run check`, and `openspec validate awc-weather-provider --strict` for the developer to authorize; all green before archiving. Run by the developer on 2026-09-23: prettier, `npm run check`, and `openspec validate awc-weather-provider --strict` were all green.
- [ ] 6.3 Manually verify with `WEATHER_PROVIDER=awc NOTAM_PROVIDER=avwx` (with a token): `/es/meteorologia?icao=LEMD,LPPT` shows real METAR/TAF from `awc` and NOTAMs from `avwx` with the ENAIRE/NAV Portugal links; `?fir=LECM` shows AWC SIGMETs or the unconfirmed-empty state. Then with `WEATHER_PROVIDER=awc` alone, startup aborts naming `NOTAM_PROVIDER`.

## Implementation notes (2026-09-23)

- **Factory shape (design decision 2).** `createWeatherProvider` keeps building a single provider, so the existing call sites and tests are untouched. A new `createProviders(config) → { weather, notams }` wraps it and shares one instance when both are the same provider. `WeatherToolService` takes an optional `notamProvider`, which defaults to `provider`.
- **SIGMET provenance time.** The `isigmet` schema has `receiptTime` (when AWC received it) but no issue time. Neither `receiptTime` nor a validity start is used as "issued", so AWC SIGMET results carry `issuedAt: null`.
- **AVWX NOTAM plan (not a code change).** `avwx.ts` records, verified live, that AVWX's NOTAM endpoint is gated to its *enterprise* plan. With a free token, `NOTAM_PROVIDER=avwx` returns a structured `avwx` error, never NOTAM text. The split-provider routing is still correct, but real NOTAMs need an enterprise AVWX plan.

## Traceability (task 6.1)

**weather-mcp — Keyless AWC provider for METAR, TAF, and SIGMET**
- *Selected without a credential*: `config.test.ts` (web + MCP) "awc … parses …"; `transports.test.ts` "awc weather with a separate NOTAM provider builds without a weather credential" and the extended startup-log test (`weatherProvider` + `notamProvider`).
- *METAR and TAF for several aerodromes*: `awc.test.ts` "awc getMetar batches every indicator …", "… keeps the newest report …", "awc getTaf maps raw text and an ISO or Unix issue time".
- *Indicator with no report*: "awc: an indicator missing from the response is no data …"; "awc: HTTP 204 / an empty array / an empty body is no data …".
- *SIGMETs matched by exact FIR*: "awc getSigmet matches the exact firId, carries validity, and marks unknown coverage".
- *Upstream rejects or fails the request*: "awc: HTTP 400/403/429/500/502 throws with no report text …" plus the existing `service.test.ts` structured-error tests.
- *Requests identify the client*: "eval: every awc request carries the application User-Agent".
- Eval, no fabricated time: "eval: awc never emits the current time …"; `toIso` unit test.

**weather-mcp — Separate NOTAM provider**
- *Weather provider without NOTAMs and no NOTAM provider named*: `config.test.ts` (web + MCP) "awc … without a NOTAM provider aborts naming NOTAM_PROVIDER"; `create.test.ts` "createProviders: awc with no NOTAM provider aborts …".
- *NOTAM provider defaults to the weather provider*: MCP `config.test.ts` "an unset NOTAM provider defaults …"; `create.test.ts` "… serves NOTAMs from the same instance"; `service.test.ts` "without a separate NOTAM provider …".
- *NOTAM results name their own provider*: `service.test.ts` "get_notams is served by the NOTAM provider …".
- *Upstream budgets and failures are independent*: `service.test.ts` "an exhausted NOTAM rate budget …", "a failing NOTAM upstream yields a ProviderError naming it …".
- *NOTAM provider named without its credential*: web `config.test.ts` "an avwx NOTAM provider without its token aborts naming AVWX_API_TOKEN".
- Also: `create.test.ts` "ipma/ead abort as not-yet-implemented under their own name …".

**weather-notams-page — Official briefing link on unconfirmed NOTAM sections** (`src/modules/weather/index.test.ts`, full page and fragment)
- *Spanish aerodrome*, *Canary Islands aerodrome*, *Portuguese aerodrome*: "… with unconfirmed NOTAMs links to its official briefing" (LEMD, GCLP, LPPT).
- *Other prefix*: "… outside Spain and Portugal gets no briefing link but keeps the AIS text".
- *Confirmed complete list*: "a confirmed complete NOTAM list gets no briefing link".
- Helper: `briefing.test.ts` (5 tests). Evals: touch target and `rel`; no fetch to official sites; the sample caveat only on the mock NOTAMs beside AWC weather.

**home-dashboard — Official briefing link in the NOTAM attention band** (`src/modules/dashboard/index.test.ts`)
- *Departure aerodrome in Spain*: "… Spanish departure with unconfirmed NOTAMs links to ENAIRE ICARO XXI".
- *Departure aerodrome outside Spain and Portugal*: "… outside Spain and Portugal has no briefing link".
- Also: "… confirmed complete list has no briefing link"; `dashboard/service.test.ts` "home NOTAMs: an unconfirmed list for LEMD carries the ENAIRE briefing …".
