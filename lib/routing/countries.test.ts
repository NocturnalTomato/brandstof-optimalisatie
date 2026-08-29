import { describe, expect, it } from "vitest";
import type { LatLon } from "../types";
import { decodePolyline } from "./polyline";
import { countriesAlongRoute } from "./countries";
import fixture from "./__fixtures__/ors-route-ams-muc.json";

describe("countriesAlongRoute", () => {
  it("returns exactly [NL, DE] on the Amsterdam-Munchen fixture", () => {
    const polyline = decodePolyline(fixture.routes[0].geometry, 5);
    expect(countriesAlongRoute(polyline)).toEqual(["NL", "DE"]);
  });

  it("returns exactly [NL, BE, FR] on a Rotterdam-Paris route", () => {
    // Coarse waypoints along the real A16/A1 corridor, densified so the 10km
    // sampling interval sees every country. Real ORS geometry would be far
    // denser; countriesAlongRoute only cares about spacing, not source.
    const waypoints: LatLon[] = [
      { lat: 51.9225, lon: 4.47917 }, // Rotterdam, NL
      { lat: 51.5888, lon: 4.7766 }, // Breda, NL
      { lat: 51.2194, lon: 4.4025 }, // Antwerp, BE
      { lat: 50.8503, lon: 4.3517 }, // Brussels, BE
      { lat: 50.4542, lon: 3.9526 }, // Mons, BE
      { lat: 50.3714, lon: 3.5238 }, // Valenciennes, FR
      { lat: 49.85, lon: 3.0 }, // near St-Quentin, FR
      { lat: 48.8566, lon: 2.3522 }, // Paris, FR
    ];

    const polyline = densify(waypoints, 3_000);
    expect(countriesAlongRoute(polyline)).toEqual(["NL", "BE", "FR"]);
  });

  it("returns an empty array for an empty polyline", () => {
    expect(countriesAlongRoute([])).toEqual([]);
  });

  it("returns a single country for a route that never leaves it", () => {
    const polyline = densify(
      [
        { lat: 52.37, lon: 4.9 }, // Amsterdam
        { lat: 51.92, lon: 4.48 }, // Rotterdam
      ],
      5_000,
    );
    expect(countriesAlongRoute(polyline)).toEqual(["NL"]);
  });
});

/** Linearly interpolates extra points so consecutive points are <= stepM apart. */
function densify(waypoints: LatLon[], stepM: number): LatLon[] {
  const result: LatLon[] = [waypoints[0]];
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    const distM = haversineApprox(a, b);
    const steps = Math.max(1, Math.ceil(distM / stepM));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      result.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t });
    }
  }
  return result;
}

function haversineApprox(a: LatLon, b: LatLon): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
