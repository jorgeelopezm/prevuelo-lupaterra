# Design

## Context

See `proposal.md` for the motivation. This section covers the current state that shapes the approach.

- **Opt-in route protection.** `createRequireAuthHook` (`src/server/auth/auth-plugin.ts`) is attached per route as `{ onRequest: requireAuth }`.
  - Fleet, risk and checklists attach it everywhere.
  - The dashboard (locale root and `weather-summary` fragment), weather and the shared placeholder screen (`src/modules/shared/placeholder.ts`, used by documents) do not.
  - The dashboard is public on purpose, because the current `home-dashboard` spec requires it.
- **Session resolution.** The auth plugin's `onRequest` hook resolves the session cookie into `req.pilot` / `req.isAuthenticated` for every request, before any route-level hook runs.
- **String-built auth pages.** `src/server/auth/pages.ts` builds the sign-in and registration documents as template strings. They have no stylesheet link, no Nunjucks and no design-system components.
- **Shell-only renderer.** Every other page goes through `app.views.render(req, { fragment, locals })` (`src/server/views/views.ts`), which always wraps the partial in `layout.njk`, the full shell with nav, drawer and tab bar.
- **Shell-wrapped 404.** The not-found handler (`src/server/views/plugin.ts`) renders `error/404.njk` inside the shell.
- **Auth strings.** They live in `src/platform/i18n/chrome.ts` (es/pt/en).
- **Existing style building blocks.** Tailwind v4 theme tokens (`bg-canvas`, `bg-surface`, `border-edge`, `bg-accent`, `font-data`), the `.touch-target` utility, and the `card` / `pageHeader` macros in `partials/components.njk`.
- **No reference design.** The `diseno/` prototype has no auth screen (confirmed with the developer). The design derives from the ported design system.

## Goals / Non-Goals

**Goals:**
- The route table is protected by construction: forgetting a hook can no longer expose a route.
- The sign-in screen goes through the same view layer and design system as the rest of the app.
- Registration code stays compiled, tested and reachable behind one flag.

**Non-Goals:**
- Password reset, email verification, "remember me", social or SSO login, or invite flows.
- Any change to session, CSRF or rate-limit mechanics beyond the redirect targets.
- A client-side password-visibility toggle or any other auth-screen JavaScript. The screen must work with scripting off, and a toggle can come later as progressive enhancement.
- Removing the now-redundant per-route `requireAuth` hooks in fleet/risk/checklists. That cleanup is optional and out of scope, so the diff stays reviewable.

## Decisions

### 1. Deny-by-default via one global `onRequest` hook plus a route-config `public` flag

- **The hook.** The auth plugin registers a second root-level `onRequest` hook right after session resolution. It reads `req.routeOptions.config.public`:
  - If the flag is set, the request passes.
  - If the route matched nothing (`req.routeOptions.url` undefined, which is the not-found path), the request passes.
  - If the visitor is authenticated, the request passes.
  - Otherwise the hook runs the existing `createRequireAuthHook` logic: 302 to sign-in, or `401` + `HX-Redirect` for htmx requests.
- **Public routes.** They declare `config: { public: true }`:
  - `/`
  - `/:locale/auth/sign-in` (GET/POST)
  - `/:locale/auth/register` (GET/POST)
  - `/:locale/auth/sign-out`
  - `/health/live`
  - `/health/ready`
  - the static-assets route(s)
- **Sign-in URL building.** The sign-in URL builder moves into the auth plugin, based on `req.locale` and `req.url`, so every protected route uses the same return-target logic. Modules keep calling `makeSignInUrlBuilder` for their redundant per-route hooks.
- **Typing.** A `FastifyContextConfig` declaration-merge adds `public?: boolean`.

**Alternatives considered:**
- *Attach `requireAuth` in each remaining module.* Rejected: it keeps the failure mode that caused this bug.
- *A path-prefix allowlist regex.* Rejected: it drifts from the real route table and is easy to get wrong with locale segments.
- *Protect inside the registry by wrapping each module's `register` in an encapsulated context with the hook.* Rejected: it misses routes registered outside modules (health, root redirect) and makes "public inside a module" awkward.

**Why the route config flag:** it sits beside the route it describes, and it can be enumerated. An `onRoute` hook records every registered route and its `public` flag, and the eval test iterates them.

### 2. A shell-less `auth` layout selected through the existing renderer

- **Renderer option.** `ViewRenderer.render` gains an optional `layout: 'shell' | 'auth'` (default `'shell'`).
  - `'auth'` embeds the partial in a new `src/views/auth-layout.njk`.
  - Its `<head>` matches the shell (stylesheet, viewport, `lang`). The body has no nav, drawer, tab bar or active-aircraft control.
  - The `HX-Request` fragment rule is unchanged: an htmx request still gets the bare partial.
- **Page templates.** Sign-in and registration become `pages/auth-sign-in.njk` and `pages/auth-register.njk`. Nunjucks autoescaping replaces the hand-written `escapeHtml`, and `src/server/auth/pages.ts` is deleted.
- **Not-found for anonymous visitors.** The not-found handler uses the `auth` layout when `!req.isAuthenticated`, so an anonymous 404 does not render the shell's navigation.
- **Alternative considered:** a second, parallel renderer for auth pages. Rejected: it duplicates locale, `lang` and switcher logic and breaks "one renderer".

### 3. Sign-in screen composition (mobile-first)

- **Page frame.**
  - The body is `bg-canvas min-h-dvh`.
  - A single centered column is `w-full max-w-sm mx-auto px-4`, with `pt-[max(2rem,env(safe-area-inset-top))]` so the notch is respected.
  - The column is vertically centered from `sm:` up and top-aligned on phones, so the on-screen keyboard does not cover the submit control.
- **Page structure.**
  - **Brand block:** the same plane-icon tile and "PRE-VUELO" wordmark as the sidebar, reused from `partials/icons.njk`.
  - **Form card:** a `card('p-6')` holding a page title (`h1`) and a one-line localized subtitle.
  - **Error slot:** `<p role="alert" id="auth-error">` with an alert icon and text. It is shown in text, never color-only, and inputs reference it through `aria-describedby`.
  - **Fields:** stacked label-above-input fields. Inputs are `w-full min-h-11 text-base`, and the 16px font stops iOS zooming on focus.
    - Email: `type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false"`.
    - Password: `autocomplete="current-password"`.
  - **Submit:** a full-width button, `min-h-11 bg-accent`.
  - **Registration link:** rendered only when the flag is on.
  - **Footer:** the locale switcher. It reuses `switcherLinks`, but the target is the same auth path with `next` preserved (see decision 5).
- **Widths.**
  - At 320px everything is one column with no fixed widths.
  - At `sm:` and above the card keeps `max-w-sm`.
  - At `lg:` a decorative side panel is **not** added, which keeps one template path and no operational-looking imagery.
- **Registration screen.** It reuses the same frame with the display-name and `new-password` fields.
- **Disabled notice.** A `card` with an `emptyState`-style message and a "back to sign-in" link.

### 4. Registration flag

- **Config field.** `REGISTRATION_ENABLED` is added to the shared Zod schema as a boolean from env string (`"true"`/`"false"`) with default `false`. It is logged at startup with the selected providers, and it is not a secret.
- **Plumbing.** It is passed into `AuthPluginOptions.registrationEnabled`.
- **Routes while the flag is off:**
  - `GET /:locale/auth/register` renders the disabled notice with status 200.
  - `POST /:locale/auth/register` runs CSRF first (unchanged), then returns 403 with the notice before any parsing or `registerPilot` call.
- **Routes while the flag is on:** current behavior, on the new template.
- **Why 200 for the GET:** the route exists and describes itself honestly, and a 404 would misreport a real route as missing. POST returns 403 because an action is being refused.
- **Alternative considered:** don't register the routes at all when the flag is off. Rejected because "leave the wiring" means the routes stay registered and testable, and because tests couldn't cover both states in one process without rebuilding the app.

### 5. Redirect targets

- **Sign-out** redirects to `/${locale}/auth/sign-in`, with no `next`. It stays public so an expired session can still post it.
- **Sign-in with no `next`** still goes to `/${locale}`.
- **The return target** is `req.url` (path + query), passed through the existing `safeReturnPath`, so `/es/meteorologia?icao=SKBO` survives the round trip.
- **The auth locale switcher** links to `/<other>/auth/sign-in?next=<same next>`. The `next` path is kept verbatim even if it names the other locale's segment, and it is still validated as same-origin.

### 6. Dashboard

The anonymous branch in `src/modules/dashboard/index.ts` and the welcome markup in `pages/home.njk` are removed. After this change `req.pilot` is non-null for both dashboard routes, so the `weather-summary` fragment's `if (req.pilot)` guard becomes an assertion. The `home.welcome_title`, `home.welcome_message` and `home.sign_in_cta` catalog keys are deleted.

## Risks / Trade-offs

- **[Risk] A route that should be public (for example a future webhook) is silently walled.** → Mitigation: fail-closed is the intended direction. The route-enumeration eval lists the public set explicitly, so adding to it is a visible, reviewed diff.
- **[Risk] The htmx `HX-Redirect` 401 inside a lazily loaded fragment on an expired session.** → This is already handled by the existing hook; the only difference is that it now also covers the weather-summary fragment. It is covered by a sad-path test.
- **[Risk] Many existing tests render home, weather or placeholders anonymously and will start receiving 302s.** → Mitigation: add one shared test helper that signs in against the fake pool / stores and returns a cookie, then update those tests in one task group before the new tests.
- **[Risk] Developers without a seeded pilot are locked out locally.** → Mitigation: the dev seed already creates a pilot. Document it in `.env.example` next to `REGISTRATION_ENABLED`.
- **[Trade-off] The per-module `requireAuth` hooks become redundant double checks.** → Accepted for this change, since they cost one boolean check. Removing them is a follow-up.
- **[Trade-off] Asset routes must carry `public: true`, otherwise the auth screen loads unstyled.** → Covered by the "Public routes stay reachable" test, which requests `/assets/app.css` anonymously when assets are built. The static plugin is skipped when assets are absent, so the test asserts "not a redirect" rather than 200.

## Migration Plan

- There is no data migration. Deploy is a normal release.
- **Default behavior after deploy:** registration off and everything walled. Operators who need sign-up set `REGISTRATION_ENABLED=true`.
- **Rollback:** revert the release. There is no persisted state to undo.
