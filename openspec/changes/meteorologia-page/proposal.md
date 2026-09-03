## Why

The `/meteorologia` destination (`weather` module) is currently a shared placeholder screen: it renders "not yet available" in every locale and shows no operational-looking values, per the feature-scaffolding placeholder contract. The standalone weather MCP server (`mcp/aviation-weather`) is fully implemented and tested — it exposes `get_metar`, `get_taf`, `get_notams`, `get_sigmet`, and `decode_metar` over stdio/HTTP behind a mock provider — but nothing in the web application calls it. Pilots have no page to check current weather and NOTAMs for their route. This change connects the web app to the MCP server and replaces the placeholder with a real screen.

## What Changes

- Add an MCP client seam in the web app (`src/platform/weather-mcp/`) that connects to the `aviation-weather` MCP server over stdio (spawned as a child process, matching `MCP_TRANSPORT`) and calls its tools with a timeout and structured error mapping.
- Replace `weatherModule`'s placeholder registration with real routes: an aerodrome-search/selection view and a results view rendering METAR, TAF, NOTAMs, and (optionally) SIGMET for one or more ICAO indicators, localized to `es`/`en`/`pt`.
- Render every result with its provenance (provider, issued/observed time, retrieved time) and mock-data caveat, and mark cached results as cached — surfacing the MCP server's existing provenance/staleness contract in the UI rather than re-deriving it.
- Handle upstream failure and validation-error tool responses with a localized, non-fabricated error state per requested indicator (unknown aerodrome, timeout, malformed ICAO).
- Add `decode_metar` as an inline plain-language explanation alongside each raw METAR, in the viewer's locale.
- Wire MCP client configuration (server command/URL, timeout) into `AppConfig` and `ModuleContext`, following the existing `EmbeddingProvider` seam pattern.
- Add htmx fragment routes for the aerodrome search/results interaction, consistent with the shell's existing fragment-swap navigation.

## Capabilities

### New Capabilities
- `weather-notams-page`: the `/meteorologia` (and locale-equivalent) screen — aerodrome selection, and rendering of METAR/TAF/NOTAM/SIGMET/decoded results with provenance, caching, and error states, sourced from the weather MCP server.

### Modified Capabilities
- `feature-scaffolding`: the `weather` module's `register` callback no longer uses `registerPlaceholderScreen`; it registers the real weather screen instead. (No requirement text changes to other placeholder modules.)

## Impact

- **Affected code**: `src/modules/weather/index.ts` (placeholder → real registration), `src/modules/types.ts` (`ModuleContext` gains an MCP client), `src/server/app.ts` (construct and inject the client), `src/platform/config/schema.ts` (client-side MCP connection config, if not already sufficient), new `src/platform/weather-mcp/` client module, new views/templates and i18n catalog keys for the weather screen.
- **Dependencies**: web app process gains a runtime dependency on `@modelcontextprotocol/sdk` (client side) and spawns/connects to `mcp/aviation-weather` at startup or on first request.
- **Out of scope**: implementing a real (non-mock) weather provider (AEMET/IPMA/EAD) — this change only consumes the existing mock-backed MCP server through the web UI.
