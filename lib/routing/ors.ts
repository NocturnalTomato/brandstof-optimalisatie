// OpenRouteService adapter. Default routing provider when ORS_API_KEY is set —
// see docs/DATA-SOURCES.md for endpoints and limits.

import type { CountryCode, GeocodeResult, LatLon, Route, RoutingProvider } from "../types";
import { decodePolyline } from "./polyline";
import { buildRoute } from "./build";
import { RoutingError } from "./errors";

const ORS_BASE_URL = "https://api.openrouteservice.org";

const ISO3_TO_CODE: Record<string, CountryCode> = {
  NLD: "NL",
  BEL: "BE",
  LUX: "LU",
  DEU: "DE",
  FRA: "FR",
  ESP: "ES",
  ITA: "IT",
  AUT: "AT",
  CHE: "CH",
  CZE: "CZ",
  DNK: "DK",
  POL: "PL",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseOrsDirections(body: any): Route {
  const route = body?.routes?.[0];
  if (!route?.geometry || !route?.summary) {
    throw new RoutingError("ORS response had no usable route", "no-route");
  }

  const rawPoints: LatLon[] = decodePolyline(route.geometry, 5);
  return buildRoute(rawPoints, route.summary.distance, route.summary.duration);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseOrsGeocode(body: any): GeocodeResult[] {
  const features: unknown[] = Array.isArray(body?.features) ? body.features : [];
  const results: GeocodeResult[] = [];

  for (const feature of features) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = feature as any;
    const coords = f?.geometry?.coordinates;
    const props = f?.properties ?? {};
    if (!Array.isArray(coords) || coords.length < 2) continue;

    const code = typeof props.country_a === "string" ? ISO3_TO_CODE[props.country_a] : undefined;
    if (!code) continue; // outside the countries this app covers

    results.push({
      label: typeof props.label === "string" ? props.label : "",
      location: { lat: coords[1], lon: coords[0] },
      country: code,
    });
  }

  return results;
}

export class OrsRoutingProvider implements RoutingProvider {
  readonly id = "ors";

  constructor(private readonly apiKey: string) {}

  async route(from: LatLon, to: LatLon, signal?: AbortSignal): Promise<Route> {
    let res: Response;
    try {
      res = await fetch(`${ORS_BASE_URL}/v2/directions/driving-car`, {
        method: "POST",
        headers: {
          Authorization: this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coordinates: [
            [from.lon, from.lat],
            [to.lon, to.lat],
          ],
        }),
        signal,
      });
    } catch (err) {
      throw new RoutingError(`ORS request failed: ${String(err)}`, "upstream");
    }

    if (res.status === 400 || res.status === 404) {
      // ORS returns 400/404 both for malformed requests and for "no route found
      // between these points" — treat both as no-route rather than upstream.
      throw new RoutingError("ORS could not find a route", "no-route");
    }
    if (!res.ok) {
      throw new RoutingError(`ORS responded with ${res.status}`, "upstream");
    }

    const body = await res.json();
    return parseOrsDirections(body);
  }

  async geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
    const url = new URL(`${ORS_BASE_URL}/geocode/search`);
    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("text", query);
    url.searchParams.set("size", "5");

    let res: Response;
    try {
      res = await fetch(url, { signal });
    } catch (err) {
      throw new RoutingError(`ORS geocode request failed: ${String(err)}`, "upstream");
    }
    if (!res.ok) {
      throw new RoutingError(`ORS geocode responded with ${res.status}`, "upstream");
    }

    const body = await res.json();
    return parseOrsGeocode(body);
  }
}
