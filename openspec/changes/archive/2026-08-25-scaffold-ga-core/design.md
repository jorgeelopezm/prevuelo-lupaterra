## Context

`diseno/` holds a Figma-Make React prototype: 931 lines of `App.tsx` covering six screens, a 509-line `i18n.ts` with complete `en`/`es`/`pt` dictionaries, and a dark, high-contrast aviation design system built on Tailwind CSS v4. It was produced under an explicit prohibition on backends, APIs, and live data, so it encodes the *workflow and visual language* but nothing operational. It is reference material and is not modified by this change.

The target users are Spanish- and Portuguese-speaking general aviation pilots doing pre-flight decision-making. They work across phones, tablets, and desktops — a phone at the fuel pump or on the walkaround, a tablet kneeboard-mounted in the cockpit, a desktop during flight planning at home or in the club — often with poor connectivity and high glare. That shapes three constraints that outrank developer convenience: pages must be useful without a JavaScript runtime having to boot and hydrate, every screen must be fully usable at phone width with one hand, and no screen may ever present a value whose provenance and age are unclear.

The prototype in `diseno/` is desktop-shaped — a fixed 224px sidebar, multi-column grids, and a three-panel checklist layout that assumes roughly 1280px of width. Its design principles call for mobile-first, but its markup does not deliver it. Reconciling that is skeleton work, not feature work: the responsive behavior of the shell must be settled before six feature screens are built on top of it.

This change builds the skeleton only. The six feature domains get route boundaries and module directories; their behavior arrives in later changes.

## Goals / Non-Goals

**Goals**

- A running Fastify server rendering complete HTML documents per route, with htmx fragment swaps for interactivity — no SPA, no client router, no hydration.
- Locale-first routing across `es` (default), `pt`, `en`, with the prototype's dictionaries ported intact.
- Session authentication with CSRF protection and ownership scoping established before any feature stores pilot data.
- PostgreSQL with `pgvector` enabled in the first migration, plus document/chunk storage and a hybrid retrieval interface — RAG-ready, not RAG-complete.
- An MCP server that starts, advertises `get_metar`/`get_taf`/`get_notams`/`get_sigmet`/`decode_metar`, and answers every one of them from a mock provider with zero credentials.
- Six navigable placeholder screens rendering the real shell and the ported design system, usable from a 320px phone viewport up to desktop.

**Non-Goals**

- Any feature behavior: weather decoding logic, checklist state machines, risk scoring, logbook computation, or chat answer synthesis.
- Real AEMET, IPMA, or EUROCONTROL EAD adapters. The provider interface and mock exist; the network adapters are deferred with the weather capability.
- Document ingestion, chunking strategy, or embedding backfill. Storage and the retrieval query exist; the pipeline that fills them is deferred.
- Offline support, service workers, and background sync — real needs for cockpit use, but they belong to a later change once the feature surfaces exist.
- Multi-tenancy, flight schools, or club-level roles. One pilot owns their own records; that is the whole authorization model for now. **This exclusion is scheduled for exploration immediately after this change** — see Open Questions. It is deferred because the ownership column and session model need to exist before the question can be examined concretely, not because it has been judged unnecessary.
- Native applications. Mobile support here means a responsive web application, not an app-store build.

## Decisions

### Fastify + Nunjucks + htmx over Express/EJS or Astro

Fastify's schema-first request validation and first-class TypeScript typing matter more here than Express's larger ecosystem, because every boundary in this system — MCP tool arguments, weather provider payloads, form posts — needs validation anyway. Nunjucks gives template inheritance and macros, which is what makes a shared design system expressible as partials rather than copy-paste. htmx handles the four genuinely interactive moments in the prototype (checklist toggling, raw↔plain switching, aerodrome selection, chat streaming) by swapping server-rendered fragments, so those fragments stay in the same template language as the pages that contain them.

*Alternatives considered.* Express + EJS is more conventional and easier to hire for, but EJS has no real inheritance and Express's TypeScript story would push validation into hand-written guards. Astro SSR has excellent i18n routing and ships near-zero JS, but it is a build tool shaped like a framework; sessions, CSRF, and long-lived provider clients fit awkwardly, and the MCP server would sit outside its model entirely.

*Consequence.* The same route function must render either a full page or a bare fragment. This is handled by one convention — check `HX-Request`, pick the partial or the layout-wrapped partial — applied uniformly, rather than by parallel route trees.

### Locale in the URL path, not a cookie or subdomain

`/es/meteorologia` is shareable, cacheable, and unambiguous to a proxy. A cookie-based locale makes the same URL render differently per visitor, which breaks caching and makes a shared link between two pilots behave differently for each. Path segments are localized per locale (`/es/meteorologia`, `/en/weather`) rather than shared, because the URL is user-facing text and a Spanish-speaking pilot should not navigate through English nouns.

*Consequence.* Route registration takes a per-locale segment map rather than a single path string. The cost is one indirection in the module registration contract; the benefit is that adding a fourth locale later touches only catalogs and the segment map.

### Dictionaries ported as-is, structure changed later

`diseno/src/i18n.ts` uses flat dot-namespaced keys (`wx.metar_label`, `risk.q_fatigue`) and stores some values as JSON-encoded arrays parsed at render time. That JSON-in-a-string pattern is a prototype artifact and does not survive the port — arrays become real arrays in the catalog format. The key naming does survive, because it is already consistent and re-keying now would create pointless drift against a design reference the team will keep consulting.

### Mobile-first shell: one layout that adapts, not two layouts

The shell is authored at phone width first and widened with Tailwind breakpoints, rather than authored for desktop and squeezed. Three structural transformations carry it across the range, and all three are CSS — no JavaScript-driven layout, no viewport sniffing on the server, and crucially no second set of templates:

- **Navigation.** The 224px sidebar is permanent from the large breakpoint up. Below it, it collapses to an off-canvas drawer opened by a header control, with a bottom tab bar carrying the six destinations for thumb reach on phones. All three presentations render from the same registry-derived destination list.
- **Multi-column grids.** The dashboard's 2-column and 3-column card grids, and the aircraft screen's paired panels, become single-column stacks below the medium breakpoint, ordered so the item needing attention leads.
- **The three-panel checklist layout** (fleet → checklist → items) becomes a drill-down on phones: one panel visible at a time with a back affordance, which is also the pattern that suits a checklist being *run* rather than browsed.

Touch targets are sized to a 44px minimum across every interactive element, which the prototype's compact controls do not currently meet — its checklist rows do, but its locale buttons, aerodrome chips, and raw/plain toggle do not. Sizing up is a design-system change made once, in the shared partials, so every later feature inherits it.

*Alternative considered.* Server-side device detection returning different templates per class. Rejected: it doubles the template surface, breaks at every device that lies about its user agent, makes caching keyed on user agent, and fails the split-screen and resized-window cases entirely.

*Consequence.* The design system port is more work than a transcription of the prototype's classes — it is a re-authoring at a different starting width. This is the right place to absorb that cost, and it is why the ported-design-system task sits before the feature placeholder tasks.

### Feature modules register themselves; the shell reads the registry

Each of the six domains is a directory exposing one registration function. The bootstrap composes the app by calling them; the sidebar renders from what registered rather than from a hard-coded list. This is what makes the placeholder screens honest work rather than throwaway work: when the weather capability lands, it replaces one module's internals and touches nothing else, and the navigation follows automatically.

*Alternative considered.* Hard-coding the six routes and the sidebar now, and refactoring when features land. Rejected — it converts every feature change into a change to shared files, which is exactly the merge contention a multi-change plan should avoid.

### `pgvector` from migration one, mock embeddings by default

Enabling the extension and creating the embedding column in the baseline schema costs almost nothing now and avoids a data migration on a populated table later. The embedding dimensionality is configuration, validated on write, so switching providers is a backfill rather than a schema change. The mock provider is deterministic (hash-derived vectors) so retrieval tests are reproducible and the seam is exercisable before any embedding account exists.

*Consequence.* Mock vectors have no semantic meaning. Retrieval tests against the mock verify *plumbing, ranking mechanics, and attribution* — not answer quality. Quality evaluation arrives with the Documents capability and real embeddings.

### One provider interface, consumed by both the MCP server and the web app

The MCP server wraps the same provider interface the application will use, rather than the application calling the MCP server over a transport. This avoids a network hop and a second serialization boundary inside our own process for data we already have a typed client for, while still giving external MCP clients (a pilot's own Claude session, for instance) the same tools. The MCP server is a *presentation* of the provider layer, not a dependency of it.

### Provenance is a required field, not a display option

Every weather result carries provider, issue/observation time, retrieval time, and a cached flag; mock results are explicitly labeled as sample data unsuitable for operational use. This is enforced in the result type so a later feature cannot render a report without having the provenance in hand. The same reasoning drives the placeholder-screen rule that no invented operational value may appear: a pilot glancing at a tablet must never be able to mistake scaffolding for a briefing.

### Failures return errors, never substituted data

When a provider times out or errors, the tool returns a structured error and no report text. There is no fallback to stale-but-unlabeled cache, no synthesized "typical conditions." A missing METAR is a fact the pilot can act on; a plausible wrong one is not.

## Risks / Trade-offs

- **Placeholder screens could be mistaken for finished work, or ship into a real cockpit.** → Every placeholder states its unavailability in text (not color), carries no operational-looking values, and is spec-tested for the absence of prototype sample data. The rendering test asserts on absence, which is the only form of that check that stays true as the templates evolve.

- **htmx fragment routes double the rendering paths and can drift from their full-page counterparts.** → One shared convention for fragment detection, and the fragment is always the *same partial* the full page embeds — never a separately maintained copy. Tests request representative routes both ways and assert the fragment is contained in the full page.

- **The mock providers make everything look green.** A skeleton that passes all its tests against mocks tells you nothing about AEMET's actual payload shape, EAD's authentication dance, or IPMA's rate limits. → The provider interface is deliberately thin and the first real adapter is scheduled early in the weather change, on the expectation that it *will* force interface revisions. Treating the current interface as provisional is the mitigation; pretending it is final is the risk.

- **Iberian NOTAM access is the hardest dependency and it is deferred.** EUROCONTROL EAD/NM B2B requires organizational registration, certificate-based auth, and carries redistribution terms. → Deferring it is correct, but the risk is that it turns out to be unobtainable for this project's legal footing, which would reshape the weather capability entirely. This should be investigated *during* the skeleton work, in parallel, not discovered later.

- **Server-rendered pages plus cockpit connectivity is an unsolved combination.** Every navigation is a round trip; a pilot on a marginal cellular link at an aerodrome will feel it. → Out of scope here by decision, not by oversight. The MPA architecture does not preclude a later offline layer, and the fragment discipline actually helps it, but this is a real gap that a later change must own.

- **The prototype's dense, desktop-shaped layouts may not survive the move to phone width intact.** Compressing the aircraft screen's engine strip, the 10-row maintenance panel, or the risk questionnaire's three-across answer buttons into 320px may require dropping information density that the design deliberately chose. → The skeleton settles the *shell* — navigation, grid collapse, touch targets — where the answer is clear. Screen-specific density decisions belong to each feature change, where the actual content is known. Flagging this now so those changes budget for it rather than discovering it at build time.

- **A responsive shell verified only by eye regresses silently.** → Rendered-output tests assert the structural rules (single navigation source, minimum target sizing in shared partials) rather than pixel snapshots, and the three breakpoint presentations are checked at 320px, 768px, and 1280px as part of the shell's acceptance.

- **`pgvector` index tuning is guesswork with an empty corpus.** Index parameters chosen now are chosen without knowing corpus size or query distribution. → Accept and revisit. The index is cheap to rebuild at the corpus sizes a document library implies.

- **Two runtimes (web app, MCP server) sharing a provider layer can drift in configuration.** → Both load configuration through the same validated schema module, and both log their selected provider at startup so a mismatch is visible immediately rather than inferred from wrong data.

## Migration Plan

There is no existing system, so this is provisioning rather than migration.

1. Stand up PostgreSQL 16+ with the `vector` extension via Docker Compose for local development.
2. Apply baseline migrations, then run the seed routine to create a development pilot account.
3. Bring up the web application; verify all six locale-scoped routes render the shell in all three locales.
4. Start the MCP server in stdio mode against the mock provider; verify tool discovery and one call per tool.
5. Later feature changes add their own migrations and replace their module internals; none of them re-run this baseline.

Rollback at this stage is dropping the database and the new directories. `diseno/` is untouched throughout and remains the visual reference.

## Open Questions

- **Multi-tenancy, flight schools, and club-level roles — scheduled for exploration as the next step after this change.** The single-pilot ownership model chosen here is the smallest thing that is correct today, but the GA market this targets is substantially club- and school-based: shared fleets, instructors who need visibility into a student's assessments, maintenance officers who own the fleet's airworthiness data, and aircraft owned by an entity rather than a person. The questions to work through are whether the tenant is the club or the aircraft, whether a pilot can belong to several clubs, who owns a checklist run and a risk assessment when the aircraft is shared, and how far role granularity should go. Deciding this affects the ownership columns and every feature table that inherits them, so it should be settled before the feature changes add tables — but it is examined *after* this skeleton, when there is a concrete session and ownership model to reason against.
- **EAD/NM B2B access.** Can this project obtain EUROCONTROL credentials, and what are the redistribution terms for NOTAM text shown to pilots? This gates the weather capability's design and should be researched in parallel with the skeleton, not after it.
- **Embedding provider.** Deferred deliberately, but the choice sets the dimensionality and therefore the cost of changing course. Worth deciding before the corpus is populated rather than after.
- **Aerodrome reference data source.** The application needs a static-ish table of Iberian aerodromes (identifier, name, position, elevation, timezone). Whether that comes from an AIP extract, OurAirports, or a hand-curated seed is unresolved; the skeleton needs only enough for placeholder routing, so this can wait for the weather change.
- **Regional Spanish and Portuguese variants.** `es` and `pt` are single locales here. LATAM Spanish and Brazilian Portuguese aviation phraseology differ meaningfully, and splitting later means re-keying catalogs. The current structure supports adding variants without a rewrite, but the decision has a rising cost.
