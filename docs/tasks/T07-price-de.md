# T07 — Germany price adapter (Tankerkönig)

**Depends on:** T05 · **Unblocks:** T11 · **Network:** yes (verify on deploy)

## Goal
German per-station prices. The cleanest source in the project: documented, official
(MTS-K data), free, live.

## Inputs
- `PriceProvider`, `Station` from `lib/types.ts`; `lib/prices/http.ts`.
- `TANKERKOENIG_API_KEY`. Endpoint in DATA-SOURCES.md.

## Outputs

`lib/prices/tankerkoenig.ts` — `TankerkoenigPriceProvider`, `unofficial: false`,
countries `["DE"]`.

The API takes a **centre plus radius**, not a bbox, and caps the radius at 25 km. A
route bbox is much larger than that, so tile it: cover the bbox with overlapping
25 km-radius circles, fetch in parallel with concurrency ≤4, merge and dedupe. Cap the
number of tiles per plan (suggest 40) and, if the bbox needs more, sample along the
route rather than filling the whole rectangle — most of a bbox is nowhere near the road.

Fuel mapping: `e5` → `e5`, `e10` → `e10`, `diesel` → `diesel`. The `list.php`
response's `isOpen` is *not* a price validity signal — do not filter on it.

`lib/prices/__fixtures__/tankerkoenig-list.json` — one real response.
`lib/prices/tankerkoenig.test.ts`.

## Acceptance criteria
- [ ] Returns `[]` (never throws) on 401 with a bad key, on 500, and on malformed JSON.
      Test all three.
- [ ] Tiling covers the whole bbox with no gaps — test with a bbox spanning ~400 km.
- [ ] Tile count is capped, and exceeding the cap falls back to route-sampled centres
      rather than silently dropping coverage.
- [ ] Duplicate stations across overlapping tiles are removed by station id before
      the shared `dedupeStations` ever runs.
- [ ] `observedAt` comes from the payload, never from the local clock.
- [ ] Stations with `price: null` for the requested fuel are omitted.
- [ ] Attribution: Tankerkönig's terms require crediting MTS-K. Add the credit string
      to the provider metadata and note in the PR where the UI should show it.
- [ ] **Live check on a Vercel preview**, stated explicitly.

## Out of scope
Other countries. Caching (T15). Price history.
