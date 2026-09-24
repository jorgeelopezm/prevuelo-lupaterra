## 1. Config: per-provider credential validation

- [x] 1.1 In `src/platform/config/schema.ts`, replace the AEMET-only `weatherProviderRefine` with a per-provider credential lookup (`aemet` → `AEMET_OPENDATA_API_KEY`, `ipma` → `IPMA_API_KEY`, `ead` → `EAD_API_KEY`, `avwx` → `AVWX_API_TOKEN`; `mock` exempt).
- [x] 1.2 Add `WEATHER_PROVIDER` enum value `avwx` and an optional `AVWX_API_TOKEN` field to both `configSchema` and `mcpConfigSchema` (also added the unused-for-now `IPMA_API_KEY`/`EAD_API_KEY` fields so those providers' credential errors name themselves correctly too).
- [x] 1.3 Extended `src/server/config.test.ts` and `mcp/aviation-weather/src/config.test.ts`: `avwx` without `AVWX_API_TOKEN` aborts naming that variable and explicitly not `AEMET_OPENDATA_API_KEY`; `avwx` with its token parses; existing `aemet` case still passes unchanged (regression-checked, 20/20 config tests green).
- [x] 1.4 Document `AVWX_API_TOKEN` (and `IPMA_API_KEY`/`EAD_API_KEY`) in `.env.example` and the README configuration table.

## 2. AVWX provider adapter

- [x] 2.1 Create `mcp/aviation-weather/src/provider/avwx.ts` implementing `WeatherProvider` (`id: 'avwx'`), using Node's built-in `fetch` with an `Authorization: TOKEN <token>` header and `onfail=error` on every request that supports it.
- [x] 2.2 `getMetar`/`getTaf`: **superseded by 5.1** — originally implemented against `/multi/{metar|taf}/{icaos}` chunked into groups of ≤10 stations; live verification with a real free-tier token found `/multi` returns 403, so this was reworked to one request per station (`/metar/{icao}`, `/taf/{icao}`) in parallel, reassembled into one ordered `entries[]`. A station AVWX returns 400/404 for becomes a `report: null` entry (no-data, not a failure); any other non-2xx still throws.
- [x] 2.3 `getNotams`: call `/notam/{icao}` once per requested ICAO in parallel; map each `data[]` item to `{ id: number, text: body ?? raw, startAt: start_time.dt, endAt: end_time.dt }`.
- [x] 2.4 `getSigmet`: call `/airsigmet` once per invocation (shared across the requested FIR list), filter by requested FIR designator as a word-boundary token match against each advisory's `raw` text.
- [x] 2.5 Provenance: `issuedAt` from AVWX's `time.dt` (METAR/TAF) or `start_time.dt`/`time.dt` (NOTAM/SIGMET); `retrievedAt` = fetch time; `cached: false`, `cacheAgeSeconds: 0`, `sample: false`, `caveat: ''`.
- [x] 2.6 Any non-2xx response or a request exceeding an `AbortController` timeout throws a plain `Error` — no partial/guessed data returned; the tool service's existing `withTimeout`/`ProviderError` wrapping covers the rest.
- [x] 2.7 Wired `avwx` into `createWeatherProvider` (`mcp/aviation-weather/src/provider/create.ts`) and `buildWeatherServer` (`server.ts`, passes `AVWX_API_TOKEN` through).

## 3. Tests

- [x] 3.1 Unit-tested the AVWX provider adapter with `fetch` stubbed (no live network calls): per-station METAR/TAF request shape and order preservation, no-data-not-fabricated for a 400 response (unresolvable station code), per-station NOTAM requests, SIGMET FIR token-matching (match found, no match, and a near-miss substring — `XLECMX` — that correctly does NOT match), provenance field mapping, non-2xx error propagation, plan-gated (403) error message surfacing, and abort-timeout propagation. See `mcp/aviation-weather/src/provider/avwx.test.ts` (8/8 pass).
- [x] 3.2 Added `mcp/aviation-weather/src/provider/create.test.ts` covering `mock`/`avwx` selection, `avwx`'s credential requirement (and that its error names `AVWX_API_TOKEN`, not `AEMET_OPENDATA_API_KEY`), and the still-not-implemented `aemet` case (both without and with its key).
- [x] 3.3 `npm run test:mcp`: 51/51 pass. `tsc --noEmit` (both workspaces) and `eslint src mcp/aviation-weather` are clean. The developer ran `npm run check` themselves (per working agreement rule 3) after the initial implementation — it passed, but `npm run check` doesn't call the real AVWX API (all its tests stub `fetch`), so it could not have caught the 5.1/5.2 findings below.

## 4. Documentation

- [x] 4.1 Updated `README.md`'s configuration table and "MCP server" section: `avwx` is now documented as an implemented, real-data provider, with a note on getting a free token, the mock provider's Iberia-only fixture scope, and (after 5.2) the free-tier plan gating on NOTAM/SIGMET.
- [x] 4.2 No change needed to `AGENTS.md`'s DO-178B-inspired section — `weather-mcp` keeps its existing Tier 1 classification; this change is itself the traceability artifact that rule asks for (proposal → spec delta → tasks → tests, all under `openspec/changes/avwx-weather-provider/`).

## 5. Live verification against a real free-tier token (post-review findings)

`npm run check` passing did not mean the feature worked end to end — it doesn't call the real AVWX API. After the developer set `WEATHER_PROVIDER=avwx` and a real `AVWX_API_TOKEN` in `.env` and confirmed `SUMU` still returned no data through the running web app, two real issues were found and fixed by calling the live API directly:

- [x] 5.1 **`/multi/{report}/{icaos}` returns 403 on a free-tier token** ("must be [a higher] plan"); single-station `/metar/{icao}` and `/taf/{icao}` return 200 with real data on the same token. Reworked `getMetar`/`getTaf` to per-station requests (task 2.2, superseding the original `/multi`-based design). Also verified live: an unresolvable station code (`ZZZZ`) returns AVWX HTTP 400 with a JSON `{ error, help, param }` body, not a 404 — `fetchStation` treats both 400 and 404 as "no data."
- [x] 5.2 **`/notam/{icao}` and `/airsigmet` both return 403 on the free tier** — `/notam` requires the "enterprise" plan, `/airsigmet` requires "pro/enterprise" (both confirmed via AVWX's own `meta.validation_error` message in the live response body). `fetchJson`'s error path now extracts and surfaces that message (`describeError`) instead of just the HTTP status, so a plan-gating failure is self-explanatory in the thrown error rather than a bare "403 Forbidden." Documented in `README.md` and in this file rather than silently working around it — NOTAM/SIGMET remain gated by the developer's actual AVWX plan, which this project has no way to change.
- [x] 5.3 Fixed a related, independently-discovered gap: `mcp/aviation-weather`'s own `start` script never loaded `.env` (only the root web app's `dev`/`start` scripts did), so running the MCP server standalone (`npm run start --workspace ga-mcp-aviation-weather`) ignored `.env` entirely regardless of its contents. Fixed by adding `--env-file-if-exists=../../.env` to that script (verified live: `weatherProvider: "avwx"` now appears in its startup log). This did not affect the web-app-spawns-MCP-as-a-child path (already worked, since the child inherits the parent web app process's env), only standalone MCP usage.
- [x] 5.4 Re-ran the diagnostic end-to-end after the fix: `getMetar(['SUMU'])` through the real `McpWeatherClient` → real spawned MCP server → real AVWX API now returns `{ ok: true, data: { ..., entries: [{ icao: 'SUMU', report: 'SUMU 030000Z 35010KT CAVOK 17/13 Q1009 NOSIG', ... }] } }`.
