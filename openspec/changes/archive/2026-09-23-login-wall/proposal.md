# Proposal

## Why

The authentication wall is incomplete in two ways:

- **Routes are open.** Route protection is opt-in per route. The locale root (pre-flight brief), the weather page, the home weather-summary fragment and the documents placeholder all render to anonymous visitors. The weather page's lookups are also callable without an account.
- **Auth screens are unstyled.** The sign-in and registration screens are unstyled HTML strings built outside the view layer. They have no stylesheet, no design-system components and no phone layout, even though the app is authored mobile-first.

Pilots meet the sign-in screen first, often on a phone at the airfield, so it has to be usable one-handed at 320px. Public self-registration is not wanted yet, but the registration flow already works end to end and should stay wired so it can be switched on later without rework.

## What Changes

- **Deny-by-default route protection.**
  - Every application route requires an authenticated session unless it is on an explicit public list:
    - the application root redirect
    - the locale-scoped sign-in, registration and sign-out routes
    - static assets
    - the health endpoint
  - The protection applies to full pages and htmx fragments alike. It replaces reliance on each module remembering to attach the hook.
  - An eval test enumerates every registered route and proves that each one is either protected or on the public list.
- **BREAKING (behavior):** the locale root no longer renders anonymously. An anonymous visitor to `/es` or `/pt` is redirected to sign-in, preserving the return path. The signed-out welcome state on the home screen is removed.
- **Designed sign-in screen.**
  - It is rendered through the view layer as a Nunjucks template on a new shell-less auth layout, built from the existing Tailwind theme and design-system components.
  - It is localized, carries a locale switcher, and shows errors in text with `role="alert"`.
  - It is mobile-first: single column from 320px, 44px minimum touch targets, and correct `autocomplete`/`inputmode` attributes. It works without JavaScript.
- **Registration kept wired but hidden.**
  - A new configuration flag (`REGISTRATION_ENABLED`) defaults to off. While it is off:
    - the sign-in screen shows no registration link;
    - `GET` on the registration route renders a localized "sign-up is not available" notice;
    - `POST` on the registration route is rejected without creating an account.
  - The registration service, routes and template stay in place. The template gets the same design, so turning the flag on restores the full flow.
- **Sign-out lands on sign-in.** Sign-out now redirects to the sign-in screen instead of the locale root.
- **Removal:** the string-built auth pages (`src/server/auth/pages.ts`) are replaced by templates.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `identity-access`:
  - "Route protection" becomes deny-by-default with an explicit public list.
  - New requirements cover the sign-in screen's presentation (localized, mobile-first, accessible, shell-less) and self-registration being switchable and disabled by default.
  - "Successful sign-in" and "Sign-out" adjust to the new landing targets.
- `home-dashboard`:
  - "The locale root renders the pre-flight brief" no longer requires anonymous reachability.
  - "Signed-out visitors get an honest welcome state" is removed in favor of the sign-in redirect.

## Impact

- **Code:**
  - `src/server/auth/` (auth plugin, pages, require-auth hook)
  - `src/server/app.ts` (global protection hook and public-route marking)
  - `src/server/views/views.ts` (a shell-less layout option)
  - `src/views/` (new `auth-layout.njk` and sign-in/register templates)
  - `src/platform/i18n/chrome.ts` (new auth strings in es/pt/en)
  - `src/platform/config/schema.ts` and `.env.example` (`REGISTRATION_ENABLED`)
  - `src/modules/dashboard` (anonymous branch removed)
  - The per-module `requireAuth` wiring stays and becomes redundant but harmless.
- **Tests:**
  - Existing tests that render home, weather, the fragment or placeholders anonymously must sign in or assert the redirect.
  - New happy-path, sad-path and eval tests cover the wall, the sign-in screen and the registration flag.
- **Development workflow:** local access requires the seeded development pilot, or setting `REGISTRATION_ENABLED=true` to create one.
- **In-flight changes:** no conflict with `operator-ownership`, which creates a personal operator at registration. That path is unchanged when registration is enabled.
- **Assurance tier:** Tier 2 (operational record-keeping boundary). The wall gates access to pilot-owned records and Tier 1 weather lookups. Happy- and sad-path tests are required, and the route-enumeration eval is required as well because it is the guarantee behind "no protected content leaks".
