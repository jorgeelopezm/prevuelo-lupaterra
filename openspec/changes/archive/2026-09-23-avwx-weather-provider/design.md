## Context

`mcp/aviation-weather`'s provider seam (`src/provider/types.ts`) is already provider-agnostic: `WeatherToolService` obtains data solely through a `WeatherProvider` (`getMetar`/`getTaf`/`getNotams`/`getSigmet`), and `createWeatherProvider` (`src/provider/create.ts`) selects the implementation from `WEATHER_PROVIDER`. Only `mock` is implemented today; `aemet`/`ipma`/`ead` are named but throw "not implemented yet." The shared config schema's `weatherProviderRefine` currently requires `AEMET_OPENDATA_API_KEY` for *any* non-mock provider — a bug once a second named provider exists.

AVWX (`https://avwx.rest/api`, source verified live via its public `apiary.apib` blueprint at `github.com/avwx-rest/avwx-api`) is a free-tier, globally-scoped REST API for METAR, TAF, NOTAM, and AIR/SIGMET, authenticated with a bearer token (`Authorization: TOKEN <token>` or `BEARER <token>`).

## Goals / Non-Goals

**Goals:**
- Let `WEATHER_PROVIDER=avwx` serve real METAR/TAF/NOTAM/SIGMET for any ICAO station worldwide (unblocks the reported `SUMU` gap).
- Fix provider-credential validation so it is correct for more than one named provider.
- Preserve every existing contract: provenance fields, cache/rate-limit/timeout wrapping in `WeatherToolService`, and the no-fabrication rule on failure.

**Non-Goals:**
- Implementing AEMET/IPMA/EAD — still deferred.
- Solving global NOTAM/SIGMET coverage perfectly — AVWX's own coverage and its lack of a native FIR filter are inherent to the data source, not this change.
- Changing the web app beyond the shared config schema — `src/platform/weather-mcp/client.ts` already treats the provider as an opaque MCP tool implementation detail.

## Decisions

**1. HTTP client: Node 22's built-in `fetch`, no new dependency.**
`mcp/aviation-weather` targets Node `^22.0.0` (global `fetch`/`AbortController` available). Alternative considered: add `undici` or `axios` directly — rejected, no capability `fetch` lacks here (JSON GET requests, bearer header, timeout via `AbortController`).

**2. Batch METAR/TAF via AVWX's `/multi/{report}/{icaos}` endpoint, chunked to AVWX's 10-station-per-call limit.**
Our tool schema (`icaoListSchema`) allows up to 20 indicators per call; AVWX's multi-station endpoint caps at 10. The provider chunks the requested list into groups of ≤10, issues one request per chunk (in parallel), and merges the keyed-by-station responses back into one ordered `entries[]` array matching the requested order — the caller never sees the chunking. A station AVWX has no data for (or that 404s) becomes a `report: null` entry, per the existing no-data contract; it does not fail the whole batch.

**3. NOTAM: one AVWX request per ICAO (`/notam/{icao}`), run in parallel.**
AVWX has no batched NOTAM endpoint. `Promise.all` over the requested ICAOs keeps this within the tool service's single configured timeout (each per-station fetch also carries its own `AbortController` timeout so one slow station cannot silently exceed the overall budget unnoticed — though the overall `withTimeout` wrapper in `WeatherToolService` is still the authoritative deadline).

**4. SIGMET: fetch the global `/airsigmet` list once, filter client-side by FIR-code text match, not fabricate a false negative or positive.**
AVWX's `/airsigmet` endpoint returns *all* global AIRMET/SIGMET advisories with no station/FIR query parameter — real SIGMET messages conventionally begin with their issuing FIR's ICAO code in the raw text (matching our own mock fixtures, e.g. `"LECM SIGMET 3 VALID ..."`). The provider filters the full list to advisories whose `raw` text contains the requested FIR code as a leading token. This is a **best-effort text match**, not a guaranteed-correct FIR lookup — documented in code and in the modified spec's scenario. An empty result means "no match found," which is indistinguishable from "genuinely none in force" — both render as the existing "no SIGMET in force" state, never fabricated content, so the honesty contract holds either way.

**5. Every AVWX result is provenance-complete and explicitly `sample: false`.**
`issuedAt` comes from AVWX's `time.dt` (METAR/TAF) or `start_time.dt`/`time.dt` (NOTAM/SIGMET); `retrievedAt` is the fetch time; `cached`/`cacheAgeSeconds` are always `false`/`0` at the provider layer — the *service* layer's own `ResponseCache` (unchanged) is what marks `cached: true` on a repeat call within the TTL. `sample` is `false` and `caveat` is an empty string, distinguishing real AVWX data from the mock provider's explicit sample-data caveat — both are still schema-required provenance fields, so nothing about the provenance contract changes for callers.

**6. Failure mapping stays inside the existing tool-service contract — the provider throws, it never returns partial/guessed data.**
A non-2xx HTTP response, a JSON parse failure, or a request that exceeds the provider's own `AbortController` timeout throws a plain `Error` from the provider method. `WeatherToolService.withTimeout` already converts any thrown error into the existing `ProviderTimeoutError` (on the service's own timeout race) or `ProviderError` (everything else) — the provider adapter does not need its own error-mapping types.

**7. Per-provider credential validation replaces the AEMET-only check.**
`weatherProviderRefine` becomes a lookup: `{ aemet: 'AEMET_OPENDATA_API_KEY', ipma: 'IPMA_API_KEY', ead: 'EAD_API_KEY', avwx: 'AVWX_API_TOKEN' }` (mock exempt). Only `avwx` and `mock` are actually constructible after this change; `aemet`/`ipma`/`ead` still validate their (still-unused) credential shape and then hit `createWeatherProvider`'s existing "not implemented yet" error — unchanged behavior, now with correct-for-them credential naming.

## Risks / Trade-offs

- **[Risk] AVWX free tier has undocumented-here rate limits.** → Mitigation: the existing `RateLimiter`/`MCP_RATE_LIMIT_PER_MINUTE` ceiling already exists in front of any provider; operators running `avwx` in production should set it conservatively and consult AVWX's account dashboard for their plan's actual ceiling.
- **[Risk] The FIR text-match heuristic for SIGMET can miss advisories whose raw text doesn't lead with the FIR code, or (rarely) match a FIR code that appears incidentally elsewhere in another FIR's advisory text.** → Mitigation: documented as best-effort in code and spec; matching on a word-boundary-bounded FIR code token (not a bare substring) minimizes false positives; this is materially better than the current "always empty outside the three mock FIRs" state.
- **[Risk] `onfail` defaults to `cache` on AVWX's side (silently serving stale data on an upstream hiccup) unless explicitly overridden.** → Mitigation: every request passes `onfail=error` explicitly, so an AVWX-side failure surfaces as an HTTP error we map honestly, rather than silently-stale data mislabeled as fresh.
- **[Trade-off] NOTAM fetches are N parallel HTTP calls (one per ICAO), not one batched call** — acceptable because `get_notams` requests are typically small (a handful of aerodromes for one flight) and AVWX offers no batched alternative.

## Migration Plan

1. Fix `weatherProviderRefine` to per-provider credentials (safe on its own — `mock` and `aemet` behavior unchanged, `avwx` newly validates its own key name).
2. Add the `avwx` provider adapter and wire it into `createWeatherProvider`.
3. Document `AVWX_API_TOKEN` in `.env.example` and the README's configuration table.
4. No data migration; no change to the tool schemas, the web app, or existing mock-provider behavior. Rollback is reverting `WEATHER_PROVIDER` to `mock` (the default) — no state to unwind.

## Open Questions

- Should the SIGMET FIR match also accept the FIR appearing in AVWX's `area`/`region`/`issuer` fields (seen on US-issued AIRMETs) rather than only the raw text? Left as raw-text-only for this change since our own mock fixtures and real-world SIGMET convention both lead with the FIR in the raw message; revisit if AVWX SIGMET results for a requested FIR come back empty in practice more often than expected.
