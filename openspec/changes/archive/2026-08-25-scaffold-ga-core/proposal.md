## Why

`diseno/` contains a validated, high-fidelity UI prototype for a general aviation pre-flight decision-support tool — six screens, three locales, and a complete visual language — but it was built under an explicit "no backend, no API, no live data" constraint, so every value on every screen is hard-coded. The design has proven the workflow; nothing behind it exists.

This change builds **only the core skeleton** of the real application: a server-rendered Node.js/PostgreSQL foundation for Spanish- and Portuguese-speaking GA pilots, with every seam the later feature work will plug into — locale routing, authentication, migrations, a pgvector-backed retrieval layer, and a running MCP server for aeronautical data.

## Scope

**In scope — the skeleton.** Server bootstrap, view layer, locale routing, authentication and sessions, database connectivity and baseline schema, the retrieval (RAG) seam, the MCP server with its tool contracts, and navigable placeholder routes for all six feature screens rendered inside the real application shell.

**Explicitly out of scope — deferred to their own changes.** Weather & NOTAMs, Checklists, Risk Assessment, Aircraft & Logbook, and the Documents & AIS assistant are **not implemented here**. Each gets its own proposal and spec later. This change delivers their route boundaries, module directories, and the shared services they will consume — nothing more. A placeholder screen that renders the shell and says "not yet implemented" is the correct and complete outcome for those six routes.

**Two deliberate judgment calls**, flagged rather than assumed silently:
- The MCP server ships **runnable with its tool contracts defined and a mock provider**. The real AEMET/IPMA/EAD adapters are feature work and are deferred with the weather capability. This keeps the MCP genuinely exercisable on day one without requiring credentials.
- The retrieval layer ships **storage, schema, and the retrieval interface**. Document ingestion, chunking strategy, and answer synthesis belong to the Documents capability and are deferred.

## What Changes

- **New application at the repo root**, alongside (not replacing) `diseno/`. The prototype stays as the visual reference; its Tailwind design tokens, component patterns, and `src/i18n.ts` dictionaries are ported into server templates.
- **Server-rendered multi-page architecture — explicitly not a SPA.** Fastify serves Nunjucks-rendered HTML per route; htmx handles in-page interactivity via HTML fragment swaps. No client-side router, no hydration, no JSON-rendering front end.
- **PostgreSQL as the single datastore**, with `pgvector` enabled from the first migration so retrieval needs no later storage change. Baseline schema covers pilots, sessions, locale preference, and the document/embedding tables; feature tables arrive with their own changes.
- **Locale-first routing** — `/es` (default), `/pt`, `/en` — with URL-segment locale, database-backed pilot preference, and `Accept-Language` negotiation as fallback.
- **Module boundaries for the six feature domains**, each with a registered route namespace, a placeholder view, and a directory ready to receive its implementation.
- **A mobile-first responsive shell.** Phones, tablets, and desktops are all first-class targets from one template set adapted by CSS — no device detection, no parallel templates. The prototype is desktop-shaped (fixed sidebar, multi-column grids, sub-44px controls); re-authoring the design system at phone width is skeleton work, settled here before six feature screens are built on it.
- **A standalone MCP server** (`mcp/aviation-weather`) exposing typed tools for METAR, TAF, NOTAM, and SIGMET retrieval plus locale-aware decoding, backed by a provider interface and a mock provider seeded from the prototype's sample data.
- **A retrieval foundation**: embedding storage in pgvector, a hybrid vector + full-text query interface, and a mock embedding provider so the seam is exercisable without an API key.

## Capabilities

### New Capabilities

- `platform-foundation`: Fastify server bootstrap, Nunjucks view layer, htmx fragment conventions, configuration and secret loading, structured logging, health checks, error pages, PostgreSQL connection pooling, and the migration runner.
- `localization`: Locale-segment routing, translation catalog loading, `Accept-Language` negotiation, pilot locale preference persistence, locale-aware formatting, and preservation of aeronautical phraseology across all locales.
- `identity-access`: Pilot accounts, session-cookie authentication, CSRF protection for state-changing requests, and route-level authorization scoping every record to its owning pilot.
- `data-foundation`: Baseline relational schema, migration conventions, transaction and query access patterns, seed data for local development, and the ownership columns every feature table will inherit.
- `feature-scaffolding`: Registered route namespaces and navigable placeholder screens for the six feature domains, plus the module layout and registration contract each later capability implements against.
- `retrieval-foundation`: Document and chunk storage with pgvector embeddings, an embedding provider interface with a deterministic mock, and a hybrid vector + full-text retrieval interface returning scored, attributable chunks.
- `weather-mcp`: A runnable MCP server exposing `get_metar`, `get_taf`, `get_notams`, `get_sigmet`, and `decode_metar` as typed tools over stdio and HTTP, behind a provider interface with a mock provider.

### Modified Capabilities

None — `openspec/specs/` is empty; this is the first change to establish specifications.

## Impact

- **New code**: application root (`src/`), database migrations (`db/`), MCP server (`mcp/aviation-weather/`), seed data, and test suites. `diseno/` is read-only reference and is not modified.
- **New dependencies**: Fastify and its plugin set (`@fastify/*`), Nunjucks, htmx, Tailwind CSS v4, a PostgreSQL driver with a migration tool, `pgvector`, `@modelcontextprotocol/sdk`, and Zod for boundary validation.
- **New infrastructure**: PostgreSQL 16+ with the `vector` extension; Docker Compose for local development.
- **Deferred external services**: AEMET OpenData, IPMA, and EUROCONTROL EAD/NM B2B credentials are not required by this change and are not requested here — the mock provider is the default, and the application runs end-to-end with no external account.
- **Safety posture**: this is decision-support software for flight operations. The placeholder screens delivered here MUST NOT display fabricated weather, NOTAM, or telemetry values that could be mistaken for a real briefing; they state plainly that the capability is not yet available.
