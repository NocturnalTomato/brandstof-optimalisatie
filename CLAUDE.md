# Brandstof

A fuel-stop optimiser. You enter where you're driving from and to, what you drive,
how full the tank is now and how full you want it on arrival. It tells you which
stations to stop at, how many litres to buy at each, what that costs, and hands you
a Google or Apple Maps route with the stops as waypoints.

The interesting part is the middle: fuel is 20–35 cents/litre cheaper across a border
or off a motorway, so *where* you buy matters more than *whether* you shop around.

---

## Read this first, in this order

1. **`docs/CONTRACTS.md`** — every type crossing a module boundary. The single source
   of truth. Do not invent a parallel shape; import from `lib/types.ts`.
2. **`docs/DATA-SOURCES.md`** — every external API, its key, its quirks, its licence risk.
3. **`docs/tasks/README.md`** — the task board, dependency graph, and how to claim one.
4. **`docs/DESIGN.md`** — the visual system ("The Rail") and its tokens.

If you are picking up a single task, read 1, 3, your own task file, and whichever of
2 and 4 your task names. That is enough.

---

## Decisions already made

These were settled with the repo owner. Do not relitigate them in a PR; if one turns
out to be wrong, say so explicitly and wait.

| Decision | Why |
|---|---|
| **Next.js (App Router) + TypeScript on Vercel** | Server routes proxy every upstream so API keys never reach the browser, and price feeds get cached in one place. |
| **OpenRouteService for routing, free tier** | Keyless Google Maps *deep links* still work for output. A Google Directions adapter can drop in later behind `RoutingProvider`. |
| **Prices assembled per country** | No free pan-European per-station API exists. NL/BE, DE, FR, ES, IT each get an adapter behind one `PriceProvider` interface. |
| **DirectLease for NL/BE despite being unsanctioned** | It is the only route to Dutch prices. The owner accepted the risk knowingly. Quarantined behind the interface; ANWB is tried first. See DATA-SOURCES.md. |
| **Bundled vehicle dataset + manual override** | No free EU make/model → L/100km API exists. Manual entry always wins. |
| **Two plans: cheapest and fewest-stops, as tabs** | Not side by side. The cheapest tab carries a *max stops* slider whose floor is the fewest-stops answer, so the two meet at the bottom of the range. |
| **"The Rail" visual direction** | Chosen from ten. Newspaper as influence — serif figures, hairline rules, tabular numerals — not as format. |

---

## Architecture

```
Browser
  └── app/page.tsx ─ guided flow, one question at a time (T12)
        │  route → car → tank now → tank on arrival
        ↓ POST /api/plan
app/api/plan/route.ts (T11) ─ the only place these are composed
  ├── lib/routing/     ORS → Route{polyline, cumulativeM, bbox, countries}   (T04)
  ├── lib/prices/      registry picks adapters by route countries            (T05)
  │     ├── directlease.ts / anwb.ts   NL, BE                                (T06)
  │     ├── tankerkoenig.ts            DE                                    (T07)
  │     └── france.ts spain.ts italy.ts                                      (T08)
  ├── lib/corridor/    project stations onto polyline, keep detour ≤ 2 km    (T09)
  ├── lib/optimise/    DP over discretised fuel levels → Plan                (T10)
  └── lib/maps/        deep links, no key needed                             (T13)
        ↓ PlanApiResponse
  components/result/   the rail, tabs, cap slider, ⓘ tooltips                (T13)
```

**The dependency rule:** `lib/optimise` is pure — no fetch, no clock, no randomness,
no knowledge of where stations came from. `lib/corridor` knows geometry, not HTTP.
Adapters know HTTP, not the optimiser. Only the API route composes them. Keeping this
straight is what lets tasks be built in parallel and tested without a network.

---

## Folder map

```
app/                  Next.js App Router. api/plan/route.ts is the only endpoint.
components/flow/      The four guided steps. Each owns one question.
components/result/    Rail, tabs, cap slider, info dot.
lib/types.ts          Everything in CONTRACTS.md, verbatim.
lib/units.ts          Litres/percent/metres conversions. The only place these live.
lib/routing/          RoutingProvider + ORS and OSRM adapters + polyline decode.
lib/prices/           PriceProvider + one file per country source + __fixtures__/.
lib/corridor/         Station-to-route projection and detour filtering.
lib/optimise/         The DP. Pure. Heavily tested.
lib/vehicle/          Bundled vehicles.json + lookup.
lib/maps/             Google/Apple deep-link builders.
lib/cache/            TTL cache in front of the price adapters.
scripts/              Offline data generation (vehicle dataset), not shipped.
docs/                 Contracts, data sources, design, tasks.
```

---

## Conventions

- **Units are non-negotiable**: metres, seconds, litres, euros, ISO-8601 UTC.
  Percentages exist only in the UI and are converted at the API boundary. See CONTRACTS.md.
- **Price adapters never throw.** A dead German feed must not break a Dutch route.
  Return `[]`, log the source id.
- **Never fabricate a price or a timestamp.** If a station has no usable price for the
  requested fuel, omit the station. No placeholders, no last-known guesses.
- Money is rounded to 2 decimals **at the display edge only**. Prices per litre carry
  3 decimals throughout.
- `font-variant-numeric: tabular-nums` on every figure that sits in a column.
- No secret may reach the browser. Nothing sensitive in a `NEXT_PUBLIC_` variable.

---

## Two things that will waste your time if you don't know them

**1. The dev sandbox cannot reach any price API or OSRM.** Outbound access is blocked
at the egress proxy. So:

- Build and test every adapter against a recorded fixture in `lib/prices/__fixtures__/`.
  "The fixture parses" is the acceptance criterion.
- "The endpoint answers" is a *separate claim* and needs a Vercel preview deploy.
  Do not report an adapter as working live until you have actually seen it do so.

**2. The optimiser's rounding compounds.** It discretises fuel into buckets. If you
round per-leg consumption up, the error accumulates across a dozen legs into several
litres of phantom fuel — the prototype told users to buy 55 L when they needed 47.6.
The fix is a fine grid (≥1200 buckets), affordable because the buy transition is an
O(B) prefix-min scan rather than an O(B²) double loop. T10 has the detail and the
regression test. Do not "simplify" that scan back into a double loop.

---

## Commands

```bash
npm install
npm run dev          # http://localhost:3000
npm run build
npm test             # vitest
npm run test:watch
npm run lint
npm run typecheck
```

---

## Working on this repo

- Branch: `claude/fuel-optimization-app-gplx1x`. Do not push elsewhere.
- One task per PR. Name the task id in the title, e.g. `T10: fuel optimiser DP`.
- Task files list explicit acceptance criteria — meet all of them, and say plainly
  in the PR which you verified and how.
- If you need to change something in `docs/CONTRACTS.md`, call it out prominently.
  Other tasks are being built against those types in parallel.
