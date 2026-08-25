## ADDED Requirements

### Requirement: Server-rendered page delivery
The application SHALL deliver every navigable screen as a complete HTML document rendered on the server. The system MUST NOT require client-side JavaScript to render page content, and MUST NOT ship a client-side router or a client-side view layer that reconstructs pages from JSON.

#### Scenario: Page requested with JavaScript disabled
- **WHEN** a client requests any navigable route with JavaScript disabled
- **THEN** the server returns a complete HTML document containing the page's primary content, navigation, and status information
- **AND** the page is readable and navigable via standard hyperlinks and form submissions

#### Scenario: Response content type
- **WHEN** the server responds to a navigable route
- **THEN** the response `Content-Type` is `text/html; charset=utf-8`

### Requirement: Fragment responses for in-page interactivity
The application SHALL support partial updates by returning HTML fragments for requests that declare themselves as fragment requests. A fragment response MUST contain only the markup for the target region, without the surrounding page layout.

#### Scenario: Fragment request returns partial markup
- **WHEN** a request carries the `HX-Request` header for a route that supports fragment rendering
- **THEN** the server renders only the requested partial template
- **AND** the response omits the document shell, sidebar, and `<html>`/`<head>` elements

#### Scenario: Same route requested as a full page
- **WHEN** the same route is requested without the `HX-Request` header
- **THEN** the server renders the partial inside the full application layout

### Requirement: Persistent application shell
Every navigable screen SHALL render inside a shared layout providing left-hand navigation to Dashboard, Weather & NOTAMs, Checklists, Risk Assessment, Aircraft & Logbook, and Documents & AIS, together with the active aircraft indicator, locale switcher, and signed-in pilot identity.

#### Scenario: Active navigation state
- **WHEN** a pilot views any navigable screen
- **THEN** the sidebar entry corresponding to that screen is marked active with both a visual treatment and an `aria-current="page"` attribute

#### Scenario: Shell present on every screen
- **WHEN** a pilot navigates between any two navigable screens
- **THEN** the sidebar, active aircraft indicator, and locale switcher remain present and in the same position

### Requirement: Configuration and secret loading
The system SHALL load configuration from environment variables, validate it against a schema at startup, and fail to start with a descriptive error when a required value is missing or malformed. Secrets MUST NOT be written to logs or rendered into responses.

#### Scenario: Missing required configuration
- **WHEN** the server starts without a required configuration value
- **THEN** startup aborts with a non-zero exit code
- **AND** the error message names the missing variable and its expected format
- **AND** no secret value is included in the message

#### Scenario: Configuration schema validation
- **WHEN** a configuration value is present but fails schema validation
- **THEN** startup aborts and the error names the variable and the constraint it violated

### Requirement: Database connectivity and migrations
The system SHALL connect to PostgreSQL through a managed connection pool and SHALL apply schema migrations through a versioned, ordered, forward-only migration runner. The `vector` extension MUST be enabled by the initial migration.

#### Scenario: Migrations applied in order
- **WHEN** the migration runner executes against a database
- **THEN** pending migrations are applied in ascending version order
- **AND** each applied migration is recorded so it is not reapplied on a subsequent run

#### Scenario: Vector extension available
- **WHEN** the initial migration has been applied
- **THEN** the `vector` extension is present in the database

#### Scenario: Migration failure halts the run
- **WHEN** a migration fails during execution
- **THEN** that migration's transaction is rolled back
- **AND** no subsequent migration is attempted

### Requirement: Health and readiness endpoints
The system SHALL expose a liveness endpoint reporting process health and a readiness endpoint reporting dependency health, including database connectivity.

#### Scenario: Readiness with healthy dependencies
- **WHEN** the readiness endpoint is requested and the database is reachable
- **THEN** the response status is 200 and the body reports each checked dependency as healthy

#### Scenario: Readiness with unreachable database
- **WHEN** the readiness endpoint is requested and the database is unreachable
- **THEN** the response status is 503 and the body identifies the database as the failing dependency

### Requirement: Structured request logging
The system SHALL emit one structured log record per request containing method, route, status code, duration, locale, and a correlation identifier. Log records MUST NOT contain session tokens, credentials, or pilot passwords.

#### Scenario: Correlation identifier propagation
- **WHEN** a request is received without a correlation identifier
- **THEN** the server generates one, includes it in every log record for that request, and returns it in a response header

#### Scenario: Sensitive values excluded
- **WHEN** a request carries a session cookie or authentication credential
- **THEN** the emitted log record contains neither the cookie value nor the credential

### Requirement: Error responses
The system SHALL render localized error pages for unhandled failures and for missing resources, and MUST NOT expose stack traces, SQL statements, or internal file paths in a response when running outside development mode.

#### Scenario: Unknown route
- **WHEN** a pilot requests a route that does not exist
- **THEN** the server responds with status 404 and a localized "not found" page rendered inside the application shell

#### Scenario: Unhandled server error in production mode
- **WHEN** an unhandled exception occurs while handling a request in production mode
- **THEN** the server responds with status 500 and a localized error page carrying the correlation identifier
- **AND** the response body contains no stack trace, SQL statement, or filesystem path
