# GA Core

Core skeleton for a general aviation pre-flight decision-support tool, built for
Spanish- and Portuguese-speaking GA pilots. This is a **server-rendered** Node.js +
PostgreSQL application (no SPA, no client-side router). It ships alongside the
read-only `diseno/` prototype, which remains the visual reference.

This repository contains **only the skeleton**: the server shell, locale routing,
authentication, the database baseline, the retrieval (RAG) seam, and a runnable
MCP server for aeronautical data backed by a mock provider. Feature behavior
(weather decoding, checklists, risk, logbook, documents) is deferred to later
changes.

## Layout

| Path | Purpose |
| --- | --- |
| `src/` | Web application (root npm workspace) |
| `src/server/` | Fastify bootstrap and HTTP layer |
| `src/platform/` | Shared platform services (config, logging, db, retrieval) |
| `src/modules/` | Feature domains, each exposing one registration entry point composed by `registry.ts` |
| `src/views/` | Nunjucks server templates + ported design system partials |
| `src/assets/` | CSS/images processed by the asset build |
| `db/` | Versioned migrations and the seed routine |
| `mcp/aviation-weather/` | Standalone aviation weather MCP server (npm workspace) |
| `diseno/` | **Read-only** Figma prototype reference. Never modified. |

## Prerequisites

- **Node 22 LTS** (see `.nvmrc` / `engines`)
- npm 10+
- Docker with Docker Compose for the local database

## Local setup

```bash
cp .env.example .env

# Start PostgreSQL (16 + pgvector) in a named-volume container
docker compose up -d db

# Install workspace dependencies
npm install

# Run baseline migrations, then seed a development pilot + sample documents
npm run db:migrate
npm run db:seed

# Compile Tailwind CSS and copy htmx into dist/assets
npm run assets:build

# Start the web application
npm run dev
```

`npm run assets:build` is also the first step of `npm run check`, so a clean
check builds the stylesheet. `npm run assets:watch` rebuilds it on template or
theme edits during development.

Open http://localhost:3000 — the root path redirects to your resolved locale
(`/es` by default).

The seed routine creates a development pilot account so you can sign in and walk
all six feature screens:

- **email:** `piloto@ga-core.local`
- **password:** `piloto-dev-1234`

## Configuration

All configuration is read from environment variables and validated against a Zod
schema at startup (shared by the web application and the MCP server). Every key
is documented in [`.env.example`](.env.example); set values in `.env` (never
committed) or in the shell. A missing or malformed value aborts startup with a
descriptive, secret-free error naming the offending variable.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `HOST` / `PORT` | `0.0.0.0` / `3000` | Web server binding |
| `PUBLIC_URL` | `http://localhost:3000` | External base URL (redirects, links) |
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `SESSION_SECRET` | — | High-entropy secret, ≥ 32 chars (required) |
| `SESSION_TTL_HOURS` | `168` | Absolute session lifetime |
| `AUTH_MAX_FAILED_ATTEMPTS` | `5` | Sign-in attempts per account/source per window |
| `AUTH_FAILURE_WINDOW_MINUTES` | `15` | Rate-limit window for failed sign-ins |
| `EMBEDDING_PROVIDER` | `mock` | `mock` (default) — real providers deferred |
| `EMBEDDING_DIMENSIONS` | `768` | pgvector dimensionality (fixed after migration 003) |
| `EMBEDDING_API_KEY` | — | Required by a non-mock embedding provider |
| `WEATHER_PROVIDER` | `mock` | `mock` (default, Iberia-only fixture data) \| `avwx` (real, global) \| `aemet`/`ipma`/`ead` (not yet implemented) |
| `AEMET_OPENDATA_API_KEY` | — | Required by `WEATHER_PROVIDER=aemet` |
| `IPMA_API_KEY` | — | Required by `WEATHER_PROVIDER=ipma` |
| `EAD_API_KEY` | — | Required by `WEATHER_PROVIDER=ead` |
| `AVWX_API_TOKEN` | — | Required by `WEATHER_PROVIDER=avwx` — free tier at [account.avwx.rest](https://account.avwx.rest) |
| `MCP_TRANSPORT` | `stdio` | `stdio` \| `http` (overridable by `--transport`) |
| `MCP_PORT` | `3001` | Port for the MCP HTTP transport |
| `MCP_CACHE_TTL_SECONDS` | `60` | MCP response-cache TTL |
| `MCP_RATE_LIMIT_PER_MINUTE` | `30` | Per-provider request ceiling |
| `MCP_PROVIDER_TIMEOUT_MS` | `5000` | Upstream provider timeout |
| `LOG_LEVEL` | `info` | pino log level (incl. `silent`) |

## Test and check

```sh
npm test                          # web application + db tests (node:test via tsx)
npm run test:mcp                  # MCP server tests
npm run check                     # typecheck + lint + format + all tests
```

Live integration tests (migrations against real PostgreSQL, retrieval round-trip,
and a signed-in/signed-out walk of all six destinations in all three locales)
run only when a test database is supplied:

```sh
docker compose up -d db
docker exec ga-core-db psql -U ga -d ga_core -c "CREATE DATABASE ga_core_test"
TEST_DATABASE_URL=postgres://ga:ga@localhost:5432/ga_core_test npm test
```

## MCP server

The MCP server (`mcp/aviation-weather`) runs standalone. By default it needs
**no external credentials** — the mock provider returns sample data for four
Iberian aerodromes (LEMD, LEBL, LPPT, LPPR) and three Iberian FIRs (LECM,
LECB, LPPC), always labeled as non-operational. For real, worldwide METAR/TAF
data (e.g. `SUMU`, or any other station outside that fixture set), set
`WEATHER_PROVIDER=avwx` and `AVWX_API_TOKEN` (free tier at
[account.avwx.rest](https://account.avwx.rest)).

**AVWX plan gating, verified live against a real free-tier token:**
`get_metar`/`get_taf` work on the free tier (AVWX's single-station endpoints).
`get_notams` and `get_sigmet` do **not** — AVWX gates `/notam` behind its
"enterprise" plan and `/airsigmet` behind "pro/enterprise"; on a free-tier
token those two tools fail with a structured error naming AVWX's own
plan-gating message (never fabricated data). A paid AVWX plan is required to
use them. Separately, `get_sigmet` against `avwx` is always a best-effort
match — AVWX's `/airsigmet` endpoint has no native FIR filter, so results are
filtered by matching the requested FIR against each advisory's raw text, not
a guaranteed lookup.

The transport is selected by the `MCP_TRANSPORT` environment variable or the
`--transport` flag:

```sh
# stdio transport (default)
npm run start --workspace ga-mcp-aviation-weather

# HTTP transport on MCP_PORT
MCP_TRANSPORT=http npm run start --workspace ga-mcp-aviation-weather
npm run start --workspace ga-mcp-aviation-weather -- --transport=http
```

Both runtimes log the selected weather provider at startup. Tools:
`get_metar`, `get_taf`, `get_notams`, `get_sigmet`, `decode_metar`.

## Safety posture

This is decision-support software for flight operations. Screens whose capability
is not yet implemented render an explicit, localized notice; **no screen ever
presents data that could be mistaken for a real briefing unless its provenance is
labeled.**