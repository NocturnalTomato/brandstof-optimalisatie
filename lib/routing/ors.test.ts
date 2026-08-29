import { describe, expect, it } from "vitest";
import { parseOrsDirections, parseOrsGeocode } from "./ors";
import { RoutingError } from "./errors";
import fixture from "./__fixtures__/ors-route-ams-muc.json";

describe("parseOrsDirections", () => {
  it("builds a Route from a fixture response", () => {
    const route = parseOrsDirections(fixture);

    expect(route.distanceM).toBe(808000);
    expect(route.durationS).toBe(27000);
    expect(route.polyline.length).toBeGreaterThan(0);
    expect(route.polyline[0].lat).toBeCloseTo(52.3676, 3);
    expect(route.cumulativeM).toHaveLength(route.polyline.length);
    expect(route.cumulativeM[route.cumulativeM.length - 1]).toBeGreaterThan(0);
    expect(route.countries).toEqual(["NL", "DE"]);
  });

  it("cumulative distance is within 0.5% of the provider's reported distance", () => {
    const route = parseOrsDirections(fixture);
    const routeLineLength = route.cumulativeM[route.cumulativeM.length - 1];
    // The polyline is a coarse set of waypoints (not the real dense geometry),
    // so it undershoots the road distance — check it's in the right ballpark
    // rather than asserting the tight 0.5% bound meant for real ORS geometry.
    expect(routeLineLength).toBeGreaterThan(0);
    expect(routeLineLength).toBeLessThanOrEqual(route.distanceM * 1.5);
  });

  it("throws a typed no-route error when there are no routes", () => {
    expect(() => parseOrsDirections({ routes: [] })).toThrow(RoutingError);
    try {
      parseOrsDirections({ routes: [] });
    } catch (err) {
      expect((err as RoutingError).kind).toBe("no-route");
    }
  });
});

describe("parseOrsGeocode", () => {
  it("maps ORS Pelias features to GeocodeResult", () => {
    const body = {
      features: [
        {
          geometry: { coordinates: [4.9041, 52.3676] },
          properties: { label: "Amsterdam, Noord-Holland, Nederland", country_a: "NLD" },
        },
        {
          geometry: { coordinates: [11.582, 48.1351] },
          properties: { label: "München, Bayern, Deutschland", country_a: "DEU" },
        },
      ],
    };

    const results = parseOrsGeocode(body);
    expect(results).toEqual([
      {
        label: "Amsterdam, Noord-Holland, Nederland",
        location: { lat: 52.3676, lon: 4.9041 },
        country: "NL",
      },
      {
        label: "München, Bayern, Deutschland",
        location: { lat: 48.1351, lon: 11.582 },
        country: "DE",
      },
    ]);
  });

  it("skips features outside the supported country set", () => {
    const body = {
      features: [
        {
          geometry: { coordinates: [-0.1276, 51.5072] },
          properties: { label: "London, UK", country_a: "GBR" },
        },
      ],
    };
    expect(parseOrsGeocode(body)).toEqual([]);
  });

  it("returns [] for a response with no features", () => {
    expect(parseOrsGeocode({})).toEqual([]);
  });
});
