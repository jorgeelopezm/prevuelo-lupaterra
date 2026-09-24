## Why

The locale root (`/es`, `/en`, `/pt`) — the target of the root redirect and the first screen every pilot sees — is still the shared placeholder: it renders "not yet available" and nothing else. Meanwhile the capabilities it is meant to summarize are now real and tested: `weather-notams-page` (METAR/TAF/NOTAM via the MCP client), `preflight-risk-assessment` (flight intents, scored assessments, verdicts), and `aircraft-fleet` (aircraft, logbook, maintenance, W&B, engine data). The pilot can reach each of them, but has no single pre-flight brief that answers the only question that matters before a flight: *go or no-go, and what needs my attention?* This change replaces the placeholder with that brief, built from the data those capabilities already own.

The prototype (`diseno/src/App.tsx`, `Dashboard`) defines the visual target: a greeting and route line, a go/no-go verdict chip, four status tiles, a NOTAM attention band, and three stat cards. Its values are sample data. This change ports the **layout and information hierarchy**, and sources every value from real per-pilot data or states its unavailability in text — never a favorable placeholder.

## What Changes

- Replace `dashboardModule`'s `registerPlaceholderScreen` with a real home screen registered at the locale root for each supported locale.
- **Signed-out state**: the locale root stays publicly navigable. Anonymous visitors get the shell plus a welcome card and a sign-in call to action — no tiles, no operational values, no fabricated identity.
- **Signed-in brief**, assembled per request from repositories the pilot already owns:
  - Greeting with the pilot's display name and a time-of-day salutation, plus a localized date line.
  - The pilot's **next flight intent** (soonest planned date on or after today, from `flight-intent`): route, aircraft, planned date. When none exists, an onboarding prompt to plan one instead of a fabricated route.
  - A **go/no-go verdict chip** derived from the latest risk assessment attached to that flight intent (verdict band, overall score, computed-at time). When the intent has no assessment, the chip reads "not assessed" and links to start one — it never defaults to GO.
  - Four **status tiles** — Weather & NOTAMs, Risk Assessment, Aircraft Status, Checklists — each linking to its destination. Every tile renders either a real value with its source, or an explicit not-available state. The Checklists tile states that the capability is not yet available (the `checklists` module is still a placeholder), rather than showing a completion count.
  - A **NOTAM attention band** listing NOTAMs returned for the flight intent's departure aerodrome, with the same provenance and mock-data caveat contract the weather screen already enforces. Rendered only when NOTAMs are actually returned.
  - Three **stat cards**: usable fuel from the aircraft's W&B profile, the nearest-due maintenance item, and the last logged flight for the active aircraft.
- **Weather and NOTAM content loads as an htmx fragment** (`hx-get` on load) against its own route, so the home page paints from database data immediately and an MCP timeout or provider failure degrades only those two regions — it never delays or breaks the brief.
- **Deliberate deviation from the prototype**: the prototype's "Fuel on Board — 38.5 USG" has no data source (the application has no live fuel-quantity reading; `src/platform/risk/aircraft-snapshot.ts` documents this). That card is relabeled to the W&B profile's **usable fuel capacity**, with a not-available state when the aircraft has no W&B profile.
- **i18n**: replace the unused prototype sample-value keys in `dash.*` (`dash.title` = "Good morning, Mike.", `dash.subtitle` = a KBOS→KORH route, `dash.fuel_value`, `dash.mx_value`, `dash.last_flt_*`, `dash.notam_text`, …) with label-and-message-only keys across `es`/`en`/`pt`. After this change no catalog holds an operational-looking sample value for this screen.
- **Tests**: happy path (each region renders its real value), sad path (unauthenticated, no aircraft, no flight intent, no assessment, MCP failure, missing W&B/maintenance/flight data), and evals (no operational value without provenance; no fabricated favorable default; 44px touch targets; fragment and full page render the same partial; all strings from the catalogs).

## Capabilities

### New Capabilities
- `home-dashboard`: the locale-root pre-flight brief — signed-out welcome state; next-flight-intent header; go/no-go verdict derived from the latest risk assessment; the four status tiles; the lazily loaded weather and NOTAM regions with provenance; the three aircraft stat cards; and the empty/unavailable state required for every region that has no data.

### Modified Capabilities
- `feature-scaffolding`: the `dashboard` module's `register` callback no longer uses `registerPlaceholderScreen` — the locale root resolves to the real home screen. The placeholder contract still governs the remaining placeholder modules (`checklists`, `documents`), and the no-fabrication/provenance rule now applies to the home screen's own values.

## Impact

- **Design assurance tier**: mixed, and the stricter bar governs where the two overlap. The weather/NOTAM regions and the go/no-go verdict are **Tier 1 (safety-adjacent advisory)** — the no-fabrication rule is mandatory and test-enforced, every upstream failure yields a structured error rather than substituted data, and every operational-looking value carries provenance. The surrounding chrome (greeting, navigation tiles, layout) is **Tier 3 (informational)**.
- **Affected code**: `src/modules/dashboard/index.ts` (placeholder → real registration, plus a new fragment route and a view-model service module), new `src/views/pages/home.njk` and home partials, `src/platform/i18n/catalogs/{es,en,pt}.json` (replace the `dash.*` sample values with labels), `src/modules/modules.test.ts` (exclude `dashboard` from the placeholder-only eval, as `weather` and `fleet` already are).
- **Reused without modification**: `flight-intent-repo`, `risk-assessment-repo`, `scoring` (`verdictForScore`), `aircraft-repo` (`getActiveAircraft` via the existing `activeAircraftRegistration` request decoration), `flight-repo` (`lastForAircraft`, `aircraftTotals`), `maintenance-repo` + `deriveMaintenanceStatus`, `wb-repo`, `weather-mcp` client, and the existing card/badge/`emptyState` partials.
- **No new dependencies, no schema migration, no configuration change.** The screen is read-only: it issues no writes and adds no new tables or columns.
- **Out of scope**: a real checklists capability (the tile links to the existing placeholder); editing a flight intent or running an assessment from the home screen (both link out to their own screens); any fuel-quantity tracking capability; auto-refresh or polling of the weather region.
