## Context

The `dashboard` module owns the locale root (`destinationPath('dashboard', locale)` → `/es`, `/en`, `/pt`) and is the target of the root redirect. It currently delegates to `registerPlaceholderScreen`, so the first screen a pilot sees says only "not yet available."

Everything the brief needs already exists behind repository interfaces, and this change adds no new persistence:

| Region | Source already in the repository |
| --- | --- |
| Pilot identity | `req.pilot` (auth plugin) |
| Active aircraft | `req.activeAircraftRegistration` (`active-aircraft-plugin.ts`), `aircraftRepo.getActiveAircraft` |
| Next flight intent | `flightIntentRepo.listForPilot` |
| Verdict + score | `riskAssessmentRepo.listForFlightIntent`, `verdictForScore` |
| Aircraft status | `readAircraftSnapshot` (`src/platform/risk/aircraft-snapshot.ts`) |
| Maintenance | `maintenanceRepo.list` + `deriveMaintenanceStatus` + `flightRepo.aircraftTotals` |
| Last flight | `flightRepo.lastForAircraft` |
| Usable fuel | `wbRepo.get(...).usableFuelQty` |
| METAR / NOTAM | `context.weatherMcp` (`getMetar`, `getNotams`) |

Binding constraints from `AGENTS.md` and the existing specs:

- **No operational-looking data without provenance.** Weather values carry the provider, issued/observed time, retrieved time, cache state, and the mock-data caveat — the same contract `partials/weather-results.njk` already renders.
- **No fabricated favorable defaults.** Every region is either a real value or an explicit, text-stated unavailable state. Unavailability is never signalled by color alone.
- **Fragment convention.** One handler serves both the full page and the htmx fragment via `app.views.render(req, { fragment, locals })`; the fragment is always the same partial the page embeds.
- **Mobile-first.** Authored at 320px, widened with `lg:`; every interactive control keeps a 44px minimum touch target (test-enforced).
- **No SPA.** Server-rendered Nunjucks, htmx for swaps, no client router, no hydration.

The visual reference is `diseno/src/App.tsx` → `Dashboard` (read-only; never modified).

## Goals / Non-Goals

**Goals:**

- Replace the locale-root placeholder with a pre-flight brief that reproduces the prototype's layout and information hierarchy.
- Source every displayed value from real per-pilot data, or state its unavailability in text.
- Keep the page's first paint independent of the weather MCP server's availability and latency.
- Keep the locale root publicly navigable, with an honest signed-out state.
- Add no dependency, no migration, and no configuration field.

**Non-Goals:**

- Implementing the checklists capability. Its tile links to the existing placeholder and says so.
- Any write action from the home screen (creating a flight intent, answering a questionnaire, logging a flight). Every action links out to the owning screen.
- Fuel-quantity tracking. The prototype's "Fuel on Board" is not implementable and is not faked.
- Auto-refresh, polling, or streaming of the weather region. It loads once per page load.
- Multi-aircraft or multi-intent summaries. The brief covers one active aircraft and one next flight intent.

## Decisions

### 1. The locale root stays public; the screen branches on authentication

`GET /:locale` does **not** get `createRequireAuthHook`. When `req.pilot` is null the handler renders the same `pages/home.njk` partial with `signedIn: false`, producing a welcome card and a sign-in link, and nothing else.

*Why:* the shell already renders a sign-in affordance for anonymous requests, and the root redirect (`/` → `/es`) has to land somewhere navigable. *Alternative rejected:* requiring auth at the root, as `fleet` and `risk` do — it leaves the application with no public entry point, and would turn every anonymous shell test into a redirect assertion.

### 2. The weather tile and the NOTAM band load as one htmx fragment

The home handler returns without awaiting any MCP call. The weather tile and the NOTAM band are one region in the page, rendered as a placeholder skeleton with `hx-get="<home>/weather-fragment"`, `hx-trigger="load"`, `hx-swap="outerHTML"`. A second route on the dashboard module serves that fragment: it resolves the departure ICAO from the next flight intent, calls `getMetar` and `getNotams` concurrently, and renders `partials/home-weather.njk`.

*Why:* the MCP client connects lazily on first call and has a configured timeout; awaiting it inline makes the entire brief — including the risk verdict and aircraft status, which are purely local — hostage to an upstream that may be slow or down. Splitting the call boundary confines the blast radius to the region the failure is actually about.

*No-JavaScript behavior:* when htmx does not run, the region keeps its server-rendered content — a text link to the weather screen for the departure aerodrome. It is never a spinner that never resolves, and never an empty box.

*Alternatives rejected:* inline blocking render (couples the whole page to MCP latency); omitting weather from home entirely (the NOTAM attention band is the prototype's single strongest signal and the reason a pilot opens this screen).

### 3. "Next flight intent" is selected in the view-model service, not in SQL

`flightIntentRepo.listForPilot` returns the pilot's intents; the home service picks the one with the soonest `plannedDate` on or after the current UTC date, and falls back to `null` when there is none.

*Why:* it reuses an existing, owned, tested query rather than adding a repository method and a migration-adjacent SQL path for a single screen. The per-pilot intent count is small (one row per planned flight), so the selection is trivially cheap. *Revisit if* an intent-history capability makes the list unbounded — at that point the selection moves into the repository as `nextForPilot`.

### 4. The verdict chip has three states, and "unknown" is never "GO"

- **Assessed** — the newest `RiskAssessmentRecord` for the selected intent, by `submittedAt`: verdict band (`low` / `medium` / `high` → tone), `overallScore`, and the localized `submittedAt`.
- **Not assessed** — an intent exists but has no assessment: a neutral-toned chip reading "not assessed", linking to `riskPath('assessment', locale, [intentId, 'new'])`.
- **No intent** — no chip at all; the header shows the plan-a-flight prompt instead.

*Why:* an absent assessment is precisely the case where a green chip would be most harmful. The neutral tone plus explicit text satisfies the standing rule that unavailability is stated in text, never by color.

### 5. Each of the four tiles owns its own availability, and the Checklists tile is honest

The tiles render from a uniform view-model shape — `{ href, labelKey, status: { tone, labelKey } | null, detail: string | null, detailKey: string | null, sub: string | null }` — where a `null` status/detail renders the tile's not-available text instead of a badge. The Checklists tile is permanently in that state for this change, carrying the shared `shell.placeholder_title` message; it does not show `0 / 22 items`.

*Why:* one shape for four tiles keeps the template free of per-tile branching, and makes "this tile has no data" the same code path as "this capability does not exist yet" — which is what the reviewer needs to be able to check at a glance.

### 6. The third stat card becomes usable fuel capacity, explicitly labeled

`wbRepo.get(pilotId, aircraftId).usableFuelQty` with the profile's `massUnit`, labeled as the aircraft's usable fuel **capacity** — not fuel on board, and not an endurance estimate. `null` profile or `null` quantity renders the not-available state with a link to the W&B form.

*Why:* the application has no live fuel-quantity reading; `aircraft-snapshot.ts` already documents this where it derives `fuelStatus` as a best-effort proxy. Displaying a capacity as though it were a current quantity is exactly the fabrication the standing rule forbids, and endurance derived from it would compound the error. *Alternatives rejected:* pilot-currency card (loses the aircraft-oriented grouping of the three cards); dropping to two cards (leaves the prototype's three-column grid unbalanced for no gain over an honest third card).

### 7. Presentation logic lives in `src/modules/dashboard/service.ts`, mirroring `weather/service.ts`

The module's `index.ts` stays a thin registration + route file. A `buildHomeViewModel({ pilot, aircraft, repos, locale, now })` function assembles the whole brief from injected repository interfaces and returns a plain, already-localized-key view model; `buildHomeWeatherViewModel({ weatherMcp, icao, locale })` does the same for the fragment.

*Why:* it matches the shape the weather module already established, and it makes the interesting logic (next-intent selection, verdict resolution, nearest-due maintenance, every not-available branch) testable against fakes with no Fastify app and no database.

### 8. Time-of-day greeting is computed from UTC, with the salutation from the catalogs

Three catalog keys (`home.greeting_morning` / `_afternoon` / `_evening`), selected by the UTC hour, interpolated with `pilot.displayName`.

*Why:* the application has no per-pilot timezone field, and inventing one for a greeting is not worth a migration. UTC is the timebase every other value on this screen already uses (`intlUtcDateTime`), so the greeting is at least consistent with the rest of the brief. *Revisit when* a pilot-timezone preference lands.

### 9. The `dash.*` catalog keys are replaced, not extended

The existing `dash.*` entries in `es`/`en`/`pt` are prototype sample values (`"Good morning, Mike."`, `"KBOS → KORH · C172S N4521G · ETD 10:30Z"`, `"38.5 USG"`, `"1 NOTAM Requires Attention"`, a full NOTAM text). They are unused by any template. They are removed and replaced with a `home.*` namespace of labels, messages, and empty-state text only — no value strings.

*Why:* leaving sample values in the catalogs invites exactly the leak the placeholder eval test was written to catch, and a future template can reference a key that silently renders a Boston NOTAM. The eval added by this change asserts that no catalog value in the `home.*` namespace matches an operational value shape.

### 10. `dashboard` joins `weather` and `fleet` as an exclusion in the placeholder-only eval

`src/modules/modules.test.ts` asserts every placeholder response is free of operational values and prototype sample strings, already skipping `weather` and `fleet`. `dashboard` is added to that exclusion, and the home screen gets its own no-fabrication evals in `src/modules/dashboard/index.test.ts` — anonymous and signed-in-with-no-data responses contain no METAR/NOTAM/score/registration value, and a failed MCP call renders an error box rather than any report text.

*Why:* the placeholder test's purpose is to guard screens that are *supposed* to be empty. Broadening its forbidden-pattern list to tolerate a real screen would weaken it for `checklists` and `documents`, which still need it.

## Risks / Trade-offs

- **The weather fragment is a second route that can drift from the weather screen's provenance rendering** → both render `partials/weather-results.njk`'s `provenanceLine` / `errorBox` macros. No new provenance markup is authored for this screen; an eval asserts the fragment's METAR output contains a provenance line.
- **An MCP failure on a page a pilot may read quickly could be mistaken for "no NOTAMs"** → the failed state renders the localized error box with the reason, in the band's place, and is visually distinct from the "no NOTAMs in force" state, which has its own text. Silence is never rendered for a failure.
- **The htmx-loaded region is invisible to a no-JavaScript client** → the server-rendered content of that region before the swap is a real, useful link to the weather screen for the departure aerodrome, not a skeleton. Covered by a test asserting the un-swapped page body contains that link.
- **Four to seven repository reads per home request, all for one pilot** → the local reads are issued concurrently with `Promise.all`, and all are single-row or small-list queries already indexed by `pilot_id`. The MCP call, the only genuinely slow one, is off the critical path by decision 2.
- **UTC-based greeting will read wrong for a pilot in a distant timezone** → accepted; the greeting is chrome, and no value on the screen depends on it. Decision 8 names the trigger to revisit.
- **Removing `dash.*` keys breaks anything that referenced them** → nothing does; `grep` across `src/**` finds references only in a `catalog.test.ts` comment, which is updated with the key rename.

## Migration Plan

No data migration, no schema change, no configuration change. The change is a route-behavior replacement plus catalog edits, deployed in one step:

1. Land the service, views, catalog changes, and tests together.
2. `npm run check` green (typecheck, lint, format, web tests, MCP tests).
3. **Rollback**: revert the commit. The locale root returns to the shared placeholder; no state written by this change needs undoing, because it writes none.

## Open Questions

- Should the brief prefer the pilot's **active aircraft** or the **flight intent's aircraft** when they differ? This design uses the flight intent's aircraft for the header and verdict, and the active aircraft for the three stat cards — matching each region's own semantics. If a pilot commonly plans a flight in a non-active aircraft, the stat cards would describe a different airframe than the route line, and the two should be reconciled to the intent's aircraft. Flagged for review during implementation; the view model takes both ids, so the choice is one line in the service.
- Should the NOTAM band cover the **destination** aerodrome as well as the departure? The prototype shows departure only. Destination NOTAMs are arguably as decision-relevant, at the cost of a second call and a busier band. Deferred; the fragment route takes a list of ICAOs so adding the destination later needs no route change.
