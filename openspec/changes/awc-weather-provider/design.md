# Design

## Context

See proposal.md for why.

- **Provider selection.** One `WeatherProvider` is chosen by `createWeatherProvider` (`mcp/aviation-weather/src/provider/create.ts`).
- **Tool service.** `WeatherToolService` holds that one provider and uses its `id` for the rate limiter, the timeout error, and the provider error (`tools/service.ts`). A two-upstream setup breaks all three, so this is the main structural change.
- **Config.** Shared by both runtimes through `src/platform/config/schema.ts`. `weatherProviderRefine` checks credentials per provider.
- **AWC Data API facts** (checked 2026-09-23 against the published OpenAPI schema):
  - No key; 100 requests per minute; at most 400 entries per response; a custom User-Agent is recommended; 204 means no content.
  - METAR JSON: `icaoId`, `rawOb`, `obsTime` (Unix seconds).
  - TAF JSON: `icaoId`, `rawTAF`, `issueTime`, `validTimeFrom`, `validTimeTo`.
  - International SIGMET (`/api/data/isigmet`) JSON: `firId`, `firName`, `rawSigmet`, `validTimeFrom`, `validTimeTo`. It takes no FIR/ids filter, so it returns the global list.

## Goals / Non-Goals

**Goals:** a keyless, worldwide METAR/TAF/SIGMET source that follows every existing no-fabrication rule; NOTAMs from a separately chosen provider; a free, honest path to authoritative NOTAMs (a link) for Spain and Portugal.

**Non-Goals:** PIREPs; G-AIRMET/CWA (US-only); a NOTAM source other than `mock`/`avwx`; fetching anything from ENAIRE or NAV Portugal.

## Decisions

1. **The NOTAM provider is chosen separately, not as a hidden fallback.** `NOTAM_PROVIDER ∈ {mock, avwx}`.
   - It defaults to `WEATHER_PROVIDER` when that is `mock` or `avwx`.
   - With `awc` it is required: the schema's refine step aborts naming `NOTAM_PROVIDER`.
   - *Alternative:* silently default to `mock`. Rejected, because sample NOTAMs next to real weather is exactly the mix the standing rules guard against. Even though they are labeled as sample, a confirmed-empty sample list for LPPT would read "Sin NOTAMs activos" beside a real METAR.
2. **A routing provider plus per-upstream IDs in the tool service.** `createWeatherProvider` returns `{ weather, notams }`, two `WeatherProvider` instances, which may be the same object. `WeatherToolService` takes both and uses `notams.id` for `get_notams` and `weather.id` for everything else, in the rate limiter key, in `ProviderTimeoutError`/`ProviderError`, and in the cache key prefix.
   - *Alternative:* a composite `WeatherProvider` with id `awc+avwx`. Rejected, because one shared rate budget and an error naming neither real upstream both break the new requirement.
3. **AWC client shape.**
   - One batched request per tool call: `ids=` a comma list, `format=json`. The indicators are already validated as 4-character ICAO by the tool schemas, and the tool input cap keeps this far below 400 entries.
   - Entries are mapped back to request order. A missing indicator becomes a no-data entry.
   - HTTP 204 or an empty array means every indicator has no data.
   - Other non-2xx responses throw, and the service turns that into a structured error.
   - Every request carries `User-Agent: ga-core-mcp-aviation-weather/<package version>` and uses the existing abort timeout.
4. **Time normalization.**
   - `obsTime`, `validTimeFrom`, and `validTimeTo` are Unix seconds and become ISO 8601.
   - `issueTime` is accepted as either Unix seconds or an ISO string, because the schema does not pin its type.
   - A missing or unparseable value becomes `null`, never now.
   - The provenance `issuedAt` is the latest of the entries' times, or `null` (`provenance-issued-at-nullable`).
5. **SIGMETs: one global fetch, an exact `firId` match, `unknown` coverage.** The `firId` match replaces the AVWX text heuristic. It is still `unknown` because an aggregator feed does not vouch that every issuing office's SIGMET is present.
6. **Briefing link helper on the web side.** `officialBriefingFor(icao)` lives in `src/platform/weather-mcp/briefing.ts`. It returns `{ labelKey, href }` or `null`, from a static prefix table: `LE`, `GC` → `https://notampib.enaire.es/icaro`; `LP` → `https://ais.nav.pt`.
   - Both services attach it to the NOTAM view model only when the list is not confirmed complete, which reuses `isConfirmedEmpty`'s sibling rule (`coverage !== 'complete'`). A template can then never show the link by mistake next to a confirmed list.
   - The link is rendered by one shared macro with `touch-target`, `rel="noopener noreferrer"`, and `target="_blank"`.

## Risks / Trade-offs

- [The AWC JSON shape changes] → Field access is centralized in `awc.ts`. Fixture tests pin the fields used. A missing field gives no data or a null time, never a crash that shows a fabricated value.
- [The AWC international SIGMET feed misses a SIGMET] → The `unknown` coverage marking and the unconfirmed-empty text already say so.
- [An official briefing URL moves] → The table is one small module with a test per prefix. A dead link is a navigation failure, not wrong data.
- [An operator sets `WEATHER_PROVIDER=awc` without an AVWX token] → They must set `NOTAM_PROVIDER=mock` explicitly. The NOTAMs are then labeled as sample and marked `complete` only for the seeded fixtures. This is documented in `.env.example`.

## Migration Plan

This change is additive. Existing `mock`/`avwx` configurations behave exactly as before, because `NOTAM_PROVIDER` defaults to the weather provider. Rollback is removing `awc` from the environment.

## Open Questions

- Should the ICARO link deep-link to a PIB query for the aerodrome? It is left as the public entry page until a stable URL pattern is confirmed. That would change only the helper's table, not the specs.
