# Tasks

## 1. Implementation (landed 2026-09-23)

- [x] 1.1 `issuedAt: string | null` in `mcp/aviation-weather/src/provider/types.ts` and `src/platform/weather-mcp/types.ts`; verified by `tsc --noEmit`.
- [x] 1.2 `latestIssuedAt` returns the latest time or `null`; AVWX NOTAM provenance is `null`; SIGMET provenance is the latest matched advisory time or `null`. Verified by the `avwx.test.ts` tests "getMetar provenance issuedAt is the latest observation across stations…", "…is null when no station returned a report…", "getTaf provenance issuedAt is null…", "getNotams provenance issuedAt is null…", and "getSigmet provenance issuedAt is the latest matched advisory issue time, or null…".
- [x] 1.3 Guard every provenance `issuedAt` call in `weather.njk` (4) and `home-weather.njk` (2). Verified by `src/modules/weather/index.test.ts` "weather screen: a provenance line with no issue time reads 'not stated', never the epoch or 'now'".

## 2. Verification

- [x] 2.1 Scenario traceability. *Provenance fields present*, *Mock data is labeled*, and *Cached result marked* are covered by existing `server.test.ts`/`mock.test.ts` tests. *Latest time across a batch* and *No report carries a time* are covered by the 1.2 tests. *Provenance line without an issue time* is covered by the 1.3 test.
- [x] 2.2 `npm run check` green (developer, 2026-09-23): 476 web tests and 68 MCP tests pass.
- [x] 2.3 `openspec validate provenance-issued-at-nullable --strict` passes, then archive (developer-authorized). Validated and archived 2026-09-23 (developer-authorized).
