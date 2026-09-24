# Tasks

## 0. Prerequisite

- [x] 0.1 Archive `avwx-weather-provider`, `meteorologia-page`, and `inicio-page` (developer-authorized; `inicio-page` still has task 7.15 open) so `openspec/specs/weather-notams-page/` and `openspec/specs/home-dashboard/` exist. Verify with `openspec list --specs` showing both capabilities. Done 2026-09-23: all three archived (meteorologia-page after its stale feature-scaffolding delta was replaced with the current main block); both specs present.

## 1. MCP result shape

- [x] 1.1 In `mcp/aviation-weather/src/provider/types.ts`, add `coverage: 'complete' | 'unknown'` to `NotamReport` and `SigmetReport`, and make `startAt`/`endAt` `string | null` on `NotamEntry` and `SigmetEntry`, with doc comments stating what each value means. Verify with the MCP workspace typecheck (errors expected only in the providers updated in group 2).

## 2. Providers

- [x] 2.1 AVWX `getNotams`/`getSigmet` (`provider/avwx.ts`): map a missing `start_time.dt`/`end_time.dt` to `null` (drop the `new Date()` and `r.time?.dt` fallbacks) and set `coverage: 'unknown'` on every report. Verify with new `avwx.test.ts` tests: *omits end of validity → null*, *omits start of validity even with an issue time → null*, *states both times → unchanged*, *empty and non-empty NOTAM/SIGMET reports are `unknown`*.
- [x] 2.2 Mock `getNotams`/`getSigmet` (`provider/mock.ts`): `coverage: 'complete'` for seeded ICAOs and FIRs, `'unknown'` otherwise. Verify with `mock.test.ts` tests: *seeded indicator → complete*, *unseeded indicator → empty + unknown*, *seeded FIR → complete*.
- [x] 2.3 Verify the tool path carries the fields unchanged: add a `tools/service.test.ts` or `server.test.ts` case asserting that `get_notams` output includes `coverage`, and that `null` validity serializes as JSON `null`, including on a cache hit.

## 3. Web data path

- [x] 3.1 Mirror the shape in `src/platform/weather-mcp/types.ts` (`coverage` optional on the web side, times `string | null`). Add one `isConfirmedEmpty(report)` helper that returns true only for an empty list with `coverage === 'complete'`. Verify with unit tests: *complete + empty → true*, *unknown + empty → false*, *absent coverage + empty → false*, *complete + non-empty → false*.
- [x] 3.2 Replace the missing-entry fallbacks in `src/modules/weather/service.ts` (~line 112) and `src/modules/dashboard/service.ts` (`findNotams`, ~line 547) with an explicit `unknown` report, and expose the coverage/confirmed-empty state in the view models (`dashboard/types.ts`). Verify with `dashboard/service.test.ts`: *result without an entry for the departure ICAO → unknown, not confirmed-empty*.
- [x] 3.3 Make `intlUtcDateTime` (`src/server/views/views.ts:71`) throw on `null`/`undefined` instead of formatting the epoch. Verify with a unit test: *null → throws*, *ISO string → formatted*.

## 4. Templates and catalogs

- [x] 4.1 Add catalog keys in `es`, `pt`, `en`: `weather.notams_unconfirmed_empty`, `weather.sigmets_unconfirmed_empty` (the provider returned none, which does not confirm none are in force; check the official AIS), `weather.validity_label`, and `weather.validity_not_stated`. Verify with `catalog.test.ts` key parity across locales.
- [x] 4.2 `src/views/pages/weather.njk`: NOTAM and SIGMET sections branch on confirmed-empty vs unconfirmed-empty, both render `provenanceLine`, and each entry shows its validity window (`intlUtcDateTime`, or `weather.validity_not_stated` for null). Verify with the render tests in task 5.1.
- [x] 4.3 `src/views/partials/home-weather.njk`: same branching and validity rendering for the NOTAM band, reusing the same macros. Verify with the render tests in task 5.2.

## 5. Tests: scenario traceability (Tier 1)

- [x] 5.1 Weather screen (`src/modules/modules.test.ts` or a weather render test), one named test per scenario. *Happy:* NOTAMs listed with identifier, text, validity; confirmed-empty NOTAM list shows "no active NOTAMs" plus provenance; SIGMETs listed with validity. *Sad:* unknown-coverage empty list shows the unconfirmed-empty text plus provenance and **not** the "no active NOTAMs" string; absent coverage is treated the same; no entry for the requested ICAO is treated the same; SIGMET unconfirmed-empty; null validity shows "not stated" and no `1970`. Check both the full page and the `HX-Request` fragment.
- [x] 5.2 Home brief (`src/modules/dashboard/index.test.ts`): *happy:* NOTAMs with validity plus provenance; confirmed-empty with provenance, distinguishable from the failure state. *Sad:* unconfirmed-empty (unknown, absent, missing entry) never states "no NOTAMs in force"; null validity shows "not stated".
- [x] 5.3 Evals: for every locale, the `weather.no_notams` and `weather.no_sigmets` catalog strings never appear in a render whose report is not `complete`; no rendered page contains a validity time the fixture did not carry, including `1970`; and the mock-data caveat still appears on mock results in both empty states.

## 6. Verification gate

- [x] 6.1 Record, per spec scenario (`weather-mcp`, `weather-notams-page`, `home-dashboard`), which test verifies it (the `meteorologia-page` group 7 pattern).

  **weather-mcp**
  - *Provider without authoritative coverage*: `avwx.test.ts` "getNotams marks every report unknown coverage…" and "getSigmet returns null validity…" (asserts `unknown` on matched and unmatched FIRs).
  - *Mock seeded indicator*: `mock.test.ts` "mock seeded aerodromes report complete NOTAM coverage…" and "mock seeded FIR reports complete SIGMET coverage…".
  - *Mock unseeded indicator*: `mock.test.ts` "mock unseeded aerodrome reports an empty list with unknown coverage…".
  - *Provider omits the end of validity* / *omits the start of validity*: `avwx.test.ts` "getNotams returns null validity when AVWX omits it…" and "getSigmet returns null validity… the issue time is not substituted…"; the wire shape, fresh and cached: `server.test.ts` "get_notams carries coverage and serializes unstated validity as JSON null…".
  - *Provider states both times*: `avwx.test.ts` "getNotams returns null validity…" (stated start is unchanged) and "getSigmet matches the requested FIR as a whole token…" (stated start and end are unchanged).

  **weather-notams-page** (`src/modules/weather/index.test.ts`, every case for both the full page and the htmx fragment)
  - *FIR lookup for SIGMET*: "SIGMETs are listed with their validity window", "a confirmed-empty SIGMET list states none in force", "an unknown-coverage empty SIGMET list is unconfirmed…".
  - *NOTAMs listed per aerodrome*: "NOTAMs are listed with identifier, text, and UTC validity window".
  - *Confirmed empty NOTAM list*: "a confirmed-empty NOTAM list states none are active, with provenance".
  - *Unconfirmed empty NOTAM list*: "an unknown-coverage empty NOTAM list is unconfirmed…", "…absent coverage is treated as unconfirmed", "no NOTAM entry for the requested indicator is treated as unconfirmed"; the rule itself: `coverage.test.ts` (4 tests).
  - *Validity not stated*: "unstated NOTAM validity renders 'not stated' and no fabricated time"; `filters.test.ts` (null and undefined throw rather than formatting 1970).
  - Unchanged scenarios (lookups, invalid ICAO, bookmarkable URLs, METAR/TAF, unknown aerodrome) are still covered by the `meteorologia-page` tests, which pass.
  - Evals: "eval (<locale>): 'none in force' text never renders for a report without complete coverage" and "eval (<locale>): the mock-data caveat still renders on both empty states", for es, pt, and en.

  **home-dashboard**
  - *NOTAMs listed with provenance*: `dashboard/index.test.ts` "the home NOTAM band lists NOTAMs with their validity window and provenance".
  - *No NOTAMs is distinct from a failed retrieval*: "the weather fragment renders METAR and NOTAMs with provenance" (stub now `complete`) plus the existing per-error-kind failure tests.
  - *Unconfirmed empty NOTAM list on the brief*: "the home NOTAM band never states 'no NOTAMs in force'…" for unknown, absent, and missing-entry cases; `dashboard/service.test.ts` "home NOTAMs: …" (4 tests).
  - *METAR summary with provenance*, *Mock-provider caveat carried through*: the existing `inicio-page` tests, which pass.
  - Null validity on the brief: "the home NOTAM band renders unstated validity as 'not stated'…".
- [x] 6.2 Propose `npm run check` and `openspec validate notam-sigmet-no-fabrication --strict` for the developer to authorize (working agreement rule 3); both must be green before archiving. Run by the developer on 2026-09-23: `npx prettier --write src mcp/aviation-weather/src`, `npm run check`, and `openspec validate notam-sigmet-no-fabrication --strict`, all with no errors.
  **Correction (2026-09-23, later the same day):** this record was premature. The gate was not green at that point. `tsc` failed on a `WeatherMcpError` stub missing `message` in `dashboard/service.test.ts`, and `catalog.test.ts` still pinned 548 keys after this change added 4. Both were fixed afterwards, along with the related provenance `issuedAt` substitutions in `avwx.ts` (`latestIssuedAt`, NOTAM, SIGMET). The developer then ran `npm run check`, which was green: 476 web tests and 68 MCP tests pass.
- [x] 6.3 Manually verify with `WEATHER_PROVIDER=mock`: `/es/meteorologia?icao=LEMD` (confirmed list), `?icao=SUMU` (unconfirmed-empty, not "Sin NOTAMs activos"), `?fir=LECM`; and with `WEATHER_PROVIDER=avwx` if a token is available: `?icao=LEMD` shows either real NOTAMs with validity or the unconfirmed-empty state. Verified manually by the developer on 2026-09-23.
