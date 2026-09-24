# Spec Delta

## MODIFIED Requirements

### Requirement: Session authentication
The system SHALL authenticate pilots with a server-side session referenced by an opaque cookie. The cookie MUST be `HttpOnly`, `SameSite=Lax`, and marked `Secure` whenever the application is served over HTTPS. The session identifier MUST NOT encode account data.

#### Scenario: Successful sign-in
- **WHEN** a pilot submits credentials matching a stored account
- **THEN** a new session is created, its identifier is set as a cookie with the required attributes, and the pilot is redirected to their locale's home route

#### Scenario: Failed sign-in
- **WHEN** a pilot submits credentials that do not match any account
- **THEN** the response reports a generic failure that does not reveal whether the email exists
- **AND** no session is created

#### Scenario: Session fixation prevention
- **WHEN** an unauthenticated visitor with an existing session cookie signs in successfully
- **THEN** a new session identifier is issued and the prior session is invalidated

#### Scenario: Sign-out
- **WHEN** an authenticated pilot signs out
- **THEN** the server-side session is destroyed, the cookie is cleared, and the pilot is redirected to their locale's sign-in screen
- **AND** reusing the prior cookie value does not restore authentication

#### Scenario: Session expiry
- **WHEN** a session's absolute lifetime has elapsed
- **THEN** requests bearing that session are treated as unauthenticated

### Requirement: Route protection
Every route SHALL require an authenticated session unless it is explicitly declared public. Only these routes are public:

- the application root redirect
- the locale-scoped sign-in, registration and sign-out routes
- static assets
- health checks

A request to a protected route without a valid session MUST NOT render protected content. A route added without a declaration MUST be protected.

#### Scenario: Unauthenticated request to a protected route
- **WHEN** a request without a valid session targets a protected route
- **THEN** the server redirects to the sign-in screen of the request's locale, preserving the requested path and query as a return target
- **AND** no protected content appears in the response body

#### Scenario: Return to the originally requested route
- **WHEN** that pilot then signs in successfully
- **THEN** they are redirected to the originally requested path

#### Scenario: Protected fragment request
- **WHEN** an unauthenticated fragment request targets a protected route
- **THEN** the server responds with a redirect instruction the client can act on rather than rendering the fragment

#### Scenario: Previously open pages are protected
- **WHEN** a request without a valid session targets the locale root, the weather page (with or without a lookup query), the home weather-summary fragment, or a not-yet-available placeholder destination
- **THEN** the server redirects to sign-in and performs no weather lookup or data read on the visitor's behalf

#### Scenario: Public routes stay reachable
- **WHEN** a request without a valid session targets the sign-in screen, the registration route, a static asset, or a health check
- **THEN** the route responds normally without redirecting to sign-in

#### Scenario: Protection is deny-by-default
- **WHEN** the set of registered routes is enumerated
- **THEN** every route not on the public list redirects an unauthenticated request to sign-in
- **AND** no route outside the public list is reachable without a session

#### Scenario: Unknown paths are not revealed
- **WHEN** a request without a valid session targets a path that matches no route
- **THEN** the response is the not-found response and contains no shell navigation or pilot data

## ADDED Requirements

### Requirement: Sign-in screen presentation
The sign-in screen SHALL render inside a dedicated authentication layout, not the application shell. The layout MUST NOT include the navigation, drawer, tab bar, or active-aircraft control. The screen SHALL use the application's design system, and its text SHALL be localized from the request locale's catalog. It SHALL be usable at every supported viewport width, starting at 320 CSS pixels, without horizontal scrolling and without client-side scripting.

#### Scenario: Localized sign-in screen
- **WHEN** the sign-in screen is requested for each supported locale
- **THEN** the title, field labels, submit control, and any notices are rendered from that locale's catalog
- **AND** the document's language attribute matches the locale

#### Scenario: Styled with the design system
- **WHEN** the sign-in screen is rendered
- **THEN** it links the application stylesheet and presents the product brand
- **AND** it contains none of the shell's navigation destinations

#### Scenario: Usable on a phone
- **WHEN** the sign-in screen is rendered at 320 CSS pixels wide
- **THEN** its content lays out in a single column with no horizontal scrolling
- **AND** every input, the submit control, and every link measures at least 44 by 44 CSS pixels

#### Scenario: Correct input semantics for mobile keyboards and password managers
- **WHEN** the sign-in form is rendered
- **THEN** the email field is an email input with `autocomplete="email"` and the password field has `autocomplete="current-password"`
- **AND** every field has a visible, programmatically associated label

#### Scenario: Error stated in text
- **WHEN** a sign-in attempt fails or is rate-limited
- **THEN** the screen re-renders with a localized message in an element announced to assistive technology, stated in text rather than conveyed by color alone
- **AND** the entered email is preserved and the password is not echoed back

#### Scenario: Locale switch keeps the return target
- **WHEN** a visitor on the sign-in screen with a return target follows the link to another supported locale
- **THEN** that locale's sign-in screen is shown with the same return target

#### Scenario: Signed-in pilot visits sign-in
- **WHEN** a pilot with a valid session requests the sign-in screen
- **THEN** they are redirected to their locale's home route

### Requirement: Self-registration is switchable and disabled by default
Public self-registration SHALL be controlled by a configuration setting that defaults to disabled. While registration is disabled, the system MUST NOT create an account from any public request. Its presence MUST NOT be advertised on the sign-in screen, and a request for the registration screen SHALL receive a localized notice that sign-up is not available. While registration is enabled, the registration screen SHALL be presented with the same layout, design, and phone usability as the sign-in screen, and account creation SHALL behave as specified under "Pilot accounts".

#### Scenario: Registration disabled by default
- **WHEN** the application starts without the registration setting
- **THEN** self-registration is disabled

#### Scenario: No registration link while disabled
- **WHEN** the sign-in screen is rendered while registration is disabled
- **THEN** it contains no link or control leading to registration

#### Scenario: Registration screen while disabled
- **WHEN** the registration screen is requested while registration is disabled
- **THEN** a localized notice states that sign-up is not available and links back to sign-in
- **AND** no registration form is rendered

#### Scenario: Registration submission while disabled
- **WHEN** a registration form submission with a valid CSRF token arrives while registration is disabled
- **THEN** the server rejects it with status 403 and the not-available notice
- **AND** no account and no session are created

#### Scenario: Registration enabled
- **WHEN** registration is enabled and a visitor submits a valid registration form
- **THEN** the account is created, a session is opened, and the visitor is redirected to the return target or their locale's home route
- **AND** the sign-in screen links to registration and the registration screen links back to sign-in

#### Scenario: Registration screen on a phone
- **WHEN** registration is enabled and the registration screen is rendered at 320 CSS pixels wide
- **THEN** its content lays out in a single column with no horizontal scrolling and every control measures at least 44 by 44 CSS pixels
