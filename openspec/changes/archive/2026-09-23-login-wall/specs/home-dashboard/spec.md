# Spec Delta

## MODIFIED Requirements

### Requirement: The locale root renders the pre-flight brief
The locale root path of each supported locale SHALL render the home screen — the pre-flight brief — inside the application shell for a signed-in pilot, rather than the shared not-yet-available partial. The locale root is a protected route: an unauthenticated request MUST be redirected to the sign-in screen with the locale root preserved as the return target, and MUST NOT render any part of the brief.

#### Scenario: Signed-in pilot reaches the brief
- **WHEN** a signed-in pilot requests the locale root
- **THEN** the pre-flight brief renders inside the shell with the home destination marked as the current navigation item

#### Scenario: Anonymous visitor is sent to sign-in
- **WHEN** a request without a valid session targets the locale root
- **THEN** the server redirects to that locale's sign-in screen with the locale root as the return target
- **AND** the response body contains no greeting, flight intent, risk verdict, aircraft registration, or weather, maintenance, or flight value

#### Scenario: Localized per locale
- **WHEN** a signed-in pilot requests the locale root for each supported locale
- **THEN** every label, status word, and empty-state message on the screen is rendered from that locale's catalog
- **AND** no user-facing string on the screen is hardcoded in a template or handler

#### Scenario: Fragment and full page render the same partial
- **WHEN** a signed-in pilot requests the locale root with the `HX-Request` header
- **THEN** the response is the bare home partial without the shell
- **AND** it is the same partial the full-page response embeds

#### Scenario: Root redirect lands on the brief
- **WHEN** a signed-in pilot requests the application root
- **THEN** it redirects to a locale root that renders the pre-flight brief

## REMOVED Requirements

### Requirement: Signed-out visitors get an honest welcome state
**Reason**: The locale root is now behind the authentication wall. Anonymous visitors are redirected to the sign-in screen and never see a signed-out home state, so there is nothing for this requirement to govern. The no-leak guarantee it carried moves to the "Anonymous visitor is sent to sign-in" scenario above and to identity-access "Route protection".
**Migration**: Remove the anonymous branch from the home route and the welcome-state markup from the home template. Tests asserting the anonymous welcome now assert the redirect to sign-in. The `home.welcome_*` and `home.sign_in_cta` catalog keys are deleted from every locale.
