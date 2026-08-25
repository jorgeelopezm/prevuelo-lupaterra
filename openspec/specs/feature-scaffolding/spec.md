# Feature Scaffolding Specification

## Purpose

Registered route namespaces and navigable placeholder screens for the six feature domains, plus the module layout and registration contract each later capability implements against.

## Requirements

### Requirement: Registered route namespaces for feature domains
The application SHALL register a locale-scoped route namespace for each of the six feature domains — dashboard, weather and NOTAMs, checklists, risk assessment, aircraft and logbook, and documents and AIS — with a localized path segment per locale. Each namespace MUST resolve to a navigable screen in this change.

#### Scenario: Every navigation destination resolves
- **WHEN** each sidebar destination is requested under each supported locale
- **THEN** every request returns status 200 and renders inside the application shell

#### Scenario: Localized path segments
- **WHEN** the weather namespace is requested under `es` and under `en`
- **THEN** each responds at its own locale-appropriate path segment
- **AND** each renders with its locale active

### Requirement: Placeholder screens state their status honestly
A feature screen whose capability is not yet implemented SHALL render the application shell together with an explicit, localized statement that the capability is not yet available. Such a screen MUST NOT display invented weather, NOTAM, telemetry, checklist, risk, or regulatory values, and MUST NOT present any value that could be mistaken for operational data.

#### Scenario: Placeholder content
- **WHEN** an unimplemented feature screen is rendered
- **THEN** it contains a localized not-yet-available notice identifying the capability
- **AND** it contains no METAR, TAF, NOTAM, engine, fuel, maintenance, or risk-score value

#### Scenario: Placeholder is visually identifiable
- **WHEN** an unimplemented feature screen is rendered
- **THEN** its not-yet-available state is conveyed by text, not by color alone

#### Scenario: Prototype sample data is not carried over
- **WHEN** the rendered output of any placeholder screen is inspected
- **THEN** it contains none of the prototype's sample values

### Requirement: Module registration contract
Each feature domain SHALL be implemented as a self-contained module exposing a single registration entry point that attaches its routes, views, and services to the application. The server bootstrap MUST compose the application solely by invoking these entry points.

#### Scenario: Module registration
- **WHEN** the server starts
- **THEN** each feature module's registration entry point is invoked exactly once
- **AND** the routes it declares are reachable

#### Scenario: Removing a module
- **WHEN** a feature module's registration is removed from the bootstrap
- **THEN** the server starts successfully and that module's routes return 404
- **AND** no other module's routes are affected

#### Scenario: Module isolation
- **WHEN** one feature module's internals are inspected for imports
- **THEN** it imports only from shared platform services and its own directory, not from another feature module's internals

### Requirement: Sidebar reflects registered destinations
The application shell's navigation SHALL be derived from the registered feature modules rather than hard-coded in a template, so that a destination appears if and only if its module is registered.

#### Scenario: Navigation derived from registration
- **WHEN** the shell renders its navigation
- **THEN** it lists exactly the destinations declared by the registered modules, in their declared order

#### Scenario: Unregistered destination is absent
- **WHEN** a module is not registered
- **THEN** its destination does not appear in the sidebar

### Requirement: Ported design system
The server-rendered view layer SHALL reproduce the prototype's design system — color tokens, typography scale, spacing, and the card, status chip, badge, toggle, and progress components — as reusable template partials shared by every screen.

#### Scenario: Shared component partials exist
- **WHEN** two different screens render a status chip
- **THEN** both render it through the same shared partial

#### Scenario: Status conveyed with text as well as color
- **WHEN** a status chip partial renders any status
- **THEN** the output includes a text label or icon alongside the color treatment

#### Scenario: Contrast compliance
- **WHEN** the shell and its shared components are rendered in the application's default theme
- **THEN** foreground and background token pairings used for text meet WCAG 2.1 AA contrast ratios

### Requirement: Responsive layout from phone to desktop
Every screen SHALL be fully usable from a 320px-wide viewport up to desktop widths, using a single set of templates adapted by CSS. The system MUST NOT serve different templates based on device or user-agent detection, and MUST NOT require horizontal page scrolling at any supported width.

#### Scenario: Phone viewport
- **WHEN** any navigable screen is rendered at a 320px viewport width
- **THEN** all of its content and controls are reachable by vertical scrolling alone
- **AND** the document body does not scroll horizontally

#### Scenario: Single template set
- **WHEN** the same route is requested with a phone user agent and with a desktop user agent
- **THEN** the server returns the same markup and the same template is used for both

#### Scenario: Viewport declaration
- **WHEN** any full page is rendered
- **THEN** the document declares a responsive viewport permitting user scaling

### Requirement: Adaptive navigation presentation
The shell's navigation SHALL adapt to viewport width while drawing every presentation from the same registry-derived destination list. At large widths it presents as a persistent sidebar; below that it presents as a dismissible off-canvas drawer; on phone widths it additionally presents the destinations within thumb reach.

#### Scenario: Persistent sidebar at desktop width
- **WHEN** a screen is rendered and viewed at a desktop width
- **THEN** the navigation is visible without interaction

#### Scenario: Collapsed navigation below the large breakpoint
- **WHEN** a screen is viewed below the large breakpoint
- **THEN** the navigation is reachable through a labeled control and can be dismissed
- **AND** the active destination is still identifiable without opening it

#### Scenario: One destination source
- **WHEN** the navigation is rendered in any presentation
- **THEN** its destinations come from the module registry rather than a presentation-specific list

#### Scenario: Navigation without JavaScript
- **WHEN** a screen is viewed below the large breakpoint with JavaScript disabled
- **THEN** every navigation destination remains reachable

### Requirement: Touch target sizing
Every interactive element in the shell and shared components SHALL present a touch target of at least 44 by 44 CSS pixels, including where the visible control is smaller than its target.

#### Scenario: Shared component targets
- **WHEN** any interactive shared component is rendered
- **THEN** its activatable region measures at least 44 by 44 CSS pixels

#### Scenario: Adjacent controls
- **WHEN** two interactive controls are rendered adjacently
- **THEN** their activatable regions do not overlap
