# Tasks

## 1. Configuration

- [x] 1.1 Add `REGISTRATION_ENABLED` (boolean from env string, default `false`) to `src/platform/config/schema.ts`. Log it at web startup, and document it in `.env.example` together with a note on the seeded development pilot. Verify with config tests: the default is `false`, `"true"` parses to `true`, and an invalid value is rejected with a structured error.

## 2. Deny-by-default route protection

- [x] 2.1 Declaration-merge `public?: boolean` into Fastify's route config. Move the sign-in URL builder (locale + `req.url` → `/<locale>/auth/sign-in?next=…`) into the auth plugin. Verify with `npm run typecheck`.
- [x] 2.2 Add the global `onRequest` protection hook in the auth plugin, registered after session resolution. It skips public routes, unmatched routes, and authenticated requests. Otherwise it returns 302 to sign-in, or `401` + `HX-Redirect` for htmx requests. Verify with auth-plugin tests that an unmarked test route redirects anonymously and renders when signed in.
- [x] 2.3 Mark the public routes with `config: { public: true }`: `/`, sign-in GET/POST, register GET/POST, sign-out, `/health/live`, `/health/ready`, and the static-assets route. Verify with the test "public routes stay reachable anonymously": each responds without a redirect to sign-in.
- [x] 2.4 Record every registered route through `onRoute`, then add the eval "protection is deny-by-default". It builds the full app, enumerates every GET/POST route, and asserts that every non-public route redirects an anonymous request to sign-in and that the public set equals the expected list exactly. Verify that the eval passes, and that it fails when the `public` flag is temporarily added to one module route.
- [x] 2.5 Sad-path tests for previously open pages. Anonymous requests to the locale root, the weather page with and without `?icao=`, the `weather-summary` fragment (normal request and htmx request), and the documents placeholder all redirect or return `HX-Redirect`, and the body contains no METAR/TAF/NOTAM text. A spy weather client records zero calls.
- [x] 2.6 Test the return-target round trip: an anonymous request to `/es/<weather segment>?icao=SKBO`, followed by a sign-in POST with the returned `next`, lands on that exact path and query.

## 3. View layer: auth layout

- [x] 3.1 Add `layout: 'shell' | 'auth'` to `ViewRenderer.render` (default `'shell'`) and create `src/views/auth-layout.njk`. The layout carries the same `<head>` (stylesheet, viewport, `lang`), the brand block and the auth locale switcher, and has no nav, drawer, tab bar or active-aircraft control. Verify with views tests: the `auth` layout omits every destination href, and an `HX-Request` still returns the bare partial.
- [x] 3.2 Make the not-found handler use the `auth` layout for anonymous requests. Verify with a test that an anonymous unknown path returns 404 with no shell navigation, and that a signed-in unknown path still renders inside the shell.

## 4. Sign-in and registration screens

- [x] 4.1 Add the new auth catalog keys to `src/platform/i18n/chrome.ts` for es/pt/en: sign-in subtitle, registration-unavailable title and message, back-to-sign-in, and locale-switch label. Verify with the catalog tests that every key exists in all three locales.
- [x] 4.2 Create `src/views/pages/auth-sign-in.njk` following design decision 3:
  - a card, a `role="alert"` error slot referenced through `aria-describedby`;
  - labelled email/password fields with `autocomplete`/`inputmode`/`autocapitalize` set, `text-base`, and `min-h-11`;
  - a full-width submit control;
  - the register link rendered only when enabled.

  Verify with the render test "localized sign-in screen" for each locale.
- [x] 4.3 Create `src/views/pages/auth-register.njk` (display name, email, and a `new-password` field with `minlength="8"`) and the disabled-notice variant. Verify with render tests for both states.
- [x] 4.4 Switch the auth plugin's GET/POST handlers to `app.views.render(req, { fragment, locals, layout: 'auth' })`, delete `src/server/auth/pages.ts`, and redirect sign-out to `/<locale>/auth/sign-in`. Verify that the existing auth-plugin tests (sign-in, failed sign-in, rate limit, fixation, CSRF, sign-out) pass after they are updated to the new redirect target.
- [x] 4.5 Gate registration on `registrationEnabled`:
  - GET renders the notice with status 200 and no form;
  - POST (after CSRF) returns 403 with the notice and creates no account and no session;
  - when the flag is enabled, behavior is unchanged.

  Verify with sad-path tests (the pilots store count is unchanged and no `ga_session` cookie is set) and a happy-path test with the flag enabled.
- [x] 4.6 Test that the sign-in page has no registration link when the flag is off, that the link is present when it is on, and that the register screen links back to sign-in.
- [x] 4.7 Test the locale switch on the sign-in screen: the pt link targets `/pt/auth/sign-in` with the same `next`, and an unsafe `next` (`//evil`) is dropped.

- [x] 4.8 Brand the app as PRE-VUELO (was PREFLIGHT) in the shell and the auth layout, and add an SVG favicon (`src/assets/favicon.svg`, copied to `dist/assets` by `assets:build`) linked from both layouts. Verify with auth-screens tests (brand and favicon link present, old name absent) and the wall test (the favicon is served without a session).

## 5. Dashboard

- [x] 5.1 Remove the anonymous branch from `src/modules/dashboard/index.ts`, the welcome markup from `pages/home.njk`, and the `home.welcome_title`, `home.welcome_message` and `home.sign_in_cta` keys from every catalog. Verify that `src/modules/dashboard/index.test.ts` asserts the redirect for anonymous requests in place of the welcome state, and that `rg "welcome_title|sign_in_cta" src` returns nothing.

## 6. Existing test suite migration

- [x] 6.1 Add a shared test helper that seeds a pilot in the fake stores, performs sign-in, and returns the session cookie. Verify that it is used by at least one test in each of `modules.test.ts`, `registry.test.ts`, `shell.test.ts` and `e2e.test.ts`.
- [x] 6.2 Update every test that rendered home, weather, the weather-summary fragment or placeholders anonymously so that it signs in through the helper, or asserts the redirect where the test is about anonymous behavior. Verify with the web test suite, green.

## 7. Evals (standing rules)

- [x] 7.1 Touch-target eval for the auth screens: every `input`, `button` and `a` in the rendered sign-in page, the register page (flag on) and the disabled notice carries `min-h-11` or `touch-target`. Verify that the eval passes, and that it fails if one class is removed.
- [x] 7.2 Phone-layout eval: the auth templates contain no fixed width wider than 320px (no `w-[…px]` or `min-w-*` above 320px) and use a single-column container at the base breakpoint. Verify that the eval passes.
- [x] 7.3 Provenance eval: the rendered sign-in, register and not-available pages contain no METAR/TAF/NOTAM/SIGMET patterns, aircraft registrations, or prototype sample strings. Reuse the existing forbidden-pattern list. Verify that the eval passes.

## 8. Verification gate (to be run by the developer, per AGENTS.md rule 3)

- [x] 8.1 Record which scenarios of `identity-access` ("Route protection", "Sign-in screen presentation", "Self-registration is switchable and disabled by default", "Session authentication → Sign-out") and `home-dashboard` ("Anonymous visitor is sent to sign-in") are covered by which tests, following the pattern of the archived meteorologia-page tasks, group 7.

  Traceability (none of these tests have been run yet; they are verified by 8.2):

  | Spec scenario | Test(s) |
  | --- | --- |
  | identity-access › Route protection › Unauthenticated request to a protected route | `wall.test.ts`: "a route that declares nothing is protected…"; `modules.test.ts`: "every destination redirects an anonymous request…" |
  | › Return to the originally requested route | `wall.test.ts`: "the requested path and query survive the sign-in round trip"; `auth-plugin.test.ts`: "the return path is honored…" |
  | › Protected fragment request | `wall.test.ts`: "an anonymous fragment request to an undeclared route gets HX-Redirect…"; `dashboard/index.test.ts`: "anonymous request for the weather-summary fragment…" |
  | › Previously open pages are protected | `wall.test.ts`: "previously open pages are walled and perform no weather lookup…" |
  | › Public routes stay reachable | `wall.test.ts`: "public routes stay reachable anonymously"; `health.test.ts`, `locale-routes.test.ts` |
  | › Protection is deny-by-default | `wall.test.ts`: "eval: protection is deny-by-default across every registered route" |
  | › Unknown paths are not revealed | `errors.test.ts`: "an anonymous unknown path returns a 404 with no shell navigation…" |
  | identity-access › Session authentication › Sign-out | `auth-plugin.test.ts`: "sign-out destroys the server-side session…"; `e2e.test.ts` (live DB) |
  | identity-access › Sign-in screen presentation (all 7 scenarios) | `auth-screens.test.ts`: localized screen + layout, htmx partial, input semantics, failed sign-in error, signed-in redirect, locale switch; evals 7.1–7.2 |
  | identity-access › Self-registration is switchable and disabled by default (all 6 scenarios) | `auth-screens.test.ts`: disabled by default, no link, notice, 403 refusal, enabled round trip, touch/phone evals; `config.test.ts`: "REGISTRATION_ENABLED defaults to false…" |
  | home-dashboard › The locale root renders the pre-flight brief › Anonymous visitor is sent to sign-in | `dashboard/index.test.ts`: "anonymous visitor to the locale root is sent to sign-in…" |
  | home-dashboard › Fragment and full page render the same partial | `dashboard/index.test.ts`: "the HX-Request response is the bare partial…" (now signed in) |
- [x] 8.2 The developer runs `npm run check` and `openspec validate login-wall --strict`. Both pass.
- [x] 8.3 Manual check by the developer: run the app and view `/es/auth/sign-in` at 320px, 768px and 1280px in the browser's device toolbar, with JavaScript disabled. Confirm there is no horizontal scroll, the keyboard does not cover submit on a phone, and sign-in lands on the requested page.
