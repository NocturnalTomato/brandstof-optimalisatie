// Shared step from "decoded raw polyline" to the `Route` shape in CONTRACTS.md.
// Used by every provider so simplification, bbox and country resolution stay
// consistent regardless of which upstream produced the points.

import type { Route, LatLon } from "../types";
import { boundingBox, cumulativeDistances, simplifyToMaxPoints } from "./geo";
import { countriesAlongRoute } from "./countries";

export const MAX_POLYLINE_POINTS = 2000;

export function buildRoute(
  rawPoints: LatLon[],
  distanceM: number,
  durationS: number,
): Route {
  const polyline = simplifyToMaxPoints(rawPoints, MAX_POLYLINE_POINTS);
  const cumulativeM = cumulativeDistances(polyline);
  const bbox = boundingBox(polyline);
  const countries = countriesAlongRoute(polyline);

  return { distanceM, durationS, polyline, cumulativeM, bbox, countries };
}
