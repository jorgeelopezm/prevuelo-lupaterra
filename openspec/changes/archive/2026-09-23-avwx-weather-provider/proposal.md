## Why

The MCP server's only implemented weather provider is `mock`, which carries fixture data for four Iberian aerodromes (LEMD, LEBL, LPPT, LPPR) and three Iberian FIRs (LECM, LECB, LPPC). Any other ICAO indicator — e.g. `SUMU` (Montevideo/Carrasco, Uruguay) — correctly returns a "no data" entry per the no-fabrication contract, but this reads as "the MCP is broken" to a pilot outside Iberia. `WEATHER_PROVIDER` already names `aemet`/`ipma`/`ead` as future providers, but all three are Iberia/Europe-scoped and would not help. This change adds a real, globally-scoped provider (AVWX) so METAR/TAF/NOTAM/SIGMET work for any ICAO station worldwide, not just the four seeded ones.

## What Changes

- Add `avwx` as a selectable `WEATHER_PROVIDER` value, backed by the AVWX REST API (`https://avwx.rest/api`), which requires a free-tier bearer token (`AVWX_API_TOKEN`).
- Generalize the provider-credential validation in `src/platform/config/schema.ts`: today *any* non-mock provider requires `AEMET_OPENDATA_API_KEY`, which is wrong for a non-AEMET provider. Each named provider now validates against its own credential variable.
- Implement `mcp/aviation-weather/src/provider/avwx.ts`: `getMetar`/`getTaf` via AVWX's batched `/multi/{report}/{icaos}` endpoint (chunked into groups of ≤10 — AVWX's per-call station limit), `getNotams` via `/notam/{icao}` per station, `getSigmet` via the global `/airsigmet` list filtered by FIR-code text match against each advisory's raw message (AVWX has no native FIR filter — documented as a best-effort match, never fabricated).
- Every AVWX-backed result still carries the existing provenance contract (provider id, issued/observed time, retrieval time, cache flag) and is marked `sample: false` (this is real operational-adjacent data, not mock fixture data) — the mock provider remains the only source explicitly labeled as sample data.
- Upstream failures (bad token, unknown station, network/timeout, rate limit) surface as the existing structured `ProviderTimeoutError`/`ProviderError`, never substituted content — reusing the tool service's existing timeout/error wrapping.

## Capabilities

### New Capabilities
(none — this only extends the existing provider seam)

### Modified Capabilities
- `weather-mcp`: the "Provider interface with a mock default" requirement gains a real, globally-scoped provider (`avwx`) alongside the existing mock default; provider-credential validation becomes per-provider instead of AEMET-only.

## Impact

- **Affected code**: `src/platform/config/schema.ts` (web app + MCP shared schema), `.env.example`, `mcp/aviation-weather/src/provider/avwx.ts` (new), `mcp/aviation-weather/src/provider/create.ts`, `mcp/aviation-weather/package.json` (no new dependency — uses Node 22's built-in `fetch`).
- **External dependency**: an AVWX account/API token (free tier) is required to select `WEATHER_PROVIDER=avwx`; `mock` remains the default and requires nothing.
- **Out of scope**: AEMET/IPMA/EAD remain unimplemented (`createWeatherProvider` still rejects them with "not implemented yet"); no change to the web app beyond the shared config schema — the weather MCP client and `/meteorologia` screen are provider-agnostic already.
