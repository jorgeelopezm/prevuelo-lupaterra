# Localization Specification

## Purpose

Locale-segment routing, translation catalog loading, `Accept-Language` negotiation, pilot locale preference persistence, locale-aware formatting, and preservation of aeronautical phraseology across all locales.

## Requirements

### Requirement: Locale-segment routing
Every navigable route SHALL be addressed under a locale segment drawn from the supported set `es`, `pt`, `en`. Spanish (`es`) is the default locale.

#### Scenario: Root path redirects to a locale
- **WHEN** a client requests `/`
- **THEN** the server issues a redirect to the resolved locale's home route

#### Scenario: Unsupported locale segment
- **WHEN** a client requests a route under a locale segment outside the supported set
- **THEN** the server responds with status 404 rather than silently falling back

#### Scenario: Locale available to the renderer
- **WHEN** any route under a locale segment is rendered
- **THEN** the resolved locale is available to the template layer and is emitted as the `lang` attribute on the root HTML element

### Requirement: Locale resolution order
When a request does not name a locale, the system SHALL resolve it by, in order: the authenticated pilot's stored locale preference, the `Accept-Language` header negotiated against the supported set, and finally the default locale.

#### Scenario: Authenticated pilot with stored preference
- **WHEN** an authenticated pilot whose stored preference is `pt` requests `/`
- **THEN** the server redirects to the `pt` home route regardless of the `Accept-Language` header

#### Scenario: Anonymous visitor with a matching Accept-Language
- **WHEN** an anonymous visitor requests `/` with `Accept-Language: pt-BR,pt;q=0.9`
- **THEN** the server redirects to the `pt` home route

#### Scenario: No usable signal
- **WHEN** an anonymous visitor requests `/` with an `Accept-Language` header matching no supported locale
- **THEN** the server redirects to the `es` home route

### Requirement: Translation catalogs
The system SHALL resolve all user-facing interface text through translation catalogs keyed by stable identifiers, with one catalog per supported locale. A key missing from the requested locale MUST fall back to the `en` catalog, and a key missing from every catalog MUST render the key itself rather than an empty string.

#### Scenario: Key present in requested locale
- **WHEN** a template resolves a key present in the `pt` catalog
- **THEN** the Portuguese string is rendered

#### Scenario: Key missing in requested locale
- **WHEN** a template resolves a key absent from the `pt` catalog but present in `en`
- **THEN** the English string is rendered and a warning is logged naming the key and locale

#### Scenario: Key missing everywhere
- **WHEN** a template resolves a key absent from every catalog
- **THEN** the key identifier itself is rendered

### Requirement: Locale preference persistence
An authenticated pilot SHALL be able to change locale from the application shell, and the choice MUST persist to their account so it applies to subsequent sessions and devices.

#### Scenario: Pilot switches locale
- **WHEN** an authenticated pilot selects `pt` from the locale switcher while viewing a screen
- **THEN** the server persists `pt` as their preference and redirects to the equivalent route under the `pt` segment

#### Scenario: Preference survives a new session
- **WHEN** a pilot who previously selected `pt` signs in from a different device and requests `/`
- **THEN** the server redirects to the `pt` home route

#### Scenario: Anonymous locale switch
- **WHEN** an anonymous visitor selects a locale
- **THEN** the choice is retained for the current session without a database write

### Requirement: Locale-aware value formatting
Dates, times, and numeric quantities SHALL be formatted according to the active locale's conventions. Times that carry operational meaning MUST be presented in UTC with an explicit `Z` suffix, and MAY additionally show local time when the aerodrome timezone is known.

#### Scenario: Observation time rendering
- **WHEN** a METAR observation time is rendered in any locale
- **THEN** the UTC time is shown with an explicit `Z` suffix

#### Scenario: Date formatting differs by locale
- **WHEN** the same calendar date is rendered in `es` and in `en`
- **THEN** each uses its locale's conventional date order and month naming

### Requirement: Preservation of aeronautical phraseology
The view layer SHALL provide a verbatim rendering path for coded aeronautical content — raw METAR, TAF, and NOTAM text, ICAO location indicators, aircraft type designators, and regulatory citations — that passes the source string through unchanged in every locale. Content rendered through this path MUST NOT be translated, transliterated, reformatted, or line-wrapped destructively, and every later capability that displays coded content MUST use it.

#### Scenario: Verbatim path preserves the source string
- **WHEN** a coded aeronautical string is rendered through the verbatim path with `pt` active
- **THEN** the emitted text is character-identical to the source string apart from HTML entity escaping

#### Scenario: Whitespace and line structure retained
- **WHEN** a multi-line coded string is rendered through the verbatim path
- **THEN** its line breaks and significant leading whitespace are preserved in the rendered output

#### Scenario: Verbatim path is locale-invariant
- **WHEN** the same coded string is rendered through the verbatim path under `es`, `pt`, and `en`
- **THEN** all three renderings are identical
