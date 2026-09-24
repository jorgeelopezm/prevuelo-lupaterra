# Proposal

## Why

Today the only real weather source is AVWX, which needs an account token. The aviationweather.gov Data API (NOAA Aviation Weather Center, "AWC") is free, needs no key, and covers METAR and TAF worldwide, including Spain and Portugal. Its international SIGMET feed labels each advisory with an exact FIR identifier (`firId`), which is more precise than the text matching the AVWX provider has to do. AWC has no NOTAMs, and the EAD / NM B2B research (scaffold-ga-core task 11.2) found no free, redistributable NOTAM source for Spain or Portugal. So NOTAMs stay with AVWX, and the NOTAM notices point pilots to the official briefing.

## What Changes

- Add `awc` as a `WEATHER_PROVIDER` value. It needs no credential and serves `get_metar`, `get_taf`, and `get_sigmet` from `https://aviationweather.gov/api/data/{metar,taf,isigmet}`.
- Add a **separate NOTAM provider** setting, `NOTAM_PROVIDER` (`mock` | `avwx`).
  - It defaults to `WEATHER_PROVIDER` when that provider supplies NOTAMs (`mock`, `avwx`).
  - `WEATHER_PROVIDER=awc` **requires** `NOTAM_PROVIDER` to be set. If it is missing, startup aborts naming the variable, so a pilot never gets sample NOTAMs next to real weather without having chosen that.
- The rate ceiling, timeout, and error naming apply **per upstream**. A NOTAM failure names `avwx`, a METAR failure names `awc`, and the two upstreams share no rate budget.
- AWC SIGMET reports are matched by exact `firId` and carry `unknown` coverage. The feed is an aggregation that does not vouch for completeness.
- Every AWC request sends a custom `User-Agent` (AWC's guidance). HTTP 204 is treated as "no data". 400/403/429/5xx become structured errors with no report text.
- NOTAM notices whose list is not confirmed complete **link to the official briefing** by ICAO prefix: `LE`/`GC` → ENAIRE ICARO XXI, `LP` → NAV Portugal AIS. Any other prefix gets no link. The link is plain; nothing is fetched or scraped. This applies to both the weather screen and the home brief.
- Out of scope: PIREPs (a new tool and UI section; a follow-up change), and any AWC endpoint beyond METAR, TAF, and international SIGMET.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `weather-mcp`: adds the keyless AWC provider and the separate NOTAM provider with per-upstream limits and errors.
- `weather-notams-page`: adds the official-briefing link on NOTAM notices not confirmed complete.
- `home-dashboard`: the same link in the NOTAM attention band.

## Impact

- **Tier:** Tier 1 (weather/NOTAM retrieval and display). Requirements-based tests are required for every scenario.
- **Code:**
  - `src/platform/config/schema.ts`: the `awc` enum value, `NOTAM_PROVIDER`, and cross-field validation.
  - `.env.example`.
  - `mcp/aviation-weather/src/provider/awc.ts` (new) and `provider/create.ts`.
  - `mcp/aviation-weather/src/tools/service.ts`: per-upstream IDs.
  - `mcp/aviation-weather/src/index.ts`: startup log names both providers.
  - A new ICAO-prefix → briefing-link helper in `src/platform/weather-mcp/`.
  - `src/views/partials/weather-results.njk`, `weather.njk`, `home-weather.njk`, and catalog keys in `es`/`pt`/`en`.
- **External dependency:** none new, and no account. The code uses Node's built-in `fetch`. AWC asks clients to stay under 100 requests per minute, and the existing per-provider rate ceiling (default 30 per minute) is below that.
- **Dependency on other changes:** `provenance-issued-at-nullable` (AWC results can have no report, hence a null `issuedAt`) should be archived first. It is ready.
