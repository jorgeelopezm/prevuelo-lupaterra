# AGENTS.md — GA Core

Working guide for agents and humans editing this repository. The authoritative
source of intent is `openspec/` — especially `openspec/changes/scaffold-ga-core/`
(proposal, design, specs, tasks) — and this file summarizes the standing rules
that code and tests already enforce.

## Working agreement (read first)

These four rules apply to every task in this repository and override any
default agent behavior.

### 1. Use CodeBase Memory MCP to optimize token use

Structural discovery goes through the `codebase-memory-mcp` knowledge graph
before any broad file reading:

- `search_graph` to find symbols, `trace_path` for callers/callees,
  `get_code_snippet` for exact source, `query_graph` for multi-hop patterns,
  `get_architecture` for orientation.
- Fall back to `Grep`/`Read` only for literal or non-code text, or when
  `check_index_coverage` shows the graph does not cover the path in question.
- Call `list_projects` before first use; `index_repository` only when this repo
  is not indexed or after a large external update. Verify every cited path with
  `check_index_coverage` — coverage is best-effort, never proof of completeness.

Never read whole directories to answer a question the graph can answer.

### 2. Tests cover happy path, sad path, and evals

Every change ships all three, or states explicitly why one does not apply:

- **Happy path** — the intended flow with valid input produces the expected
  result (route renders, tool returns, migration applies).
- **Sad path** — invalid input, missing configuration, upstream failure, and
  unauthorized access produce structured errors, no substituted data, and no
  secrets in output.
- **Evals** — behavioral assertions on the standing rules rather than on
  implementation details: no operational-looking data without provenance,
  44px minimum touch targets, mock data labeled as sample, locale segments
  resolved from the catalogs, fragment and full page rendering the same partial.

Tests use `node:test` via `tsx`. Live integration tests are guarded by
`TEST_DATABASE_URL` and skip when it is absent.

### 3. Commands MUST be authorized or executed by the developer

Do not run shell commands, migrations, seeds, servers, installs, or git
operations on your own initiative. Propose the exact command, say what it will
do, and wait for the developer to authorize it or run it themselves. This
covers `npm run check`, `npm test`, database work, `docker compose`, and
anything that writes outside the working tree. Read-only inspection of files
already in the repository does not need authorization.

### 4. Enter interview mode if the description is vague

When a request does not determine the work — the target module, the expected
behavior, the affected locale, the acceptance criteria, or which
`openspec/changes/` entry it belongs to is unclear — stop and interview the
developer before writing code. Ask focused questions one round at a time, state
the assumptions you would otherwise make, and only proceed once the scope is
unambiguous. Guessing and building the wrong thing costs more than one round of
questions.

## What this repository is

A **server-rendered** Node.js + PostgreSQL application for general-aviation
pre-flight decision support (Spanish and Portuguese first). It is a **skeleton**:
feature behavior (weather decoding, checklists, risk, logbook, documents) is
deferred to later changes. `diseno/` is the **read-only** Figma prototype and
the visual reference — never modify it.

Two runtimes share the same validated configuration schema
(`src/platform/config/schema.ts`):

- **Web application** (root npm workspace): Fastify serving Nunjucks HTML per
  route, htmx for fragment swaps. No SPA, no client router, no hydration.
- **MCP server** (`mcp/aviation-weather`, npm workspace): standalone MCP server
  exposing `get_metar`, `get_taf`, `get_notams`, `get_sigmet`, `decode_metar`
  over stdio or HTTP, backed by a provider interface with a **mock default**.

## Architecture

```
src/
  server/        Fastify bootstrap (app.ts, index.ts), auth routes, views plugin
  platform/      Shared services: config, logging, db, i18n, identity, retrieval
  modules/       Six feature domains, each one entry point (see contract below)
  views/         Nunjucks templates + ported design-system partials
  assets/        Tailwind CSS v4 theme and entry stylesheet
db/
  migrations/    Versioned, forward-only SQL (001 vector ext, 002 pilots/sessions,
                 003 documents/chunks)
  seed/          Idempotent development seed (aborts in production)
mcp/aviation-weather/
  src/           Provider interface + mock, tool schemas/service/registry,
                 decode_metar, transports (stdio + HTTP), standalone entry point
```

### Module registration contract

Each feature domain exports one `FeatureModule` (`src/modules/types.ts`):

```ts
{
  id: ModuleId            // 'dashboard' | 'weather' | 'checklists' | 'risk' | 'fleet' | 'documents'
  labelKey: string        // catalog key for the localized nav label
  icon: string            // icon name from the shared icons partial
  order: number           // navigation order (ascending)
  register: FastifyPluginCallback<ModuleContext>
}
```

The registry (`src/modules/registry.ts`) composes the application **solely** by
invoking these `register` callbacks, and the shell navigation renders from the
same list — a destination exists if and only if its module is registered.
`ModuleContext` supplies `config`, `pool`, `stores`, `views`, `embeddings`.
Per-locale URL segments come from the catalogs (`nav.segment.<id>`), resolved by
`src/platform/i18n/segments.ts`.

### Fragment-rendering convention

One route handler renders both a full page and an htmx fragment. Route handlers
call `app.views.render(req, { fragment, locals })`; the renderer
(`src/server/views/views.ts`) checks the `HX-Request` header:

- `hx-request: true` → the **bare partial** (no shell, no `<html>`/`<head>`)
- otherwise → the same partial embedded in `layout.njk`

The fragment is always the *same* partial the full page embeds — never a second
copy. Add a route with an `HX-Request` variant by passing `{ fragment, locals }`
to the renderer and doing nothing else.

### Mobile-first breakpoint rules

The shell is authored at phone width first and widened with Tailwind breakpoints
(no JavaScript-driven layout, no viewport sniffing, one template set):

- **320px** — usable one-handed: bottom tab bar for the six destinations, header
  control opens the off-canvas drawer, single-column content.
- **768px** — content columns may appear where the item needing attention leads.
- **1280px** — the 224px-wide sidebar is permanent (`hidden lg:flex`); drawer and
  tab bar hidden.

Every interactive control in shared partials has a **44px minimum touch target**
(enforced by test). Navigation renders from the registry-derived destination
list in all presentations.

### Standing rule: provenance on operational-looking data

**No screen may present operational-looking data without provenance.** Placeholder
screens state unavailability in text, never by color, and must not contain
METAR/TAF/NOTAM/SIGMET values, engine/fuel/maintenance figures, risk scores, or
the prototype's sample strings (enforced by test). Mock data everywhere —
web, retrieval, MCP — is explicitly labeled as sample data not for operational
use. Upstream failures return structured errors with no report text and no
substituted data.

## Conventions to keep

- **Configuration** flows through the shared Zod schema; both runtimes log their
  selected providers at startup. Secrets never appear in logs or responses.
- **Database** uses uuid PKs, UTC `created_at`/`updated_at`, an updated-at
  trigger, and ownership columns (`pilot_id`) on every feature table.
- **Logging** is structured (pino): one record per request with method, route,
  status, duration, locale, correlation id; session cookies and credentials are
  redacted.
- **Tests** use `node:test` via `tsx` and cover happy path, sad path, and evals
  (see the working agreement above). Live integration tests are guarded by
  `TEST_DATABASE_URL` and skip when it is absent.
- **Validation gate**: `npm run check` (assets → typecheck → lint → format →
  web tests → MCP tests) must stay green. `openspec validate scaffold-ga-core
  --strict` must pass.

## Commands

Propose these; do not run them without the developer's authorization (rule 3).

```sh
npm test                          # web + db tests
npm run test:mcp                  # MCP server tests
npm run check                     # full gate (typecheck, lint, format, tests)
TEST_DATABASE_URL=postgres://...  npm test   # adds live DB integration + e2e
npm run start --workspace ga-mcp-aviation-weather   # MCP over stdio
MCP_TRANSPORT=http npm run start --workspace ga-mcp-aviation-weather
```
