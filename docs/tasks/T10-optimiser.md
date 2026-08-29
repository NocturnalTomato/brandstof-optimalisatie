# T10 — The optimiser

**Depends on:** T02 · **Unblocks:** T11 · **Network:** no

**Start this early.** It is pure, needs nothing but types, and is the heart of the
product. A validated reference implementation exists — see below.

## Goal
Given a corridor, a car, a starting tank and an arrival requirement, find the cheapest
set of stops under a cap on how many stops are allowed.

## Inputs
- `PlanRequest`, `Plan`, `PlanResult`, `Infeasible` from `lib/types.ts`.
- Reference implementation: the prototype at
  <https://claude.ai/code/artifact/63dc2d69-a769-48d2-ad1c-1b0b1b0ff64b>
  (view source — `optimise()` is the validated version, including both fixes below).

## Outputs

`lib/optimise/dp.ts` — the algorithm.
`lib/optimise/index.ts` — exports `optimise(req)` and `fewestStops(req)` per CONTRACTS.md.
`lib/optimise/dp.test.ts` — the property tests listed below.

### The algorithm

Dynamic programme over nodes (origin, each corridor station in order, destination) and
discretised fuel levels.

- State: `(nodeIndex, fuelBucket, stopsUsed)` → minimum cost, plus a back-pointer.
- At a station: either pass through, or buy up to tank capacity, costing
  `litres × pricePerLitre` and consuming one stop.
- Between nodes: subtract the leg's fuel need; a state that cannot cover the leg dies.
- Terminal: at the destination with `fuelBucket ≥ minArrivalLitres`, minimise cost.
- Reconstruct stops by walking back-pointers.

### Two things that are easy to get wrong, and both were hit in the prototype

**1. Rounding compounds.** Rounding each leg's consumption up to a whole bucket
accumulates: across a dozen legs it added ~7 L of phantom fuel, telling the user to buy
55 L when 47.6 L was needed. Use **at least 1200 buckets**. There is a regression test
for this below and it is not optional.

**2. The buy transition must be an O(B) scan, not an O(B²) double loop.** Buying from
bucket `b` to `b2` costs `(b2−b)·step·price`, so `cost(b) − b·step·price` is a running
minimum — one forward pass per stop-count. This is what makes a 1200-bucket grid
affordable (~45 ms per plan). **Do not "simplify" it back into a nested loop**; that
combination is 20× slower and was the reason the grid was too coarse in the first place.

## Acceptance criteria

Correctness, as property tests over ≥20 generated corridors:
- [ ] `totalLitres ≥ distanceKm × consumption/100 − startLitres + minArrivalLitres`,
      and exceeds it by **≤ 1.0 L**. This is the anti-regression test for the rounding bug.
- [ ] `arrivalLitres ≥ minArrivalLitres` always.
- [ ] `departLitres ≤ tankLitres` and `arriveLitres ≥ reserveLitres` at every stop.
- [ ] `stops.length ≤ maxStops`.
- [ ] `totalCost` is **non-increasing** as `maxStops` rises, for a fixed corridor.
- [ ] Stops are ordered by `distanceAlongRouteM` and each is in the input corridor.
- [ ] `totalCost` equals the sum of `stops[].cost` to within 0.01.

Optimality, against brute force:
- [ ] On small corridors (≤10 stations, ≤3 stops), the DP's cost equals an exhaustive
      search over every stop subset and a fine grid of purchase amounts, within 1%.

Infeasibility:
- [ ] Returns `{feasible:false, reason:"range"}` when a gap between consecutive
      stations exceeds full-tank range — not a throw, not a wrong plan.
- [ ] Returns `reason:"no-stations"` for an empty corridor when fuel is actually needed.
- [ ] Returns `reason:"arrival-target"` when `minArrivalLitres > tankLitres`.
- [ ] Zero stops needed (you already have enough) returns a feasible plan with
      `stops: []` and `totalCost: 0` — **not** an infeasible result.

Performance and purity:
- [ ] A 60-station corridor with `maxStops: 5` completes in **< 150 ms**.
- [ ] `fewestStops` finds the true minimum — verified against incrementing `maxStops`
      from 0 on ≥10 corridors.
- [ ] No `fetch`, no `Date`, no `Math.random` anywhere in `lib/optimise/`. Assert by
      grepping the module in a test if you like; a reviewer will check.

## Out of scope
Fetching anything. Detour *time* cost — only fuel and stop count are modelled. If you
think detour time should be priced in, raise it, don't add it.
