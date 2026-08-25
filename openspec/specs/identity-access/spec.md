# Identity & Access Specification

## Purpose

Pilot accounts, session-cookie authentication, CSRF protection for state-changing requests, and route-level authorization scoping every record to its owning pilot.

## Requirements

### Requirement: Pilot accounts
The system SHALL store a pilot account identified by a unique, case-insensitive email address, holding a display name, a locale preference, and a password verifier. Plaintext passwords MUST NOT be stored, logged, or returned in any response.

#### Scenario: Account creation
- **WHEN** an account is created with a valid email and a password meeting the configured minimum length
- **THEN** the account is persisted with a salted password hash produced by a memory-hard algorithm
- **AND** no column, log record, or response contains the plaintext password

#### Scenario: Duplicate email
- **WHEN** account creation is attempted with an email that differs only in letter case from an existing account
- **THEN** creation is rejected and no second account is created

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
- **THEN** the server-side session is destroyed and the cookie is cleared
- **AND** reusing the prior cookie value does not restore authentication

#### Scenario: Session expiry
- **WHEN** a session's absolute lifetime has elapsed
- **THEN** requests bearing that session are treated as unauthenticated

### Requirement: Route protection
Routes SHALL declare whether they require authentication. A request to a protected route without a valid session MUST NOT render protected content.

#### Scenario: Unauthenticated request to a protected route
- **WHEN** a request without a valid session targets a protected route
- **THEN** the server redirects to the sign-in screen preserving the requested path as a return target
- **AND** no protected content appears in the response body

#### Scenario: Return to the originally requested route
- **WHEN** that pilot then signs in successfully
- **THEN** they are redirected to the originally requested path

#### Scenario: Protected fragment request
- **WHEN** an unauthenticated fragment request targets a protected route
- **THEN** the server responds with a redirect instruction the client can act on rather than rendering the fragment

### Requirement: CSRF protection
Every state-changing request SHALL carry a CSRF token bound to the current session and MUST be rejected when the token is absent, malformed, or bound to a different session.

#### Scenario: Form submission without a token
- **WHEN** a POST request arrives without a CSRF token
- **THEN** the server responds with status 403 and performs no state change

#### Scenario: Token from another session
- **WHEN** a POST request carries a CSRF token bound to a different session
- **THEN** the server responds with status 403 and performs no state change

#### Scenario: Valid token
- **WHEN** a POST request carries a CSRF token bound to the current session
- **THEN** the request is processed normally

### Requirement: Ownership scoping
Every query that reads or writes pilot-owned data SHALL be constrained by the authenticated pilot's identifier. A pilot MUST NOT be able to read or modify another pilot's records by supplying an identifier belonging to them.

#### Scenario: Access to another pilot's record
- **WHEN** an authenticated pilot requests a route naming a record owned by a different pilot
- **THEN** the server responds with status 404 and discloses nothing about the record's existence

#### Scenario: Access to an owned record
- **WHEN** an authenticated pilot requests a route naming a record they own
- **THEN** the record is returned normally

### Requirement: Authentication rate limiting
Repeated failed sign-in attempts against the same account or from the same source SHALL be throttled to resist credential-stuffing.

#### Scenario: Threshold exceeded
- **WHEN** failed sign-in attempts for one account exceed the configured threshold within the configured window
- **THEN** further attempts for that account are rejected with a retry indication until the window elapses
- **AND** the rejection message does not reveal whether the account exists
