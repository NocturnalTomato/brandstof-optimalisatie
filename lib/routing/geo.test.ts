import { describe, expect, it } from "vitest";
import type { LatLon } from "../types";
import {
  boundingBox,
  cumulativeDistances,
  haversineM,
  simplify,
  simplifyToMaxPoints,
} from "./geo";

const EARTH_RADIUS_M = 6_371_000;

/** Spherical cross-track distance from `p` to the great-circle segment a-b, clamped to the segment. */
function crossTrackDistanceM(p: LatLon, a: LatLon, b: LatLon): number {
  const distAB = haversineM(a, b);
  if (distAB === 0) return haversineM(p, a);

  const distAP = haversineM(a, p);
  const bearingAB = bearingRad(a, b);
  const bearingAP = bearingRad(a, p);

  const xt = Math.asin(
    Math.sin(distAP / EARTH_RADIUS_M) * Math.sin(bearingAP - bearingAB),
  ) * EARTH_RADIUS_M;

  // Along-track distance from a; clamp the perpendicular foot to the segment.
  const alongTrack =
    Math.acos(
      Math.min(1, Math.cos(distAP / EARTH_RADIUS_M) / Math.cos(xt / EARTH_RADIUS_M)),
    ) * EARTH_RADIUS_M;

  if (alongTrack <= 0) return haversineM(p, a);
  if (alongTrack >= distAB) return haversineM(p, b);
  return Math.abs(xt);
}

function bearingRad(a: LatLon, b: LatLon): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return Math.atan2(y, x);
}

describe("haversineM", () => {
  it("is zero for identical points", () => {
    expect(haversineM({ lat: 52.37, lon: 4.9 }, { lat: 52.37, lon: 4.9 })).toBe(0);
  });

  it("matches the known Amsterdam-Munich great-circle distance", () => {
    // Straight-line, not driving distance — road distance (~800km) is longer.
    const ams = { lat: 52.3676, lon: 4.9041 };
    const muc = { lat: 48.1351, lon: 11.582 };
    const d = haversineM(ams, muc);
    expect(d / 1000).toBeCloseTo(668, 0);
  });
});

describe("cumulativeDistances", () => {
  it("is monotonically non-decreasing", () => {
    const points: LatLon[] = [
      { lat: 52.37, lon: 4.9 },
      { lat: 52.09, lon: 5.12 },
      { lat: 51.81, lon: 5.84 },
      { lat: 50.94, lon: 6.96 },
    ];
    const cum = cumulativeDistances(points);
    expect(cum[0]).toBe(0);
    for (let i = 1; i < cum.length; i++) {
      expect(cum[i]).toBeGreaterThanOrEqual(cum[i - 1]);
    }
  });

  it("equals the sum of pairwise haversine distances", () => {
    const points: LatLon[] = [
      { lat: 52.37, lon: 4.9 },
      { lat: 51.5, lon: 4.0 },
      { lat: 50.0, lon: 8.0 },
    ];
    const cum = cumulativeDistances(points);
    const expected =
      haversineM(points[0], points[1]) + haversineM(points[1], points[2]);
    expect(cum[cum.length - 1]).toBeCloseTo(expected, 6);
  });

  it("returns an empty array for no points", () => {
    expect(cumulativeDistances([])).toEqual([]);
  });
});

describe("boundingBox", () => {
  const points: LatLon[] = [
    { lat: 50.0, lon: 4.0 },
    { lat: 52.0, lon: 6.0 },
    { lat: 51.0, lon: 5.0 },
  ];

  it("covers the min/max of the points with no padding", () => {
    expect(boundingBox(points)).toEqual({
      minLat: 50.0,
      minLon: 4.0,
      maxLat: 52.0,
      maxLon: 6.0,
    });
  });

  it("pads by the requested margin", () => {
    const unpadded = boundingBox(points);
    const padded = boundingBox(points, 10_000);
    expect(padded.minLat).toBeLessThan(unpadded.minLat);
    expect(padded.maxLat).toBeGreaterThan(unpadded.maxLat);
    expect(padded.minLon).toBeLessThan(unpadded.minLon);
    expect(padded.maxLon).toBeGreaterThan(unpadded.maxLon);

    // Roughly 10km of padding, within 5% (padding uses a flat-earth approximation).
    const latPadDeg = unpadded.minLat - padded.minLat;
    const latPadM = (latPadDeg / 180) * Math.PI * 6_371_000;
    expect(latPadM).toBeGreaterThan(9_500);
    expect(latPadM).toBeLessThan(10_500);
  });
});

describe("simplify", () => {
  it("never moves a point more than the tolerance from the original line", () => {
    const points: LatLon[] = [];
    for (let i = 0; i < 5000; i++) {
      const t = i / 4999;
      points.push({
        lat: 50 + t * 5,
        lon: 5 + t * 5 + 0.01 * Math.sin(t * 40),
      });
    }

    const toleranceM = 200;
    const simplified = simplify(points, toleranceM);

    expect(simplified.length).toBeLessThan(points.length);
    expect(simplified[0]).toEqual(points[0]);
    expect(simplified[simplified.length - 1]).toEqual(points[points.length - 1]);

    // Every original point must lie within tolerance of the simplified line —
    // check against the nearest simplified segment via an independent
    // (haversine cross-track) distance calculation.
    let maxDeviationM = 0;
    for (const p of points) {
      let minSegDist = Infinity;
      for (let i = 0; i < simplified.length - 1; i++) {
        minSegDist = Math.min(minSegDist, crossTrackDistanceM(p, simplified[i], simplified[i + 1]));
      }
      maxDeviationM = Math.max(maxDeviationM, minSegDist);
    }
    // Small buffer over toleranceM: the production code measures perpendicular
    // distance with a flat-earth projection, this check uses spherical
    // cross-track distance — they agree to well within 5% at this scale.
    expect(maxDeviationM).toBeLessThanOrEqual(toleranceM * 1.05);
  });

  it("keeps a 4-point line with a real corner intact", () => {
    const points: LatLon[] = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 1 },
      { lat: 1, lon: 1 },
      { lat: 1, lon: 2 },
    ];
    // Each corner deviates by ~111km from the straight line — tiny tolerance
    // keeps everything.
    expect(simplify(points, 1)).toEqual(points);
  });

  it("drops a point that sits on the line between its neighbours", () => {
    const points: LatLon[] = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 1 },
      { lat: 0, lon: 2 },
    ];
    expect(simplify(points, 1)).toEqual([points[0], points[2]]);
  });

  it("returns points unchanged when there are 2 or fewer", () => {
    const points: LatLon[] = [{ lat: 0, lon: 0 }];
    expect(simplify(points, 100)).toBe(points);
  });
});

describe("simplifyToMaxPoints", () => {
  it("simplifies a 5000-point line down to at most 2000 points", () => {
    const points: LatLon[] = [];
    for (let i = 0; i < 5000; i++) {
      const t = i / 4999;
      points.push({
        lat: 50 + t * 5,
        lon: 5 + t * 5 + 0.02 * Math.sin(t * 50),
      });
    }

    const simplified = simplifyToMaxPoints(points, 2000);
    expect(simplified.length).toBeLessThanOrEqual(2000);
    expect(simplified[0]).toEqual(points[0]);
    expect(simplified[simplified.length - 1]).toEqual(points[points.length - 1]);
  });

  it("is a no-op when already under the limit", () => {
    const points: LatLon[] = [
      { lat: 0, lon: 0 },
      { lat: 1, lon: 1 },
    ];
    expect(simplifyToMaxPoints(points, 2000)).toEqual(points);
  });
});
