# Design

## Context

See proposal.md. `WeatherProvenance.issuedAt` is shared by every tool result. The `intlUtcDateTime` filter already throws on `null` (from `notam-sigmet-no-fabrication`), so any template that forgot to handle a null time would fail its render test rather than print a date.

## Decisions

1. **Nullable field rather than omitting it.** An explicit `null` keeps the key present and makes "not stated" visible in the MCP output, the same choice made for NOTAM/SIGMET validity.
2. **Latest, not first, across a batch.** The provenance line describes the whole batch. Showing the newest time is the conservative reading for staleness, and it is what the function's name already claimed.
3. **SIGMET issue time from the matched advisories only.** Advisories for other FIRs in AVWX's global list do not describe the requested result.
4. **Templates guard every `issuedAt` call** with `… if issuedAt else t.translate('weather.validity_not_stated')`, reusing the existing key. No new catalog key is needed.

## Risks / Trade-offs

- [NOTAM results from AVWX never show an issue time] → That is accurate: the fields read carry none. The retrieval time is still shown.
