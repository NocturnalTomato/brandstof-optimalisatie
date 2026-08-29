# T04 — Routing provider

**Depends on:** T02 · **Unblocks:** T09, T11 · **Network:** yes (verify on deploy)

## Goal
Turn two place names into a `Route` with a polyline, cumulative distances, a bounding
box, and the list of countries it crosses. The countries list drives which price
adapters get called, so it must be right.

## Inputs
- `RoutingProvider`, `Route`, `GeocodeResult` from `lib/types.ts`.
- `ORS_API_KEY`. Endpoints in DATA-SOURCES.md.

## Outputs

| File | Contains |
|---|---|
| `lib/routing/polyline.ts` | `decodePolyline(encoded: string, precision?: number): LatLon[]` — Google/ORS encoded polyline algorithm, ORS uses precision 5 |
| `lib/routing/geo.ts` | `haversineM(a,b)`, `cumulativeDistances(points): number[]`, `boundingBox(points, padM?)`, `simplify(points, toleranceM)` (Douglas–Peucker) |
| `lib/routing/ors.ts` | `OrsRoutingProvider implements RoutingProvider` |
| `lib/routing/osrm.ts` | `OsrmRoutingProvider` — routing only; `geocode` throws `NotSupportedError` |
| `lib/routing/countries.ts` | `countriesAlongRoute(polyline: LatLon[]): CountryCode[]` |
| `lib/routing/index.ts` | `getRoutingProvider(): RoutingProvider` — ORS if keyed, else OSRM |
| `lib/routing/*.test.ts` | fixture-driven |
| `lib/routing/__fixtures__/ors-route-ams-muc.json` | one real ORS response |

**`countriesAlongRoute` matters more than it looks.** Sample the polyline every ~10 km
and resolve each point to a country. Use a small bundled polygon set or a
point-in-bounding-box table with a nearest-anchor fallback — do not call a geocoding
API per sample. Return countries in order of first entry, deduplicated.

## Acceptance criteria
- [ ] `decodePolyline` matches a known-good fixture exactly.
- [ ] `cumulativeDistances` is monotonically non-decreasing; last element is within
      0.5% of the provider's reported `distanceM`.
- [ ] `simplify` on a 5000-point line returns ≤2000 points and never moves a point
      more than the tolerance from the original line.
- [ ] `countriesAlongRoute` on the Amsterdam→München fixture returns exactly
      `["NL","DE"]`; on Rotterdam→Paris returns `["NL","BE","FR"]`.
- [ ] `boundingBox` pads by the requested margin.
- [ ] A missing `ORS_API_KEY` falls back to OSRM without throwing at import time.
- [ ] Provider errors throw a typed error the API route can map to `no-route`/`upstream`.
- [ ] **Live check on a Vercel preview**, and say so explicitly in the PR. Fixtures
      passing is not the same claim.

## Out of scope
Google Directions. Traffic. Alternative routes. Anything about stations.
