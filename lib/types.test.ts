import { describe, expect, it } from "vitest";
import { COUNTRY_CODES, FUEL_TYPES } from "./types";
import type {
  BoundingBox,
  CorridorStation,
  CountryCode,
  FuelType,
  GeocodeResult,
  Infeasible,
  LatLon,
  Plan,
  PlanApiError,
  PlanApiRequest,
  PlanApiResponse,
  PlanRequest,
  PlanResult,
  PlanStop,
  PriceProvider,
  PriceSourceId,
  Route,
  RoutingProvider,
  Station,
  Vehicle,
  VehicleRecord,
} from "./types";

describe("const arrays", () => {
  it("COUNTRY_CODES matches CONTRACTS.md exactly", () => {
    expect(COUNTRY_CODES).toEqual([
      "NL", "BE", "LU", "DE", "FR", "ES", "IT", "AT", "CH", "CZ", "DK", "PL",
    ]);
  });

  it("FUEL_TYPES matches CONTRACTS.md exactly", () => {
    expect(FUEL_TYPES).toEqual(["e5", "e10", "diesel", "lpg"]);
  });
});

describe("type shapes compile with the fields CONTRACTS.md specifies", () => {
  it("primitives", () => {
    const country: CountryCode = "NL";
    const fuel: FuelType = "diesel";
    const latLon: LatLon = { lat: 52.37, lon: 4.9 };
    const bbox: BoundingBox = { minLat: 0, minLon: 0, maxLat: 1, maxLon: 1 };
    expect(country).toBe("NL");
    expect(fuel).toBe("diesel");
    expect(latLon.lat).toBe(52.37);
    expect(bbox.maxLon).toBe(1);
  });

  it("Station and PriceProvider", () => {
    const station: Station = {
      id: "anwb:123",
      source: "anwb",
      sourceId: "123",
      name: "Shell A1",
      address: "A1",
      town: "Amsterdam",
      country: "NL",
      location: { lat: 52.37, lon: 4.9 },
      prices: { diesel: 1.729 },
      observedAt: "2026-08-29T07:14:00Z",
    };
    expect(station.prices.diesel).toBe(1.729);

    const sourceId: PriceSourceId = "directlease";
    const provider: PriceProvider = {
      id: sourceId,
      countries: ["NL", "BE"],
      unofficial: true,
      stationsInBBox: async () => [],
    };
    expect(provider.id).toBe("directlease");
  });

  it("Routing", () => {
    const geocode: GeocodeResult = {
      label: "Amsterdam, Noord-Holland, NL",
      location: { lat: 52.37, lon: 4.9 },
      country: "NL",
    };
    const route: Route = {
      distanceM: 808_000,
      durationS: 3600,
      polyline: [geocode.location],
      cumulativeM: [0],
      bbox: { minLat: 0, minLon: 0, maxLat: 1, maxLon: 1 },
      countries: ["NL", "DE"],
    };
    const provider: RoutingProvider = {
      id: "ors",
      route: async () => route,
      geocode: async () => [geocode],
    };
    expect(provider.id).toBe("ors");
    expect(route.countries).toContain("DE");
  });

  it("CorridorStation extends Station", () => {
    const corridorStation: CorridorStation = {
      id: "anwb:123",
      source: "anwb",
      sourceId: "123",
      name: "Shell A1",
      address: "A1",
      town: "Amsterdam",
      country: "NL",
      location: { lat: 52.37, lon: 4.9 },
      prices: { diesel: 1.729 },
      observedAt: "2026-08-29T07:14:00Z",
      distanceAlongRouteM: 1000,
      detourM: 200,
      pricePerLitre: 1.729,
    };
    expect(corridorStation.pricePerLitre).toBe(1.729);
  });

  it("Vehicle and VehicleRecord", () => {
    const vehicle: Vehicle = {
      tankLitres: 50,
      consumptionLPer100Km: 6.2,
      fuel: "diesel",
    };
    const record: VehicleRecord = {
      id: "vw-golf-15-tsi",
      make: "Volkswagen",
      model: "Golf 1.5 TSI",
      tankLitres: 50,
      consumptionLPer100Km: 6.2,
      fuel: "e10",
    };
    expect(vehicle.fuel).toBe("diesel");
    expect(record.id).toBe("vw-golf-15-tsi");
  });

  it("Optimiser shapes", () => {
    const corridorStation: CorridorStation = {
      id: "anwb:123",
      source: "anwb",
      sourceId: "123",
      name: "Shell A1",
      address: "A1",
      town: "Amsterdam",
      country: "NL",
      location: { lat: 52.37, lon: 4.9 },
      prices: { diesel: 1.729 },
      observedAt: "2026-08-29T07:14:00Z",
      distanceAlongRouteM: 1000,
      detourM: 200,
      pricePerLitre: 1.729,
    };
    const stop: PlanStop = {
      station: corridorStation,
      litres: 40,
      pricePerLitre: 1.729,
      cost: 69.16,
      arriveLitres: 5,
      departLitres: 45,
    };
    const plan: Plan = {
      feasible: true,
      stops: [stop],
      totalCost: 69.16,
      totalLitres: 40,
      arrivalLitres: 10,
    };
    const infeasible: Infeasible = {
      feasible: false,
      reason: "range",
      message: "no",
    };
    const result: PlanResult = plan;
    const request: PlanRequest = {
      route: {
        distanceM: 1000,
        durationS: 100,
        polyline: [],
        cumulativeM: [],
        bbox: { minLat: 0, minLon: 0, maxLat: 1, maxLon: 1 },
        countries: ["NL"],
      },
      corridor: [corridorStation],
      vehicle: { tankLitres: 50, consumptionLPer100Km: 6.2, fuel: "diesel" },
      startLitres: 10,
      minArrivalLitres: 5,
      maxStops: 2,
    };
    expect(result.feasible).toBe(true);
    expect(infeasible.reason).toBe("range");
    expect(request.maxStops).toBe(2);
  });

  it("API shapes", () => {
    const apiRequest: PlanApiRequest = {
      from: "Amsterdam",
      to: { lat: 48.85, lon: 2.35 },
      vehicle: { tankLitres: 50, consumptionLPer100Km: 6.2, fuel: "diesel" },
      startPercent: 50,
      arrivalPercent: 20,
    };
    const errors: PlanApiError[] = [
      { error: "geocode-failed", field: "from", message: "x" },
      { error: "no-route", message: "x" },
      { error: "infeasible", reason: "range", message: "x" },
      { error: "upstream", message: "x" },
    ];
    expect(apiRequest.from).toBe("Amsterdam");
    expect(errors).toHaveLength(4);

    const response: Partial<PlanApiResponse> = {
      minStops: 1,
      maxStopsAvailable: 4,
      uncovered: ["LU"],
    };
    expect(response.uncovered).toEqual(["LU"]);
  });
});
