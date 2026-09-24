## 1. Repository and toolchain

- [x] 1.1 Create the root `package.json` as an npm workspace with `.` (web app) and `mcp/aviation-weather` as members; pin Node 22 LTS via `engines` and `.nvmrc`
- [x] 1.2 Add TypeScript with strict mode, a shared `tsconfig.base.json`, and per-workspace configs extending it
- [x] 1.3 Add the test runner (`node:test` with `tsx`, or Vitest) and a `test` script that runs both workspaces
- [x] 1.4 Add linting and formatting, plus a `check` script running typecheck, lint, and tests together
- [x] 1.5 Create the directory skeleton: `src/{server,platform,modules,views,assets}`, `db/{migrations,seed}`, `mcp/aviation-weather/src`
- [x] 1.6 Add `.gitignore`, `.env.example` documenting every configuration key, and a `README.md` covering local setup
- [x] 1.7 Add `docker-compose.yml` with PostgreSQL 16 and the `pgvector` image, mapped to a named volume

## 2. Configuration, logging, and server bootstrap

- [x] 2.1 Define the configuration schema with Zod covering database URL, session secret, port, environment, embedding provider and dimensionality, and weather provider selection
- [x] 2.2 Implement config loading that validates at startup and aborts with a descriptive, secret-free error naming the offending variable — satisfies `platform-foundation` "Configuration and secret loading"
- [x] 2.3 Write tests: missing required value aborts; malformed value names its constraint; no secret appears in error output
- [x] 2.4 Configure structured logging with per-request records carrying method, route, status, duration, locale, and correlation id; redact cookies and credentials
- [x] 2.5 Write tests: correlation id is generated when absent, echoed in a response header, and present on every record; session cookie value never appears in output
- [x] 2.6 Implement the Fastify bootstrap composing plugins and module registrations, with graceful shutdown draining in-flight requests
- [x] 2.7 Add liveness and readiness endpoints; readiness reports database health and returns 503 naming the failing dependency
- [x] 2.8 Write tests for both endpoints, including readiness against an unreachable database

## 3. Database foundation

- [x] 3.1 Add the PostgreSQL driver and a versioned, forward-only migration runner recording applied versions
- [x] 3.2 Write the runner's tests: ordered application, exactly-once on repeat runs, rollback and non-recording on transactional failure
- [x] 3.3 Write migration 001 enabling the `vector` extension
- [x] 3.4 Write migration 002 creating `pilots` (email citext-unique, display name, locale, password hash) and `sessions`
- [x] 3.5 Write migration 003 creating `documents` and `document_chunks` with the embedding column at the configured dimensionality, a vector similarity index, and a full-text index
- [x] 3.6 Implement the connection pool and a transaction boundary helper that rolls back on throw and always releases its connection
- [x] 3.7 Write tests: rollback leaves no partial effect; connection returns to the pool on both commit and rollback; parameterized values containing SQL syntax round-trip literally
- [x] 3.8 Add the standard-columns convention (uuid pk, UTC created/updated timestamps, updated-at trigger) and assert it in a schema test
- [x] 3.9 Implement the seed routine creating a development pilot and sample documents; make it idempotent and make it abort when the environment is production
- [x] 3.10 Write seed tests: repeat run creates no duplicates; production environment aborts without writing

## 4. Localization

- [x] 4.1 Port `diseno/src/i18n.ts` into per-locale catalog files for `es`, `pt`, `en`, converting the JSON-encoded-array values into real arrays and preserving the existing dot-namespaced keys
- [x] 4.2 Implement catalog loading and the translation resolver with the fallback chain: requested locale, then `en`, then the key itself; log a warning on locale-miss
- [x] 4.3 Write resolver tests covering all three fallback outcomes
- [x] 4.4 Implement locale resolution: stored pilot preference, then `Accept-Language` negotiation, then `es`
- [x] 4.5 Implement locale-segment routing with a per-locale path segment map; `/` redirects to the resolved locale; an unsupported segment returns 404
- [x] 4.6 Write routing tests for each resolution path and for the unsupported-segment 404
- [x] 4.7 Implement the locale switcher: persists to the pilot account when authenticated, session-only when anonymous, and redirects to the equivalent route in the new locale
- [x] 4.8 Write tests: preference survives a new session; anonymous switch performs no database write
- [x] 4.9 Implement locale-aware date, time, and number formatting helpers, with UTC times rendered with an explicit `Z` suffix
- [x] 4.10 Implement the verbatim rendering path for coded aeronautical content and test that it is character-identical across all three locales and preserves line structure

## 5. Identity and access

- [x] 5.1 Implement the pilot account model with Argon2id password hashing and case-insensitive unique email
- [x] 5.2 Write tests: no plaintext password is persisted or logged; case-differing duplicate email is rejected
- [x] 5.3 Implement server-side sessions with opaque identifiers and cookies set `HttpOnly`, `SameSite=Lax`, and `Secure` under HTTPS
- [x] 5.4 Implement sign-in, sign-out, and registration routes with their localized templates
- [x] 5.5 Write session tests: session rotation on sign-in, prior cookie unusable after sign-out, expiry past the absolute lifetime, generic failure message that does not disclose account existence
- [x] 5.6 Implement route-level authentication requirements: redirect to sign-in preserving the return path, and return a client-actionable redirect for fragment requests
- [x] 5.7 Write tests: protected content never appears in an unauthenticated response body; return path is honored after sign-in
- [x] 5.8 Implement CSRF token issuance and verification for all state-changing requests
- [x] 5.9 Write CSRF tests: absent token rejected 403, token from another session rejected 403, valid token processed, and no state change on rejection
- [x] 5.10 Implement the ownership-scoping query helper and test that another pilot's record returns 404 rather than 403
- [x] 5.11 Implement sign-in rate limiting per account and per source, and test threshold behavior and its non-disclosing message

## 6. Design system and application shell

- [x] 6.1 Configure Tailwind CSS v4 with the prototype's color, typography, and spacing tokens extracted into a theme file, plus the asset build pipeline
- [x] 6.2 Set up Nunjucks with template inheritance, the translation and formatting helpers exposed as filters, and autoescaping enabled
- [x] 6.3 Build the base layout: responsive viewport declaration, `lang` attribute from the active locale, and the token-driven theme
- [x] 6.4 Re-author the prototype's components as shared partials at phone width first — card, status chip, badge, raw/plain toggle, progress bar, page header, empty state — with 44px minimum touch targets throughout
- [x] 6.5 Write component tests: every status chip renders a text label or icon alongside color; every interactive shared partial meets the 44px target rule
- [x] 6.6 Verify WCAG 2.1 AA contrast for every text token pairing used in the shell and record the results
- [x] 6.7 Build the application shell: sidebar at desktop width, off-canvas drawer below the large breakpoint, phone-width thumb-reach navigation, active aircraft slot, locale switcher, and pilot identity
- [x] 6.8 Ensure all navigation presentations render from one registry-derived destination list and remain reachable with JavaScript disabled
- [x] 6.9 Write shell tests: no horizontal body scroll and all controls reachable at 320px, 768px, and 1280px; identical markup for phone and desktop user agents; `aria-current="page"` on the active destination
- [x] 6.10 Add htmx and implement the fragment-rendering convention: one helper choosing partial-only or layout-wrapped output from the `HX-Request` header
- [x] 6.11 Write fragment tests on a representative route: fragment response omits the document shell, and the fragment markup is contained within the full-page response
- [x] 6.12 Build localized 404 and 500 error pages; verify that production mode leaks no stack trace, SQL, or filesystem path and that the 500 page shows the correlation id

## 7. Feature module scaffolding

- [x] 7.1 Define the module registration contract: one entry point per module declaring its routes, per-locale path segments, navigation label key, icon, and order
- [x] 7.2 Implement the module registry and wire the bootstrap to compose the application solely by invoking registrations
- [x] 7.3 Write registry tests: each entry point invoked exactly once; removing a registration yields 404 for its routes, leaves other modules unaffected, and drops its sidebar entry
- [x] 7.4 Build the shared placeholder screen: localized not-yet-available notice conveyed by text rather than color, rendered inside the shell
- [x] 7.5 Create the six modules — `dashboard`, `weather`, `checklists`, `risk`, `fleet`, `documents` — each registering its localized segments and rendering the placeholder
- [x] 7.6 Add the localized path segments for all six domains across `es`, `pt`, and `en` to the catalogs
- [x] 7.7 Write tests: all six destinations return 200 in all three locales inside the shell; every placeholder response is free of METAR, TAF, NOTAM, engine, fuel, maintenance, and risk-score values and of the prototype's sample strings
- [x] 7.8 Add an import-boundary lint rule preventing a feature module from importing another feature module's internals, and test that it fires

## 8. Retrieval foundation

- [x] 8.1 Define the document and chunk repository interfaces with attribution — document id, title, and chunk position — carried on every chunk
- [x] 8.2 Implement the repositories, including cascade deletion of chunks with their document and positional ordering on listing
- [x] 8.3 Enforce embedding dimensionality on write, rejecting mismatches with an error naming both expected and supplied lengths; test the rejection
- [x] 8.4 Define the embedding provider interface accepting a batch and returning one vector per input in order
- [x] 8.5 Implement the deterministic hash-derived mock provider and make it the default when no credential is configured
- [x] 8.6 Write provider tests: positional correspondence and count, determinism across repeated calls, mock selected with no credential, startup aborts when a named non-mock provider lacks its credential
- [x] 8.7 Implement hybrid retrieval combining vector similarity and full-text relevance into one ranked, bounded result set
- [x] 8.8 Write retrieval tests: result count respects the limit and ordering is by descending combined score; a lexical-only match and a vector-only match are both eligible; every result carries score and attribution; an empty corpus returns an empty set without error
- [x] 8.9 Assert that the retrieval result type carries only scored chunks and no generated prose

## 9. Aviation weather MCP server

- [x] 9.1 Scaffold the `mcp/aviation-weather` workspace with `@modelcontextprotocol/sdk` and its own configuration loading through the shared validated schema
- [x] 9.2 Define the internal provider interface for METAR, TAF, NOTAM, and SIGMET retrieval, with a result type carrying provider, issue or observation time, retrieval time, and a cached flag as required fields
- [x] 9.3 Define Zod input schemas for all five tools, including four-character ICAO location indicator validation and the `es`/`pt`/`en` locale enum
- [x] 9.4 Implement the mock provider with representative Iberian sample data (LEMD, LEBL, LPPT, LPPR; LECM, LECB, LPPC), marking every result as sample data unsuitable for operational use
- [x] 9.5 Implement the five tools — `get_metar`, `get_taf`, `get_notams`, `get_sigmet`, `decode_metar` — over the provider interface
- [x] 9.6 Implement `decode_metar` returning locale-appropriate explanatory text with the raw report echoed back unchanged
- [x] 9.7 Implement per-indicator no-data results so one unknown aerodrome does not fail the whole call
- [x] 9.8 Implement the response cache with a configurable TTL and per-provider rate limiting that queues or rejects rather than exceeding the ceiling
- [x] 9.9 Implement upstream failure handling returning structured errors on timeout or provider error, with no report text and no substituted data
- [x] 9.10 Wire the stdio transport, ensuring no non-protocol output reaches stdout
- [x] 9.11 Wire the HTTP transport on a configured port, selected by flag or configuration
- [x] 9.12 Write tests: handshake and tool discovery return names, descriptions, and input schemas; each tool returns a well-formed result against the mock; schema violations and malformed ICAO codes return validation errors without a fetch
- [x] 9.13 Write tests: provenance fields present on every data result; mock results labeled as sample data; cache hit within TTL performs no second upstream request and is marked cached; timeout returns a structured error carrying no report text
- [x] 9.14 Log the selected provider at startup in both the MCP server and the web application

## 10. Verification and handoff

- [x] 10.1 Add integration tests booting the real server against a test database and walking all six destinations in all three locales, signed in and signed out
- [x] 10.2 Run `openspec validate scaffold-ga-core --strict` and resolve every finding
- [x] 10.3 Verify the full local path end to end from a clean clone: compose up, migrate, seed, start, sign in, navigate, and invoke one MCP tool per tool over stdio
- [x] 10.4 Confirm no external credential is required at any point in 10.3
- [x] 10.5 Update `README.md` with setup, the configuration reference, the test and check commands, and how to run the MCP server on each transport
- [x] 10.6 Write `CLAUDE.md` at the repo root recording the architecture, the module registration contract, the fragment-rendering convention, the mobile-first breakpoint rules, and the standing rule that no screen may present operational-looking data without provenance
- [x] 10.7 Confirm `diseno/` is unmodified

## 11. Follow-up (not implemented here)

- [x] 11.1 Run an `/opsx:explore` session on multi-tenancy, flight schools, and club-level roles before any feature change adds a table — the outcome reshapes the ownership columns every feature inherits
  Explored and interviewed 2026-09-23. By then nine feature tables had already shipped with `pilot_id`, so this is a migration, not a greenfield design. Decisions:
  1. **First customers are owner-pilots.** The structure must allow co-owners from the start; the co-owner invite interface comes later. Clubs and schools are out of the 12-month scope.
  2. **Ownership split by nature.** Aircraft-bound records (aircraft, documents, W&B, maintenance, checklists, engine-monitor data) are owned by an **operator**. Personal records (logbook, flight intents, risk assessments, checklist runs, sessions) stay `pilot_id`. Each pilot gets a personal operator created automatically, so nothing visible changes.
  3. **One login spans many operators**, with no context switching, and one personal logbook across all of them.
  4. **Timing: structure now, roles later.** A single `member` role with equal edit rights, plus `created_by`/`updated_by` on aircraft-bound rows.
  5. **Aircraft total hours = opening offset + the sum of all members' flights, shown only as an aggregate.** Co-owners never see each other's flight rows. A member who leaves still counts toward the total, and their logbook stays theirs. Known limitation: with two co-owners, each can infer the other's total by subtraction. An aircraft-level hour-meter log is a possible future record type.
  6. **Standing privacy rule:** personal records are never visible to an operator or its members by default. Any future sharing (for example with an instructor) is an explicit, revocable opt-in by the pilot.
  7. **Enforcement:** a Postgres row-level-security spike before committing, keeping the "foreign row is a 404" behavior.
  Follow-up: the `operator-ownership` change.
- [x] 11.2 In parallel with the work above, investigate EUROCONTROL EAD/NM B2B access and NOTAM redistribution terms, since the answer gates the weather capability's design
  Investigated 2026-09-23. **No free, machine-readable, redistributable NOTAM source exists for Spain/Portugal.**
  - **EAD Basic** is free after registration, but it is a web portal. Since 2022 it carries a disclaimer that it is a demo tool, not connected to the operational database, and it may not show the latest data. It is not usable as a data source.
  - **EAD machine access** (MyEAD web services, or EAD Pro) requires a signed EAD Agreement and liability insurance. A third-party redistributor (Type 3) pays service charges plus royalties on revenue from products that use EAD data.
  - **NM B2B** is limited to ANSPs, aircraft operators, airports, and ground handlers. Its AIM data is ATFM network information, not a NOTAM feed for aerodromes.
  - **ENAIRE ICARO XXI** (notampib.enaire.es) and **NAV Portugal** (ais.nav.pt, fplbriefing.nav.pt) offer free NOTAM/PIB briefings to registered users, with no public API. A data agreement would have to be requested directly.
  - FAA NOTAM API: dropped by the developer (2026-09-23).
  - Consequence for design: NOTAMs stay `unknown` coverage (the unconfirmed-empty state) until there is a licensed source. The honest free option is to link to the official ENAIRE/NAV Portugal briefing, never to scrape it.
