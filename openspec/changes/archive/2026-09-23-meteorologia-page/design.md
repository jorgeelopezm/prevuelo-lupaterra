## Context

`mcp/aviation-weather` is a fully implemented, independently-tested standalone MCP server: it exposes `get_metar`, `get_taf`, `get_notams`, `get_sigmet`, `decode_metar` over stdio and Streamable HTTP, backed by a mock provider by default, with caching, a per-provider rate ceiling, provenance/staleness fields, and structured no-fabrication failure handling (`openspec/specs/weather-mcp/spec.md`). It runs as a separate Node process from the web app (`src/server`) and is not started or called by the web app today.

The web app's `weather` module (`src/modules/weather/index.ts`) currently only calls `registerPlaceholderScreen`, which renders the shared "not yet available" partial at `/meteorologia` (localized path segment) for every locale, per the `feature-scaffolding` placeholder-honesty requirement. The shell (`views.ts`), fragment/full-page rendering (`ViewRenderer`), i18n catalogs, and module registration contract are already in place and used by every module — this change is the first to put real data behind one of them.

`ModuleContext` (`src/modules/types.ts`) is the existing seam for handing a feature module a service constructed once at bootstrap (`src/server/app.ts`), following the precedent of `embeddings: EmbeddingProvider`, itself created by `createEmbeddingProvider(...)` from `AppConfig`. The MCP client belongs in that same seam.

Web app config (`src/platform/config/schema.ts`) already defines `WEATHER_PROVIDER` and the MCP *server's* `MCP_TRANSPORT` / `MCP_PORT` / `MCP_CACHE_TTL_SECONDS` / `MCP_RATE_LIMIT_PER_MINUTE` / `MCP_PROVIDER_TIMEOUT_MS`, shared via `mcpConfigSchema`. There is no config yet for how the *web app* reaches the MCP server as a client.

## Goals / Non-Goals

**Goals:**
- Give the web app an MCP client that can call all five weather tools against `mcp/aviation-weather` and map their JSON tool results into typed application data.
- Replace the weather module's placeholder with a real screen: aerodrome selection, METAR/TAF/NOTAM/SIGMET display, inline decoded-METAR explanation, all localized (es/en/pt).
- Preserve and surface, not re-derive, the MCP server's existing provenance, staleness, cache, and mock-data-caveat fields.
- Preserve the no-fabrication contract end-to-end: a failed or timed-out tool call renders a localized error for that indicator, never invented weather text.
- Fit the existing module/view/i18n/fragment conventions exactly as `feature-scaffolding` and `platform-foundation` already establish them (no new page-rendering pattern).

**Non-Goals:**
- Implementing a real (non-mock) weather provider — AEMET/IPMA/EAD stay deferred; this change only reaches the mock provider through the MCP server.
- Route planning, multi-leg briefing packages, or PDF/print briefing output — single-screen aerodrome-by-aerodrome lookup only.
- Persisting weather queries or results to the database — every request is a live round trip to the MCP server (the MCP server's own cache is the only cache).
- Changing the weather MCP server itself — it is already spec-complete and tested; this change is a consumer.

## Decisions

**1. Transport: spawn the MCP server as a stdio child process, not HTTP.**
The web app process launches `mcp/aviation-weather` (`node --import tsx src/index.ts`, or its built output) as a child process at bootstrap and connects an MCP `Client` over `StdioClientTransport`, mirroring how the server side already uses `StdioServerTransport` by default. Alternative considered: connect over HTTP to an independently-run MCP server (`MCP_TRANSPORT=http`), which would let the two processes run and scale independently and matches "runs independently of the web app" language in the weather-mcp spec. Chosen stdio-by-default because it needs no second deployed process, no port coordination, and matches the MCP server's own default transport; HTTP stays supported by making the client transport configurable (`WEATHER_MCP_TRANSPORT=stdio|http`, `WEATHER_MCP_URL` for the http case), so an operator can run the MCP server separately in production without a code change.

**2. Client lifecycle: one client per app process, connected at bootstrap, reused across requests.**
`buildApp` constructs the MCP client once (alongside `createEmbeddingProvider`) and passes it through `ModuleContext` as e.g. `weatherMcp: WeatherMcpClient`. Alternative considered: connect per-request. Rejected — the MCP server already owns caching and rate-limiting per its own spec; a persistent client avoids repeated handshake overhead and lets the process fail fast at startup if the server can't be reached, consistent with how `pool` (DB) and `stores` are already constructed once.

**3. Client module shape: a thin typed wrapper, not a raw SDK client passed to modules.**
`src/platform/weather-mcp/client.ts` exposes an interface (`getMetar(icao[])`, `getTaf(icao[])`, `getNotams(icao[])`, `getSigmet(fir)`, `decodeMetar(raw, locale)`) that internally calls `client.callTool(...)`, parses the JSON text result, and maps provider timeout/error tool responses into a discriminated result type (`{ ok: true, data } | { ok: false, error: { kind, provider, message } }`) per indicator. The weather module never touches the MCP SDK directly — same separation as `EmbeddingProvider` hiding its own provider selection from feature modules.

**4. Aerodrome selection: simple multi-ICAO text/chip input, no aerodrome database lookup.**
The mock provider only has representative Iberian aerodromes/FIRs; there's no aerodrome directory in this codebase yet. The screen accepts one or more 4-character ICAO indicators typed directly (validated client- and server-side against the same 4-letter pattern the MCP tool schemas enforce) plus a FIR selector for SIGMET, rather than building a searchable aerodrome database now. Revisit once a real provider or aerodrome reference table exists.

**5. Rendering: htmx fragment swap for "look up weather," full page for direct navigation — same pattern as every other screen.**
`GET /:locale/meteorologia` renders the (now real) results screen using `ViewRenderer.render`, honoring `HX-Request` for fragment vs. full-page exactly as the placeholder route already does (`fragment.test.ts` already asserts this contract at this exact path). The lookup form posts/gets to the same route with query params (`?icao=LEMD,LEBL&fir=LECM`) so the result is bookmarkable and requires no client-side JS beyond the existing htmx wiring, matching the "navigation without JavaScript" requirement's spirit for this screen's read path.

**6. Provenance/error rendering: one shared partial per tool result shape.**
New `views/components/weather-result.njk`-style partials render the provider/observed/retrieved/cached badge and the mock-data caveat identically for METAR, TAF, NOTAM entries, reusing the shared card/status-chip/badge partials `feature-scaffolding` already ported, rather than inventing new presentation primitives.

## Risks / Trade-offs

- **[Risk] Spawning the MCP server as a stdio child adds a startup dependency: if `mcp/aviation-weather` fails to start or its dependencies aren't installed, the web app either fails to boot or the weather screen breaks.** → Mitigation: fail startup loudly with a clear log naming the MCP server, matching how `checkDatabase` already gates readiness; document the requirement in the MCP client config; keep the HTTP-transport escape hatch (decision 1) so operators can run the MCP server as its own supervised process in production instead of a child process.
- **[Risk] Multi-ICAO requests fan out to N tool calls (or the tool already batches internally) against a rate-limited provider seam.** → Mitigation: the MCP server already enforces its own per-provider rate ceiling and returns a structured retry indication on excess; the client surfaces that as a per-indicator retry error rather than retrying silently or failing the whole request.
- **[Risk] Divergence between the web app's ICAO/FIR validation and the MCP tool schemas' `zod` validation (schemas.ts) causes confusing double-validation errors.** → Mitigation: validate only for UX (immediate inline feedback) client/server-side with the same 4-letter pattern; treat the MCP tool's schema validation error as the authoritative source of truth and surface its message when it disagrees.
- **[Trade-off] No caching layer in the web app itself** means every screen view is a live MCP round trip (mitigated by the MCP server's own TTL cache), simpler than a second cache to keep consistent, at the cost of a network hop on every cache-cold request.

## Migration Plan

1. Add MCP client config fields and the `weather-mcp` platform module (no behavior change yet; unit-testable against a real or fake MCP server in-process).
2. Wire the client into `buildApp` / `ModuleContext` behind the existing bootstrap sequence.
3. Build the weather screen views/routes in the `weather` module, replacing `registerPlaceholderScreen`, updating `fragment.test.ts`'s placeholder-text expectation at `/es/meteorologia` to the new real content.
4. No data migration or rollback beyond reverting the module registration and config — no persisted state is introduced.

## Open Questions

- Should the web app spawn the MCP server itself in production, or should ops run `mcp/aviation-weather` as an independently deployed process reached over HTTP? (Decision 1 leaves both possible; needs an operational decision before deploy, not before this change's implementation.)
- Does SIGMET belong on the same screen as METAR/TAF/NOTAM, or as a secondary panel/tab, given it's keyed by FIR rather than ICAO? Proposal treats it as optional/secondary on the same screen; revisit during UI review.
