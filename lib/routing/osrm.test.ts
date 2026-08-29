import { describe, expect, it } from "vitest";
import { OsrmRoutingProvider, parseOsrmRoute } from "./osrm";
import { NotSupportedError, RoutingError } from "./errors";

describe("parseOsrmRoute", () => {
  it("builds a Route from an OSRM-shaped response", () => {
    // Same encoded geometry as the ORS fixture — OSRM uses the same polyline
    // algorithm at precision 5 for geometries=polyline.
    const body = {
      code: "Ok",
      routes: [
        {
          distance: 808000,
          duration: 27000,
          geometry: "o`s~Hsy|\\rau@cmi@biu@wxjCzw|@gogEnclBczQvkpBkxyBn`o@{ntEnl}@shwF~faAskzE~{dCgdcAfizB{o]",
        },
      ],
    };

    const route = parseOsrmRoute(body);
    expect(route.distanceM).toBe(808000);
    expect(route.durationS).toBe(27000);
    expect(route.countries).toEqual(["NL", "DE"]);
  });

  it("throws a typed no-route error when code is not Ok", () => {
    expect(() => parseOsrmRoute({ code: "NoRoute", routes: [] })).toThrow(RoutingError);
  });
});

describe("OsrmRoutingProvider.geocode", () => {
  it("throws NotSupportedError", () => {
    const provider = new OsrmRoutingProvider();
    expect(() => provider.geocode()).toThrow(NotSupportedError);
  });
});
