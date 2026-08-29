# T09 — Corridor projection and detour filter

**Depends on:** T02 · **Unblocks:** T11 · **Network:** no

## Goal
Turn a bag of stations and a route into an ordered list of candidates the optimiser can
walk: each with a distance-along-route and a detour cost. Pure geometry, no HTTP.

## Inputs
- `Route` (with `polyline` and `cumulativeM`), `Station[]`, `FuelType`.
- `CorridorStation` from `lib/types.ts`.

## Outputs

`lib/corridor/project.ts`:
```ts
export interface ProjectResult { distanceAlongRouteM: number; detourM: number }
/** Perpendicular projection onto the nearest polyline segment. */
export function projectOntoRoute(point: LatLon, route: Route): ProjectResult;
```

`lib/corridor/index.ts`:
```ts
export interface CorridorOptions {
  maxDetourM?: number;   // default 2000
  maxStations?: number;  // default 400 — keep the DP fast
}
export function buildCorridor(
  route: Route, stations: Station[], fuel: FuelType, opts?: CorridorOptions,
): CorridorStation[];
```

Behaviour:
1. Drop stations with no price for `fuel`.
2. Project each; drop those beyond `maxDetourM`.
3. Sort ascending by `distanceAlongRouteM`.
4. If over `maxStations`, thin by keeping the cheapest few in each distance bucket —
   **never** by truncating the tail, which would silently delete the second half of
   the journey.
5. Drop stations projecting to within 500 m of the destination — useless for the plan.

Use an equirectangular approximation for point-to-segment distance at these latitudes;
haversine per segment is unnecessary and slow. Document the choice in a comment.

`lib/corridor/*.test.ts`.

## Acceptance criteria
- [ ] `distanceAlongRouteM` is strictly ascending in the output.
- [ ] A station exactly on the route gets `detourM ≈ 0` (< 5 m).
- [ ] A station 1.5 km off is kept at the default; one 2.5 km off is dropped.
- [ ] Projection is correct for a point beyond a segment's end — it clamps to the
      endpoint rather than extrapolating past it. This is the classic bug here; test it.
- [ ] A U-shaped route does not mis-order: a station near the *start* geographically but
      late in the drive gets the *late* `distanceAlongRouteM`. Test with a hairpin.
- [ ] Thinning preserves coverage across the whole route length, verified by asserting
      stations exist in each decile of `distanceAlongRouteM`.
- [ ] `pricePerLitre` is always defined in the output.
- [ ] Pure: no fetch, no clock, no randomness.

## Out of scope
Choosing stops (T10). Fetching stations (T05–T08).
