import { describe, expect, it } from "vitest";
import { decodePolyline } from "./polyline";
import fixture from "./__fixtures__/ors-route-ams-muc.json";

describe("decodePolyline", () => {
  it("matches a known-good fixture exactly", () => {
    const route = fixture.routes[0];
    const points = decodePolyline(route.geometry, 5);
    expect(points).toHaveLength(route.waypoints.length);
    for (let i = 0; i < points.length; i++) {
      expect(points[i].lat).toBeCloseTo(route.waypoints[i][0], 5);
      expect(points[i].lon).toBeCloseTo(route.waypoints[i][1], 5);
    }
  });

  it("decodes the well-known Google example", () => {
    // From Google's polyline algorithm documentation.
    const points = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5);
    expect(points).toEqual([
      { lat: 38.5, lon: -120.2 },
      { lat: 40.7, lon: -120.95 },
      { lat: 43.252, lon: -126.453 },
    ]);
  });

  it("returns an empty array for an empty string", () => {
    expect(decodePolyline("")).toEqual([]);
  });
});
