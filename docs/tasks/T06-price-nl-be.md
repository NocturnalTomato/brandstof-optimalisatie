# T06 — Netherlands and Belgium price adapter

**Depends on:** T05 · **Unblocks:** T11 · **Network:** yes (verify on deploy)

## Goal
Dutch and Belgian per-station prices. Read the DirectLease section of
`docs/DATA-SOURCES.md` in full before starting — this source has strings attached and
the repo owner accepted them knowingly.

## Inputs
- `PriceProvider`, `Station` from `lib/types.ts`; helpers from `lib/prices/http.ts`.
- Endpoints: ANWB and DirectLease, both in DATA-SOURCES.md.

## Outputs

`lib/prices/anwb.ts` — **try this first.** `AnwbPriceProvider`, `unofficial: false`,
countries `["NL"]`. Takes a bbox natively, which matches our query shape exactly.
First job in this task: establish whether it needs a key. Record the finding in
DATA-SOURCES.md whichever way it goes.

`lib/prices/directlease.ts` — `DirectLeasePriceProvider`, `unofficial: true`,
countries `["NL","BE"]`.

- Two-stage: `/v2/places` for the station list, then `/v2/places/{id}` per station for
  prices. **Do not fetch every station in the country per request** — filter the places
  list to the bbox first, then fetch details only for those, capped at 60 per plan and
  with concurrency ≤6.
- Prices come as integers ×1000; divide.
- The `X-Checksum` header is required. Implement it in `lib/prices/directlease-auth.ts`,
  isolated and commented, so it can be deleted wholesale if we drop this source.
- No DirectLease-shaped type may escape this module.

`lib/prices/__fixtures__/directlease-places.json`, `directlease-station.json`,
`anwb-poi.json` — one real captured response each.

`lib/prices/anwb.test.ts`, `directlease.test.ts` — parser tests against the fixtures.

## Acceptance criteria
- [ ] Both providers return `[]` rather than throwing when the upstream 500s, times
      out, or returns malformed JSON. Test each of those three cases.
- [ ] Fixture parsing produces valid `Station` objects: real `observedAt` from the
      payload (never `Date.now()`), correct country, prices in €/litre as floats.
- [ ] A station with no price for the requested fuel is omitted, not emitted with a
      zero or a null.
- [ ] Fuel type mapping is explicit and tested: NL "Euro95"/"E10" → `e10`,
      "Diesel" → `diesel`, "LPG" → `lpg`, "Superplus"/"E5" → `e5`.
- [ ] Bbox filtering happens **before** per-station detail fetches. Assert the call
      count in a test with a stubbed fetch — this is the difference between 60 requests
      and 4 000.
- [ ] Concurrency cap and per-plan station cap are enforced and tested.
- [ ] `unofficial` is `true` for DirectLease and `false` for ANWB.
- [ ] **Live check on a Vercel preview.** State in the PR which of the two actually
      worked. If ANWB is keyless and complete, say so — we would then drop DirectLease.

## Out of scope
Caching (T15). Belgian official sources — none exist at station level.
