# T11 — POST /api/plan

**Depends on:** T03, T04, T05, T09, T10, T13 · **Unblocks:** T12, T14, T15 · **Network:** yes

## Goal
The one endpoint. Composes routing, prices, corridor, optimiser and links into a
`PlanApiResponse`. This is the **only** module allowed to know about all of them.

## Inputs
- `PlanApiRequest`, `PlanApiResponse`, `PlanApiError` from `lib/types.ts` — implement
  these exactly, the UI is built against them.

## Outputs

`app/api/plan/route.ts` — `POST` handler, Node runtime (not edge; some upstreams need
generous timeouts).

Pipeline:
1. **Validate** the body. Reject unknown/missing fields with `400`. Exactly one of
   `startLitres`/`startPercent`, and one of `arrivalLitres`/`arrivalPercent`. Run
   `isPlausibleVehicle`.
2. **Resolve** `from`/`to` — geocode strings, pass `LatLon` through. Failure → `422`
   `geocode-failed` naming which field.
3. **Route** → `Route`. Failure → `502` `upstream`, or `422` `no-route`.
4. **Fetch stations** for `route.bbox` and `route.countries` via `fetchStations`.
5. **Build corridor**.
6. **`fewestStops`** → `minStops`. Infeasible → `422` with the reason and a message a
   person can act on ("a 36 L tank at 4.3 L/100 km can't cross the 210 km gap after
   Würzburg — try a lower arrival level").
7. **`optimise`** at `maxStops` (default `minStops + 1`, clamped to
   `[minStops, minStops + 3]`).
8. **Build links** for both plans.
9. Assemble the response including `sources` and `uncovered`.

`app/api/plan/validate.ts` — request parsing and normalisation, unit-tested separately.
`app/api/plan/route.test.ts` — with routing and price layers stubbed.

Budget the whole request at **8 s**; pass one `AbortSignal` down to every provider.

## Acceptance criteria
- [ ] Response matches `PlanApiResponse` exactly. No extra fields, none missing.
- [ ] Status codes per CONTRACTS.md: 200 / 400 / 422 / 502. Never a 500 with a stack
      trace; catch-all returns `{error:"upstream"}`.
- [ ] Percentages convert to litres **at this boundary**; nothing downstream sees a percent.
- [ ] `maxStops` is clamped to `[minStops, minStops+3]`; out-of-range input is clamped,
      not rejected.
- [ ] `uncovered` correctly lists route countries with no price data (test with a
      route through BE with the NL/BE provider stubbed to fail).
- [ ] `sources[].unofficial` is `true` when DirectLease contributed — the UI needs this.
- [ ] A single failing price provider still yields a plan from the others' stations.
- [ ] The 8 s budget is enforced; a hanging provider does not hang the request.
- [ ] No API key appears in any response body or error message. Test this explicitly.
- [ ] **Live check on a Vercel preview** with a real Amsterdam→München request; paste
      the response summary in the PR.

## Out of scope
Caching (T15). Any UI. GET/streaming variants.
