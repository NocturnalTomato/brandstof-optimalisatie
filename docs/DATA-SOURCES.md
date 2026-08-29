# Data sources

Everything external the app touches, what it costs, and where it will bite you.
Researched 2026-08-29. **Verify each endpoint before building against it** — several
could not be reached from the development sandbox (see the warning at the bottom).

---

## Fuel prices

There is **no free pan-European per-station price API**. Coverage is assembled
country by country. Each becomes one `PriceProvider` (see CONTRACTS.md).

| Country | Source | Endpoint | Key | Refresh | Task |
|---|---|---|---|---|---|
| NL, BE | DirectLease Tankservice | `https://tankservice.app-it-up.com/Tankservice/v2/places?fmt=web&country=NL&country=BE&lang=en` then `/v2/places/{id}?_v48&lang=en` | none, but see below | ~daily | T06 |
| NL | ANWB POI | `https://api.anwb.nl/routing/points-of-interest/v3/all?type-filter=FUEL_STATION&bounding-box-filter={minLat},{minLon},{maxLat},{maxLon}` | **still unverified — needs a live Vercel-preview check** (see below) | live | T06 |
| DE | Tankerkönig (MTS-K) | `https://creativecommons.tankerkoenig.de/json/list.php?lat=&lng=&rad=&type=all&apikey=` | free key, env `TANKERKOENIG_API_KEY` | live | T07 |
| FR | data.economie.gouv.fr | `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records` | none | live | T08 |
| ES | Ministerio / sedeaplicaciones | `https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/` | none | daily | T08 |
| IT | MIMIT open data | `https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv` + `anagrafica_impianti_attivi.csv` | none | daily | T08 |

### ANWB POI — key requirement still unverified (T06)

`api.anwb.nl` is one of the endpoints the sandbox cannot reach (see the warning at
the bottom of this file), so whether it needs a key could not be established by
actually calling it. `lib/prices/anwb.ts` is built to degrade gracefully either
way: it reads an optional `ANWB_API_KEY` env var and, only if it is set, attaches
it as an `Ocp-Apim-Subscription-Key` header (a guess based on Dutch corporate/
government APIs commonly sitting behind Azure APIM — unconfirmed). If the key
turns out to be required and named differently, or not required at all, fix the
header name/logic in `anwb.ts` and this note together.

**This is a claim, not a finding: it still needs a live Vercel-preview check**
before anyone treats the key requirement as settled. If that check shows ANWB is
keyless and complete for NL, DirectLease can be dropped per the decision below.

### DirectLease — read this before using it

The NL/BE feed is the app's only route to Dutch prices, and it comes with real
strings attached:

- It is a **private mobile-app API**, not a published one. Requests need an
  `X-Checksum` header derived from a device UUID, date and request path.
- DirectLease renders prices on their own website **as PNG images specifically to
  prevent scraping**. The anti-automation posture is deliberate.
- Using it means presenting as their app client.

This is a product and legal decision, not a technical one, and it was taken
knowingly by the repo owner. Consequences for how you build:

- Keep it strictly behind `PriceProvider`. No DirectLease type may leak past the adapter.
- Try **ANWB first** at runtime; fall back to DirectLease. If ANWB turns out to be
  keyless and complete, we drop DirectLease entirely.
- Expect it to break without warning. `[]` on failure, never a thrown error.
- Never hammer it: one bbox fetch per plan, cached hard (T14).

### Spain and Italy return the whole country

The ES and IT endpoints have no bbox parameter — they return every station nationally
(~12k and ~25k rows). Fetch once, cache for the full refresh interval, filter to the
bbox in memory. Do not fetch these per request.

### Belgium

DirectLease covers BE. The Belgian government publishes only national maximum prices,
not per-station, so there is no official fallback. If DirectLease dies, BE goes
uncovered and the API reports it in `uncovered`.

---

## Routing and geocoding

| Provider | Use | Key | Limits |
|---|---|---|---|
| **OpenRouteService** (default) | `/v2/directions/driving-car`, `/geocode/search` | free key, env `ORS_API_KEY` | 2 000 req/day, 40/min |
| Public OSRM (fallback) | `https://router.project-osrm.org/route/v1/driving/...` | none | best-effort, no SLA, no geocoding |
| Google Directions | not used | billed | adapter-ready, not built |

Routing sits behind `RoutingProvider` so Google can be dropped in later without
touching the optimiser or UI.

**Maps deep links need no key at all** and are unrelated to the routing provider:

- Google: `https://www.google.com/maps/dir/?api=1&origin=…&destination=…&waypoints=a|b`
  (max 9 waypoints)
- Apple: `http://maps.apple.com/?saddr=…&daddr=a+to:b+to:…`

---

## Vehicle consumption

There is **no free EU make/model → L/100km API**. `fueleconomy.gov` is free and
keyless but US-market and in MPG.

Decision: **bundle a dataset**, generated offline from the EEA CO₂-monitoring /
UK VCA datasets, trimmed to models common in Europe. Ships as
`lib/vehicle/vehicles.json`. Manual entry (tank + L/100km) is always available and
always wins. See T03.

Later, optional: RDW open data (`https://opendata.rdw.nl/resource/m9d7-ebf2.json`)
gives make/model/fuel from a Dutch licence plate, but not consumption — it would
narrow a lookup into the bundled table, not replace it.

---

## Environment variables

```
ORS_API_KEY=            # required — OpenRouteService
TANKERKOENIG_API_KEY=   # required for German prices
ANWB_API_KEY=           # optional — attached if set; requirement unverified, see T06 note above
DIRECTLEASE_DEVICE_UUID=# optional — overrides the device id used in the X-Checksum header, see lib/prices/directlease-auth.ts
PRICE_CACHE_TTL_S=900   # optional, default 900
NEXT_PUBLIC_APP_ENV=    # optional
```

All keys are server-side only. No key may appear in a `NEXT_PUBLIC_` variable or
reach the browser — that is what the `/api` proxy layer exists for.

---

## ⚠ The development sandbox cannot reach any of these

The environment these docs were written in blocks outbound access to every price
API and to OSRM at the egress proxy. That has two consequences you must plan for:

1. **Build every adapter against recorded fixtures.** Save one real response per
   source under `lib/prices/__fixtures__/<source>.json` and unit-test the parser
   against it. This is the acceptance criterion, not a live call.
2. **Live verification happens on Vercel**, on a preview deployment, not locally.
   Treat "the fixture parses" and "the endpoint answers" as two separate claims,
   and do not report the second until you have actually seen it.

If an endpoint in the table above turns out to be wrong or dead, fix the table in
the same PR that discovers it.

**T06 note:** both `api.anwb.nl` and `tankservice.app-it-up.com` are confirmed
egress-blocked from this sandbox — not just "recorded fixtures" but genuinely
unreachable, including from any subagent. So `lib/prices/__fixtures__/anwb-poi.json`,
`directlease-places.json`, and `directlease-station.json` are **hand-authored
representative payloads, not live captures** — each fixture file says so in its own
top-level `_comment` field. They are shaped from the field names implied by
`docs/tasks/T06-price-nl-be.md`, the endpoint URLs/params above, and general public
knowledge of how ANWB's POI v3 and DirectLease's Tankservice v2 APIs are structured.
Treat "the fixture parses into a valid `Station[]`" and "the live endpoint answers
with this shape" as two separate claims — the second is unverified pending a real
Vercel-preview check, consistent with the sandbox warning above.

**T07 note:** `creativecommons.tankerkoenig.de` is also confirmed egress-blocked
from this sandbox (the CONNECT tunnel returns 403), so
`lib/prices/__fixtures__/tankerkoenig-list.json` is likewise a **hand-authored
representative payload**, shaped from the field names publicly documented for
`list.php` (`id`, `name`, `brand`, `street`, `houseNumber`, `place`, `postCode`,
`lat`, `lng`, `diesel`, `e5`, `e10`, `isOpen`) — flagged the same way in the
fixture's own `_comment` field, pending a live Vercel-preview check.

One thing worth flagging rather than quietly working around: `list.php`'s
documented schema carries **no per-station or response-level observation
timestamp** at all — unlike ANWB's `lastUpdated` or a cached snapshot, there is
nothing in the payload to read `observedAt` from. `lib/prices/tankerkoenig.ts`
resolves this by treating the moment of each `stationsInBBox` call as the
observation time (captured once per call, shared by every station that call
returns, not re-read per station) — reasonable for a feed this project's own
table above already lists as "live", but it is a real gap in the upstream API,
not a task-doc assumption confirmed against a live response. If a live check
turns up a timestamp field this missed, wire it in and drop this note.
