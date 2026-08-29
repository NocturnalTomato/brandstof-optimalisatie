// Public surface of lib/routing. See docs/tasks/T04-routing.md.

import type { RoutingProvider } from "../types";
import { OrsRoutingProvider } from "./ors";
import { OsrmRoutingProvider } from "./osrm";

/** ORS if `ORS_API_KEY` is set, else the keyless OSRM fallback. Never throws. */
export function getRoutingProvider(): RoutingProvider {
  const apiKey = process.env.ORS_API_KEY;
  if (apiKey) return new OrsRoutingProvider(apiKey);
  return new OsrmRoutingProvider();
}

export { OrsRoutingProvider } from "./ors";
export { OsrmRoutingProvider } from "./osrm";
export { RoutingError, NotSupportedError } from "./errors";
export { decodePolyline } from "./polyline";
export { countriesAlongRoute } from "./countries";
export { haversineM, cumulativeDistances, boundingBox, simplify, simplifyToMaxPoints } from "./geo";
