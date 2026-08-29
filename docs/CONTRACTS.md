# Contracts

**This file is the single source of truth for every type crossing a module boundary.**
Task docs reference these names instead of re-describing them. If you need to change a
type here, say so in your PR description — other tasks are being built against it.

Implemented verbatim by **T02**. Everything else imports from `lib/types.ts`.

---

## Units — no exceptions

| Quantity | Unit | Type | Notes |
|---|---|---|---|
| Distance | **metres** | `number` | routing APIs return metres; convert only for display |
| Duration | **seconds** | `number` | |
| Volume | **litres** | `number` | |
| Price per litre | **euros** | `number` | 3 decimals, e.g. `1.729` |
| Money total | **euros** | `number` | round to 2 decimals at the display edge only |
| Timestamps | **ISO 8601 UTC** | `string` | e.g. `2026-08-29T07:14:00Z` |
| Coordinates | WGS84 decimal degrees | `number` | |

Never store a percentage. The UI collects tank percentages; the API converts to litres
at the boundary and everything downstream is litres.

---

## Primitives

```ts
export type CountryCode =
  | "NL" | "BE" | "LU" | "DE" | "FR" | "ES" | "IT" | "AT" | "CH" | "CZ" | "DK" | "PL";

export type FuelType = "e5" | "e10" | "diesel" | "lpg";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface BoundingBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}
```

---

## Stations and price providers

```ts
export type PriceSourceId =
  | "directlease"    // NL + BE
  | "anwb"           // NL (preferred if it works — see DATA-SOURCES.md)
  | "tankerkoenig"   // DE
  | "fr-gouv"        // FR
  | "es-minetur"     // ES
  | "it-mimit";      // IT

export interface Station {
  /** Globally unique, stable across refreshes: `${source}:${sourceId}` */
  id: string;
  source: PriceSourceId;
  /** Station id as the upstream knows it. */
  sourceId: string;
  name: string;
  brand?: string;
  address: string;
  town: string;
  postcode?: string;
  country: CountryCode;
  location: LatLon;
  /** €/litre. Absent key = that fuel is not sold or not reported. */
  prices: Partial<Record<FuelType, number>>;
  /** When the upstream says the price was observed. Never invent this. */
  observedAt: string;
  isMotorway?: boolean;
  openingHours?: string;
}

export interface PriceProvider {
  readonly id: PriceSourceId;
  readonly countries: readonly CountryCode[];
  /** True for reverse-engineered / unsanctioned sources. Surfaced in the API response. */
  readonly unofficial: boolean;
  /** Credit string required by the upstream's terms, if any. Show it wherever its prices appear. */
  readonly attribution?: string;
  /** Must resolve to [] (never throw) when the upstream is down — see Error handling. */
  stationsInBBox(
    bbox: BoundingBox,
    fuel: FuelType,
    signal?: AbortSignal,
  ): Promise<Station[]>;
}
```

**Provider rules, binding on every adapter:**

1. `stationsInBBox` **never throws**. On upstream failure, log and return `[]`. A dead
   German feed must not take down a Dutch route.
2. Never fabricate a price or a timestamp. A station with no usable price for the
   requested fuel is omitted entirely.
3. Deduplicate within your own source. Cross-source dedup is T09's job, not yours.
4. Respect `signal`. The API route aborts at 8 s.

---

## Routing

```ts
export interface GeocodeResult {
  label: string;          // "Amsterdam, Noord-Holland, NL"
  location: LatLon;
  country: CountryCode;
}

export interface Route {
  distanceM: number;
  durationS: number;
  /** Decoded, simplified to <= 2000 points, origin first, destination last. */
  polyline: LatLon[];
  /** Cumulative distance along the route for polyline[i]. Same length as polyline. */
  cumulativeM: number[];
  bbox: BoundingBox;
  /** Countries the route passes through, in order of first entry. */
  countries: CountryCode[];
}

export interface RoutingProvider {
  readonly id: string;
  route(from: LatLon, to: LatLon, signal?: AbortSignal): Promise<Route>;
  geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult[]>;
}
```

---

## Corridor

```ts
export interface CorridorStation extends Station {
  /** Distance from route origin, measured along the polyline. Strictly ascending. */
  distanceAlongRouteM: number;
  /** Shortest distance from the station to the route polyline. */
  detourM: number;
  /** Price for the requested fuel, resolved from `prices`. Always defined. */
  pricePerLitre: number;
}
```

---

## Vehicle

```ts
export interface Vehicle {
  /** Present when chosen from the bundled dataset; absent for manual entry. */
  id?: string;
  make?: string;
  model?: string;
  tankLitres: number;
  consumptionLPer100Km: number;
  fuel: FuelType;
}

export interface VehicleRecord {
  id: string;             // "vw-golf-15-tsi"
  make: string;           // "Volkswagen"
  model: string;          // "Golf 1.5 TSI"
  tankLitres: number;
  consumptionLPer100Km: number;
  fuel: FuelType;
}
```

---

## Optimiser

```ts
export interface PlanRequest {
  route: Route;
  corridor: CorridorStation[];
  vehicle: Vehicle;
  startLitres: number;
  /** Must have at least this much on arrival. */
  minArrivalLitres: number;
  /** Hard cap on refuelling stops. */
  maxStops: number;
  /** Never let the tank drop below this en route. Default 0. */
  reserveLitres?: number;
}

export interface PlanStop {
  station: CorridorStation;
  litres: number;
  pricePerLitre: number;
  cost: number;
  /** Tank level rolling into and out of this station. */
  arriveLitres: number;
  departLitres: number;
}

export interface Plan {
  feasible: true;
  stops: PlanStop[];
  totalCost: number;
  totalLitres: number;
  arrivalLitres: number;
}

export interface Infeasible {
  feasible: false;
  reason: "range" | "no-stations" | "arrival-target";
  message: string;
}

export type PlanResult = Plan | Infeasible;

export function optimise(req: PlanRequest): PlanResult;

/** Smallest feasible stop count, and the cheapest plan achieving it. */
export function fewestStops(
  req: Omit<PlanRequest, "maxStops">,
): { minStops: number; plan: Plan } | Infeasible;
```

**Optimiser guarantees — these are tested in T10:**

- `totalLitres` is within **1.0 L** of the analytic requirement
  `distanceM/1000 * consumption/100 - startLitres + minArrivalLitres`, and never under it.
- `arrivalLitres >= minArrivalLitres`.
- No `departLitres > tankLitres`, no `arriveLitres < reserveLitres`.
- `totalCost` is non-increasing as `maxStops` rises.
- `stops.length <= maxStops`.
- Pure and synchronous. No fetch, no clock, no randomness.

---

## API

`POST /api/plan`

```ts
export interface PlanApiRequest {
  from: string | LatLon;
  to: string | LatLon;
  vehicle: Vehicle;
  /** Exactly one of each pair. Percentages are of tankLitres. */
  startLitres?: number;
  startPercent?: number;
  arrivalLitres?: number;
  arrivalPercent?: number;
  maxStops?: number;      // default: minStops + 1
}

export interface PlanApiResponse {
  route: {
    from: GeocodeResult;
    to: GeocodeResult;
    distanceM: number;
    durationS: number;
    countries: CountryCode[];
  };
  minStops: number;
  maxStopsAvailable: number;   // minStops + 3
  cheapest: Plan;
  fewest: Plan;
  links: {
    cheapest: { google: string; apple: string };
    fewest: { google: string; apple: string };
  };
  sources: Array<{
    id: PriceSourceId;
    countries: CountryCode[];
    stationCount: number;
    oldestObservedAt: string;
    unofficial: boolean;
  }>;
  /** Countries on the route with no price coverage at all. */
  uncovered: CountryCode[];
}

export type PlanApiError =
  | { error: "geocode-failed"; field: "from" | "to"; message: string }
  | { error: "no-route"; message: string }
  | { error: "infeasible"; reason: Infeasible["reason"]; message: string }
  | { error: "upstream"; message: string };
```

HTTP: `200` for a plan, `422` for `infeasible` / `geocode-failed`, `502` for `upstream`,
`400` for a malformed body. Always JSON, always one of the shapes above.

---

## Maps links

```ts
export function googleMapsRouteUrl(from: string, to: string, stops: PlanStop[]): string;
export function appleMapsRouteUrl(from: string, to: string, stops: PlanStop[]): string;
export function googleMapsStationUrl(station: Station): string;
export function appleMapsStationUrl(station: Station): string;
```

Google caps waypoints at 9 — truncate with the earliest stops kept and note it.
No API key is required for any of these URLs.

---

## Error handling policy

| Layer | On failure |
|---|---|
| Price adapter | return `[]`, log with source id. Never throw. |
| Routing provider | throw; the API route maps it to `no-route` / `upstream`. |
| Optimiser | never throws; returns `Infeasible`. |
| API route | always returns one of the shapes above; never a stack trace. |
| UI | renders the `message` from the error shape verbatim. Never a raw 500. |
