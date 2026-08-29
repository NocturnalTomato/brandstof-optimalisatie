// DirectLease Tankservice price adapter for NL + BE. Unsanctioned, private
// mobile-app API — read docs/DATA-SOURCES.md's "DirectLease" section before
// touching this file. `stationsInBBox` never throws: on any upstream failure it
// resolves to `[]` (see CONTRACTS.md). No DirectLease-shaped type may be
// exported from this module — every parsing type below stays private.

import type { BoundingBox, CountryCode, FuelType, PriceProvider, Station } from "../types";
import { fetchJson } from "./http";
import { registerProvider } from "./registry";
import { buildChecksumHeader } from "./directlease-auth";
import { mapNlFuelName } from "./nl-fuel-map";

const BASE_URL = "https://tankservice.app-it-up.com/Tankservice";
const PLACES_PATH = "/Tankservice/v2/places";
const MAX_STATIONS_PER_PLAN = 60;
const MAX_CONCURRENT_DETAIL_FETCHES = 6;

// -- Private wire types: DirectLease's shape never leaves this file. ---------

interface DirectLeasePlace {
  id?: number | string;
  name?: string;
  brand?: string;
  street?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  lat?: number;
  lng?: number;
  isMotorway?: boolean;
}

interface DirectLeasePlacesResponse {
  places?: DirectLeasePlace[];
}

interface DirectLeasePriceEntry {
  type?: string;
  /** €/litre x1000, per docs/tasks/T06-price-nl-be.md. */
  amount?: number;
  date?: string;
}

interface DirectLeaseStationResponse {
  id?: number | string;
  prices?: DirectLeasePriceEntry[];
}

function placesUrl(): string {
  return `${BASE_URL}/v2/places?fmt=web&country=NL&country=BE&lang=en`;
}

function stationPath(id: string): string {
  return `${PLACES_PATH}/${id}`;
}

function stationUrl(id: string): string {
  return `${BASE_URL}/v2/places/${id}?_v48&lang=en`;
}

function inBBox(bbox: BoundingBox, lat: number, lon: number): boolean {
  return lat >= bbox.minLat && lat <= bbox.maxLat && lon >= bbox.minLon && lon <= bbox.maxLon;
}

function isNlOrBe(country: string | undefined): country is CountryCode {
  return country === "NL" || country === "BE";
}

/** Places within bbox, with a valid id/location/country. Order preserved, capped. */
function filterPlaces(places: DirectLeasePlace[], bbox: BoundingBox): DirectLeasePlace[] {
  const filtered = places.filter(
    (place) =>
      place.id !== undefined &&
      place.id !== null &&
      typeof place.lat === "number" &&
      typeof place.lng === "number" &&
      isNlOrBe(place.country) &&
      inBBox(bbox, place.lat, place.lng),
  );
  return filtered.slice(0, MAX_STATIONS_PER_PLAN);
}

/** Runs `fn` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function formatAddress(place: DirectLeasePlace): string {
  return (place.street ?? "").trim();
}

function buildStation(place: DirectLeasePlace, detail: DirectLeaseStationResponse, fuel: FuelType): Station | null {
  let matchedAmount: number | undefined;
  let matchedDate: string | undefined;
  for (const entry of detail.prices ?? []) {
    if (mapNlFuelName(entry.type) === fuel && typeof entry.amount === "number" && entry.date) {
      matchedAmount = entry.amount;
      matchedDate = entry.date;
      break;
    }
  }
  if (matchedAmount === undefined || !matchedDate) return null;

  const sourceId = String(place.id);
  return {
    id: `directlease:${sourceId}`,
    source: "directlease",
    sourceId,
    name: place.name ?? "",
    brand: place.brand,
    address: formatAddress(place),
    town: place.city ?? "",
    postcode: place.postalCode,
    country: place.country as CountryCode,
    location: { lat: place.lat as number, lon: place.lng as number },
    prices: { [fuel]: matchedAmount / 1000 },
    observedAt: matchedDate,
    isMotorway: place.isMotorway,
  };
}

async function fetchStationDetail(id: string, signal?: AbortSignal): Promise<DirectLeaseStationResponse | null> {
  const headers = buildChecksumHeader(stationPath(id), new Date());
  return fetchJson<DirectLeaseStationResponse>(stationUrl(id), { signal, headers });
}

export class DirectLeasePriceProvider implements PriceProvider {
  readonly id = "directlease" as const;
  readonly countries = ["NL", "BE"] as const;
  readonly unofficial = true;

  async stationsInBBox(bbox: BoundingBox, fuel: FuelType, signal?: AbortSignal): Promise<Station[]> {
    const headers = buildChecksumHeader(PLACES_PATH, new Date());
    const body = await fetchJson<DirectLeasePlacesResponse>(placesUrl(), { signal, headers });
    if (!body || !Array.isArray(body.places)) return [];

    // Filter to the bbox — and cap — BEFORE fetching any per-station detail.
    // Never fetch every place in NL+BE per request.
    const candidates = filterPlaces(body.places, bbox);
    if (candidates.length === 0) return [];

    const details = await mapWithConcurrency(candidates, MAX_CONCURRENT_DETAIL_FETCHES, (place) =>
      fetchStationDetail(String(place.id), signal),
    );

    const stations: Station[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const detail = details[i];
      if (!detail) continue;
      const station = buildStation(candidates[i], detail, fuel);
      if (station) stations.push(station);
    }
    return stations;
  }
}

registerProvider(new DirectLeasePriceProvider());
