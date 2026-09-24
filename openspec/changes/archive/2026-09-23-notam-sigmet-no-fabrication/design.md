# Design

## Context

See proposal.md for why. The current state that shapes the approach:

- **MCP result shape.** `NotamReport { icao, notams[] }` and `SigmetReport { fir, sigmets[] }` (`mcp/aviation-weather/src/provider/types.ts`). Each entry has `startAt`/`endAt: string`. The web side keeps a hand-mirrored copy of these types in `src/platform/weather-mcp/types.ts`, and the client parses the tool JSON without schema validation (`client.ts:151`).
- **Where "empty" is decided.** Both templates test `notams.length === 0` (`src/views/pages/weather.njk:82`, `src/views/partials/home-weather.njk:27`, and the SIGMET branch at `weather.njk:~103`). Neither empty branch renders a provenance line.
- **A missing entry already becomes an empty list.** `src/modules/weather/service.ts:112` maps a missing per-ICAO entry to `{ icao, notams: [] }`, and `src/modules/dashboard/service.ts:547` (`findNotams`) returns `[]`. So "the provider said nothing about this aerodrome" currently renders as "no active NOTAMs".
- **Validity times are not rendered at all today.** The only place they are invented is the AVWX provider (`avwx.ts:133-134, 162-163`).
- **`intlUtcDateTime` hides a trap.** The filter does `new Date(value)`, so a `null` value renders as 1970-01-01, which would be a fresh fabrication (`src/server/views/views.ts:71`).

## Goals / Non-Goals

**Goals:**
- One coverage signal, set by the provider (the only party that knows how authoritative it is) and read by both screens the same way.
- Missing data stays missing from the provider through to the HTML.

**Non-Goals:**
- Deciding which real provider is authoritative for Spain or Portugal. Future providers (FAA NOTAM, EAD) declare their own coverage in their own changes.
- Feeding NOTAMs into the risk assessment or the go/no-go verdict.
- Parsing AVWX's non-date validity markers (see Open Questions).

## Decisions

1. **Coverage lives on each report, not on the whole result.** A provider can be authoritative for some indicators and not others. For example, an EAD provider would be complete for European aerodromes only, and the mock is complete only for its seeded ones. Per-report coverage handles that without another shape change later. *Alternative:* a result-level flag. Rejected because a mixed-coverage request could only be marked `unknown` as a whole.

2. **`coverage: 'complete' | 'unknown'`, not a boolean.** A named enum reads unambiguously in JSON and in templates, and it can grow (for example a partial state) without changing the meaning of existing values. `unknown` is the safe default: a provider has to opt in to `complete`.

3. **An absent coverage field is treated as `unknown` on the web side.** The web types make the field optional, and one helper (`isConfirmedEmpty(report)`) returns true only for `coverage === 'complete'` with an empty list. Both services call it, so the rule has one implementation. This covers an older MCP build, and any result cached in the MCP server's cache before deploy.

4. **A missing per-indicator entry becomes an explicit `unknown` report.** The fallbacks in `weather/service.ts` and `dashboard/service.ts` now produce `{ icao, notams: [], coverage: 'unknown' }` instead of an unmarked empty list.

5. **Validity times are `string | null` and serialized as JSON `null`.** Omitting the key was the alternative, but explicit `null` makes "the provider did not state it" visible in the MCP output and in tests. This is a breaking change to the tool output shape. The web app is the only consumer in this repository and is updated in the same change.

6. **The template branches on null, and the filter refuses null.** Templates render `weather.validity_not_stated` when a time is null. `intlUtcDateTime` throws on `null`/`undefined` instead of formatting the epoch, so a missing branch fails a render test loudly instead of printing 1970. *Alternative:* the filter returns the "not stated" text itself. Rejected because it would need the translator inside the filter and would hide the case from template authors.

7. **Both empty states render the existing `provenanceLine` macro.** No new provenance markup is added, the same mitigation the home screen used. The unconfirmed-empty text points the pilot to the official AIS, without naming a specific service.

## Risks / Trade-offs

- [Pilots with AVWX never see "no NOTAMs in force" for any aerodrome] → That is the honest state for a provider whose coverage is not asserted. The text points to the official source, and a future authoritative provider restores the confirmed state.
- [The hand-mirrored web types drift from the MCP types] → The client tests are updated with fixtures in the new shape. An eval test asserts that the "no active NOTAMs" catalog string never appears in the output for an `unknown` report.
- [A null reaches `intlUtcDateTime` from another template] → Decision 6 makes that a thrown error that the render tests catch, never a silent 1970 date.

## Migration Plan

1. Archive `avwx-weather-provider`, `meteorologia-page`, and `inicio-page` first (a prerequisite, see proposal.md Impact).
2. Deploy the MCP server and the web app together. The web side tolerates the old shape (Decision 3), so deploying the web app first is also safe. Deploying the MCP server alone briefly shows validity times of `null` as "not stated", which is also safe.
3. Rollback means reverting both. There are no data migrations.

## Open Questions

- AVWX sometimes expresses an end of validity as a non-date marker (for example `PERM`, or an estimated time). This change maps any missing `dt` to `null` ("not stated"), which is conservative but drops the marker. A follow-up can pass the raw marker through as text. That would add a field, not change these requirements.
