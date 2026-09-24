# Proposal

## Why

Two gaps let the weather path tell a pilot something no source actually said, which breaks the Tier 1 no-fabrication rule:

1. **An empty NOTAM or SIGMET list is shown as "none in force".** The weather screen and the home brief print `weather.no_notams` ("Sin NOTAMs activos") and `weather.no_sigmets` whenever the list is empty. But an empty list from AVWX, from the mock for an unseeded indicator, or from a response that has no entry for the requested indicator only means *this provider returned nothing*. For a Spanish or Portuguese aerodrome, AVWX's NOTAM coverage is not confirmed, so the screen can assert "no active NOTAMs" when NOTAMs are in force. The current specs (`weather-notams-page`, `home-dashboard`) actually require that wording for any empty list.
2. **Missing validity times are filled with the current time.** When AVWX omits a NOTAM's or SIGMET's start or end time, the provider substitutes `new Date()`. For SIGMETs it also substitutes the issue time as the start time. A NOTAM with no stated end then looks like it expires right now.

## What Changes

- Every NOTAM report (per aerodrome) and SIGMET report (per FIR) returned by the MCP tools carries a **coverage** marking: `complete` means the provider asserts the list is the full set in force, so an empty list means none in force; `unknown` means the provider cannot assert that.
- The AVWX provider always reports `unknown` coverage for NOTAMs and SIGMETs. The mock reports `complete` only for its seeded indicators and FIRs, and `unknown` otherwise.
- **BREAKING (MCP result shape):** NOTAM and SIGMET `startAt`/`endAt` become nullable. A provider that has no validity time returns `null`, never a substituted time.
- The weather screen and the home NOTAM band:
  - show "no NOTAMs / SIGMETs in force" **only** for an empty list with `complete` coverage;
  - for an empty list with `unknown` coverage (or a missing coverage field, or no entry for the requested indicator), show a localized "the provider returned no NOTAMs; this does not confirm none are in force — check the official AIS" state;
  - show the provenance line on the empty states too, so the pilot can see which provider returned nothing;
  - render each NOTAM's and SIGMET's validity window in UTC, with a localized "not stated" where the provider gave none.
- New catalog keys in `es`, `pt`, `en` for the unconfirmed-empty states and "not stated".

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `weather-mcp`: adds a requirement that NOTAM/SIGMET results state their coverage and never substitute missing validity times.
- `weather-notams-page`: "METAR, TAF, and NOTAM rendering with provenance" changes so an empty list shows "none in force" only when coverage is complete. Adds SIGMET/NOTAM validity rendering.
- `home-dashboard`: "Weather and NOTAM values on the brief carry provenance" changes in the same way for the NOTAM band.

## Impact

- **Tier:** Tier 1 (safety-adjacent advisory: weather/NOTAM retrieval and display). Requirements-based tests are expected for every scenario.
- **Prerequisite:** `weather-notams-page` and `home-dashboard` exist so far only as deltas in the unarchived `meteorologia-page` and `inicio-page` changes. Those two changes (and `avwx-weather-provider`) must be archived before this one, so the MODIFIED requirements have a main spec to apply to.
- **Affected code:** `mcp/aviation-weather/src/provider/{types,avwx,mock}.ts`, `src/platform/weather-mcp/types.ts`, `src/modules/weather/service.ts`, `src/modules/dashboard/{service,types}.ts`, `src/views/pages/weather.njk`, `src/views/partials/home-weather.njk`, `src/platform/i18n/catalogs/{es,pt,en}.json`, and the matching tests.
- **Out of scope:** adding a new NOTAM provider (FAA NOTAM API) or the AWC weather provider; those are separate changes that will each declare their own coverage.
