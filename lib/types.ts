// Every type crossing a module boundary. Transcribed verbatim from docs/CONTRACTS.md.
// Do not redeclare these shapes elsewhere — import from here.

export const COUNTRY_CODES = [
  "NL", "BE", "LU", "DE", "FR", "ES", "IT", "AT", "CH", "CZ", "DK", "PL",
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

export const FUEL_TYPES = ["e5", "e10", "diesel", "lpg"] as const;

export type FuelType = (typeof FUEL_TYPES)[number];

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

// ---------------------------------------------------------------------------
// Stations and price providers
// ---------------------------------------------------------------------------

export type PriceSourceId =
  | "directlease" // NL + BE
  | "anwb" // NL (preferred if it works — see DATA-SOURCES.md)
  | "tankerkoenig" // DE
  | "fr-gouv" // FR
  | "es-minetur" // ES
  | "it-mimit"; // IT

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

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export interface GeocodeResult {
  label: string; // "Amsterdam, Noord-Holland, NL"
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

// ---------------------------------------------------------------------------
// Corridor
// ---------------------------------------------------------------------------

export interface CorridorStation extends Station {
  /** Distance from route origin, measured along the polyline. Strictly ascending. */
  distanceAlongRouteM: number;
  /** Shortest distance from the station to the route polyline. */
  detourM: number;
  /** Price for the requested fuel, resolved from `prices`. Always defined. */
  pricePerLitre: number;
}

// ---------------------------------------------------------------------------
// Vehicle
// ---------------------------------------------------------------------------

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
  id: string; // "vw-golf-15-tsi"
  make: string; // "Volkswagen"
  model: string; // "Golf 1.5 TSI"
  tankLitres: number;
  consumptionLPer100Km: number;
  fuel: FuelType;
}

// ---------------------------------------------------------------------------
// Optimiser
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export interface PlanApiRequest {
  from: string | LatLon;
  to: string | LatLon;
  vehicle: Vehicle;
  /** Exactly one of each pair. Percentages are of tankLitres. */
  startLitres?: number;
  startPercent?: number;
  arrivalLitres?: number;
  arrivalPercent?: number;
  maxStops?: number; // default: minStops + 1
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
  maxStopsAvailable: number; // minStops + 3
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
