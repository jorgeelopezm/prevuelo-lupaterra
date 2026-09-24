# Proposal

## Why

The weather MCP result's provenance time (`issuedAt`) was always a string, so the AVWX provider filled it in when it had nothing to report. Three places used the current time: METAR/TAF results where no station returned a report, every NOTAM result, and every SIGMET result. The weather screen then showed "Emitido: <now>", an issue time no source ever stated. The `weather-mcp` requirement "Provenance and staleness on every result" demands an issue time on every result, which pushed providers toward inventing one.

## What Changes

- **BREAKING (MCP result shape):** `issuedAt` becomes `string | null`. It is `null` when no report in the result carries a time, and it is never replaced by the retrieval time or the current time.
- For a batched METAR/TAF result, `issuedAt` is the **latest** time across its reports. Previously it was the first station's time.
- AVWX NOTAM results report `null` (the NOTAM fields the provider reads carry no issue time). AVWX SIGMET results report the latest issue time among the matched advisories, or `null`.
- The weather screen and the home brief render a `null` provenance time as the localized "not stated".

Already implemented and verified under `notam-sigmet-no-fabrication` follow-ups. This change records the requirement.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `weather-mcp`: "Provenance and staleness on every result" allows a null issue time and forbids substituting one.
- `weather-notams-page`: adds a requirement that an unstated provenance time is shown as "not stated".

## Impact

- **Tier:** Tier 1 (weather retrieval and display).
- **Code (already landed):** `mcp/aviation-weather/src/provider/{types,avwx}.ts`, `src/platform/weather-mcp/types.ts`, `src/views/pages/weather.njk`, `src/views/partials/home-weather.njk`, plus tests in `avwx.test.ts` and `src/modules/weather/index.test.ts`.
