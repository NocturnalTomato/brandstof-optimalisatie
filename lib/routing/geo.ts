// Geometry helpers for working with decoded route polylines. Distances are metres
// throughout — see CONTRACTS.md.

import type { BoundingBox, LatLon } from "../types";

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineM(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cumulative distance along `points`. Same length as `points`; first element is 0. */
export function cumulativeDistances(points: LatLon[]): number[] {
  const cum: number[] = new Array(points.length);
  if (points.length === 0) return cum;
  cum[0] = 0;
  for (let i = 1; i < points.length; i++) {
    cum[i] = cum[i - 1] + haversineM(points[i - 1], points[i]);
  }
  return cum;
}

export function boundingBox(points: LatLon[], padM = 0): BoundingBox {
  if (points.length === 0) {
    throw new Error("boundingBox: points must not be empty");
  }

  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLon = points[0].lon;
  let maxLon = points[0].lon;

  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }

  if (padM > 0) {
    const midLat = (minLat + maxLat) / 2;
    const dLat = (padM / EARTH_RADIUS_M) * (180 / Math.PI);
    const dLon =
      (padM / (EARTH_RADIUS_M * Math.cos(toRad(midLat)))) * (180 / Math.PI);
    minLat -= dLat;
    maxLat += dLat;
    minLon -= dLon;
    maxLon += dLon;
  }

  return { minLat, minLon, maxLat, maxLon };
}

// Local equirectangular projection around `ref`, accurate enough for the short
// distances Douglas-Peucker compares over.
function toLocalXY(p: LatLon, ref: LatLon): { x: number; y: number } {
  const x = toRad(p.lon - ref.lon) * EARTH_RADIUS_M * Math.cos(toRad(ref.lat));
  const y = toRad(p.lat - ref.lat) * EARTH_RADIUS_M;
  return { x, y };
}

/** Shortest distance from `p` to the segment `a`-`b`, in metres. */
function pointToSegmentDistanceM(p: LatLon, a: LatLon, b: LatLon): number {
  const pr = toLocalXY(p, a);
  const br = toLocalXY(b, a);

  const dx = br.x;
  const dy = br.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(pr.x, pr.y);
  }

  const t = (pr.x * dx + pr.y * dy) / (dx * dx + dy * dy);
  const tc = Math.max(0, Math.min(1, t));
  const cx = tc * dx;
  const cy = tc * dy;
  return Math.hypot(pr.x - cx, pr.y - cy);
}

/**
 * Douglas-Peucker simplification. Never moves a kept point, and never drops a
 * point that lies more than `toleranceM` from the simplified line.
 */
export function simplify(points: LatLon[], toleranceM: number): LatLon[] {
  if (points.length <= 2) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    if (end <= start + 1) continue;

    let maxDist = -1;
    let maxIndex = -1;
    for (let i = start + 1; i < end; i++) {
      const d = pointToSegmentDistanceM(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        maxIndex = i;
      }
    }

    if (maxDist > toleranceM) {
      keep[maxIndex] = 1;
      stack.push([start, maxIndex]);
      stack.push([maxIndex, end]);
    }
  }

  const result: LatLon[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) result.push(points[i]);
  }
  return result;
}

/** Repeatedly simplifies with a doubling tolerance until at or under `maxPoints`. */
export function simplifyToMaxPoints(
  points: LatLon[],
  maxPoints: number,
  initialToleranceM = 5,
): LatLon[] {
  let result = points;
  let tolerance = initialToleranceM;
  while (result.length > maxPoints) {
    const next = simplify(result, tolerance);
    if (next.length === result.length) {
      // Tolerance too small to make progress (e.g. all points are far apart) —
      // grow faster instead of looping forever.
      tolerance *= 4;
      continue;
    }
    result = next;
    tolerance *= 2;
  }
  return result;
}
