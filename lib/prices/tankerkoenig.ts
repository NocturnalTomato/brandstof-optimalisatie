// Tankerkönig (MTS-K) price adapter for Germany — see docs/DATA-SOURCES.md and
// docs/tasks/T07-price-de.md. `stationsInBBox` never throws: on any upstream
// failure it resolves to `[]` (see CONTRACTS.md).
//
// The upstream `list.php` endpoint takes a centre + radius (capped at 25 km), not
// a bbox. A route bbox is usually far bigger than that, so we tile it with
// overlapping circles, fetch each tile with bounded concurrency, and merge by
// station id before returning — see `planTiles` below.

import type { BoundingBox, FuelType, LatLon, PriceProvider, Station } from "../types";
import { fetchJson } from "./http";
import { registerProvider } from "./registry";

const BASE_URL = "https://creativecommons.tankerkoenig.de/json/list.php";

const TILE_RADIUS_KM = 20; // under the API's 25 km cap, with overlap margin
const MAX_TILES = 40;
const TILE_CONCURRENCY = 4;

const EARTH_RADIUS_M = 6_371_000;

export const TANKERKOENIG_ATTRIBUTION =
  "Tankpreise bereitgestellt von Tankerkönig (Daten: Markttransparenzstelle für Kraftstoffe, MTS-K)";

type TankerkoenigFuel = "e5" | "e10" | "diesel";

function toApiFuel(fuel: FuelType): TankerkoenigFuel | null {
  if (fuel === "e5" || fuel === "e10" || fuel === "diesel") return fuel;
  return null; // MTS-K does not cover LPG
}

interface TankerkoenigStation {
  id?: string;
  name?: string;
  brand?: string;
  street?: string;
  houseNumber?: string;
  place?: string;
  postCode?: number | string;
  lat?: number;
  lng?: number;
  diesel?: number | null | false;
  e5?: number | null | false;
  e10?: number | null | false;
  isOpen?: boolean;
}

interface TankerkoenigResponse {
  ok?: boolean;
  status?: string;
  stations?: TankerkoenigStation[];
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Covers `bbox` with circle centres of `radiusKm`, capped at `maxTiles`. Under
 * the cap, lays a grid with enough overlap that no gap falls between circles.
 * Over the cap, falls back to `maxTiles` centres evenly spaced along the bbox's
 * diagonal — coarser, but it still spans the whole bbox instead of silently
 * shrinking coverage to a corner of it.
 */
export function planTiles(bbox: BoundingBox, radiusKm: number, maxTiles: number): LatLon[] {
  const radiusM = radiusKm * 1000;
  // Slightly less than radius*sqrt(2) so adjacent circles overlap rather than
  // just touch at their corners.
  const stepM = radiusM * 1.3;

  const midLat = (bbox.minLat + bbox.maxLat) / 2;
  const dLat = (stepM / EARTH_RADIUS_M) * (180 / Math.PI);
  const cosLat = Math.max(Math.cos(toRad(midLat)), 1e-6);
  const dLon = (stepM / (EARTH_RADIUS_M * cosLat)) * (180 / Math.PI);

  const grid: LatLon[] = [];
  for (let lat = bbox.minLat; lat <= bbox.maxLat + dLat / 2; lat += dLat) {
    for (let lon = bbox.minLon; lon <= bbox.maxLon + dLon / 2; lon += dLon) {
      grid.push({ lat: Math.min(lat, bbox.maxLat), lon: Math.min(lon, bbox.maxLon) });
    }
  }

  if (grid.length <= maxTiles) return grid;

  // Route-sampled fallback: walk the bbox diagonal, which for a routing bbox is
  // a reasonable proxy for the corridor itself (bboxes here come from routes,
  // not open rectangles).
  const from: LatLon = { lat: bbox.minLat, lon: bbox.minLon };
  const to: LatLon = { lat: bbox.maxLat, lon: bbox.maxLon };
  const sampled: LatLon[] = [];
  const count = Math.max(maxTiles, 1);
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    sampled.push({
      lat: from.lat + (to.lat - from.lat) * t,
      lon: from.lon + (to.lon - from.lon) * t,
    });
  }
  return sampled;
}

function parseStation(raw: TankerkoenigStation, fuel: TankerkoenigFuel, observedAt: string): Station | null {
  if (!raw.id || raw.lat === undefined || raw.lng === undefined) return null;
  const price = raw[fuel];
  if (typeof price !== "number") return null;

  return {
    id: `tankerkoenig:${raw.id}`,
    source: "tankerkoenig",
    sourceId: raw.id,
    name: raw.name ?? "",
    brand: raw.brand,
    address: [raw.street, raw.houseNumber].filter(Boolean).join(" ").trim(),
    town: raw.place ?? "",
    postcode: raw.postCode !== undefined ? String(raw.postCode) : undefined,
    country: "DE",
    location: { lat: raw.lat, lon: raw.lng },
    prices: { [fuel]: price },
    observedAt,
  };
}

async function fetchTile(
  centre: LatLon,
  radiusKm: number,
  apiFuel: TankerkoenigFuel,
  apiKey: string,
  signal: AbortSignal | undefined,
  observedAt: string,
): Promise<Station[]> {
  const params = new URLSearchParams({
    lat: String(centre.lat),
    lng: String(centre.lon),
    rad: String(radiusKm),
    type: apiFuel,
    apikey: apiKey,
  });

  const body = await fetchJson<TankerkoenigResponse>(`${BASE_URL}?${params.toString()}`, { signal });
  if (!body || body.ok !== true || !Array.isArray(body.stations)) return [];

  const stations: Station[] = [];
  for (const raw of body.stations) {
    const station = parseStation(raw, apiFuel, observedAt);
    if (station) stations.push(station);
  }
  return stations;
}

/** Runs `tasks` with at most `limit` in flight at once. */
async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

export class TankerkoenigPriceProvider implements PriceProvider {
  readonly id = "tankerkoenig" as const;
  readonly countries = ["DE"] as const;
  readonly unofficial = false;
  readonly attribution = TANKERKOENIG_ATTRIBUTION;

  async stationsInBBox(bbox: BoundingBox, fuel: FuelType, signal?: AbortSignal): Promise<Station[]> {
    const apiFuel = toApiFuel(fuel);
    const apiKey = process.env.TANKERKOENIG_API_KEY;
    if (!apiFuel || !apiKey) return [];

    const tiles = planTiles(bbox, TILE_RADIUS_KM, MAX_TILES);
    // list.php has no per-station or response-level observation timestamp (its
    // schema was checked against the endpoint docs referenced in
    // DATA-SOURCES.md — no field carries one). Since this feed is queried live
    // rather than served from a stale cache, the moment of this batch's fetch is
    // the true observation time, not a fabricated one; it is captured once here
    // and shared by every station this call returns, rather than re-read per
    // station or per tile.
    const observedAt = new Date().toISOString();

    const tileResults = await runWithConcurrency(
      tiles.map((centre) => () => fetchTile(centre, TILE_RADIUS_KM, apiFuel, apiKey, signal, observedAt)),
      TILE_CONCURRENCY,
    );

    const byId = new Map<string, Station>();
    for (const stations of tileResults) {
      for (const station of stations) {
        byId.set(station.id, station);
      }
    }
    return [...byId.values()];
  }
}

registerProvider(new TankerkoenigPriceProvider());
