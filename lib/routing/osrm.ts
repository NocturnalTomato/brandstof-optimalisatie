// Public OSRM adapter — routing only, no key, no SLA. Used when ORS_API_KEY is
// absent. See docs/DATA-SOURCES.md.

import type { GeocodeResult, LatLon, Route, RoutingProvider } from "../types";
import { decodePolyline } from "./polyline";
import { buildRoute } from "./build";
import { NotSupportedError, RoutingError } from "./errors";

const OSRM_BASE_URL = "https://router.project-osrm.org";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseOsrmRoute(body: any): Route {
  const route = body?.routes?.[0];
  if (body?.code !== "Ok" || !route?.geometry) {
    throw new RoutingError("OSRM could not find a route", "no-route");
  }

  const rawPoints: LatLon[] = decodePolyline(route.geometry, 5);
  return buildRoute(rawPoints, route.distance, route.duration);
}

export class OsrmRoutingProvider implements RoutingProvider {
  readonly id = "osrm";

  constructor(private readonly baseUrl: string = OSRM_BASE_URL) {}

  async route(from: LatLon, to: LatLon, signal?: AbortSignal): Promise<Route> {
    const url =
      `${this.baseUrl}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}` +
      `?overview=full&geometries=polyline`;

    let res: Response;
    try {
      res = await fetch(url, { signal });
    } catch (err) {
      throw new RoutingError(`OSRM request failed: ${String(err)}`, "upstream");
    }

    if (res.status === 400) {
      throw new RoutingError("OSRM could not find a route", "no-route");
    }
    if (!res.ok) {
      throw new RoutingError(`OSRM responded with ${res.status}`, "upstream");
    }

    const body = await res.json();
    return parseOsrmRoute(body);
  }

  geocode(): Promise<GeocodeResult[]> {
    throw new NotSupportedError("OsrmRoutingProvider does not support geocoding");
  }
}
