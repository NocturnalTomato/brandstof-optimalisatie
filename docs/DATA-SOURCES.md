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
| NL | ANWB POI | `https://api.anwb.nl/routing/points-of-interest/v3/all?type-filter=FUEL_STATION&bounding-box-filter={minLat},{minLon},{maxLat},{maxLon}` | unknown — verify | live | T06 |
| DE | Tankerkönig (MTS-K) | `https://creativecommons.tankerkoenig.de/json/list.php?lat=&lng=&rad=&type=all&apikey=` | free key, env `TANKERKOENIG_API_KEY` | live | T07 |
| FR | data.economie.gouv.fr | `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records` | none | live | T08 |
| ES | Ministerio / sedeaplicaciones | `https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/` | none | daily | T08 |
| IT | MIMIT open data | `https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv` + `anagrafica_impianti_attivi.csv` | none | daily | T08 |

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
