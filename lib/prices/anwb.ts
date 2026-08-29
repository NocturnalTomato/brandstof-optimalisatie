// ANWB POI price adapter for the Netherlands. Try this before directlease.ts — see
// docs/DATA-SOURCES.md and docs/tasks/T06-price-nl-be.md. `stationsInBBox` never
// throws: on any upstream failure it resolves to `[]` (see CONTRACTS.md).

import type { BoundingBox, FuelType, PriceProvider, Station } from "../types";
import { fetchJson } from "./http";
import { registerProvider } from "./registry";
import { mapNlFuelName } from "./nl-fuel-map";

const BASE_URL = "https://api.anwb.nl/routing/points-of-interest/v3/all";

// Whether ANWB's POI endpoint needs a key is unverified from this sandbox (egress
// is blocked — see docs/DATA-SOURCES.md). We degrade gracefully either way: if
// `ANWB_API_KEY` is set, attach it; if not, call keyless and let the upstream
// reject with a normal HTTP error, which fetchJson already turns into `null`.
// Header name is a best guess (APIM-style `Ocp-Apim-Subscription-Key`, common for
// Dutch corporate/government APIs) — confirm on a live Vercel preview and correct
// here + in DATA-SOURCES.md if wrong.
const API_KEY_HEADER = "Ocp-Apim-Subscription-Key";

interface AnwbFuelPrice {
  fuelType?: string;
  price?: number;
  lastUpdated?: string;
}

interface AnwbAddress {
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
}

interface AnwbPoi {
  id?: string | number;
  name?: string;
  brand?: string;
  location?: { lat?: number; lon?: number };
  address?: AnwbAddress;
  isMotorway?: boolean;
  openingHours?: string;
  fuelPrices?: AnwbFuelPrice[];
}

interface AnwbResponse {
  results?: AnwbPoi[];
}

function buildUrl(bbox: BoundingBox): string {
  const params = new URLSearchParams({
    "type-filter": "FUEL_STATION",
    "bounding-box-filter": `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`,
  });
  return `${BASE_URL}?${params.toString()}`;
}

function formatAddress(address: AnwbAddress | undefined): string {
  if (!address) return "";
  return [address.street, address.houseNumber].filter(Boolean).join(" ").trim();
}

/** Parses one POI into a Station, or `null` if it has no usable price for `fuel`. */
function parsePoi(poi: AnwbPoi, fuel: FuelType): Station | null {
  if (poi.id === undefined || poi.id === null) return null;
  if (!poi.location || poi.location.lat === undefined || poi.location.lon === undefined) return null;

  let matched: AnwbFuelPrice | undefined;
  for (const entry of poi.fuelPrices ?? []) {
    if (mapNlFuelName(entry.fuelType) === fuel && typeof entry.price === "number") {
      matched = entry;
      break;
    }
  }
  if (!matched || !matched.lastUpdated) return null;

  const sourceId = String(poi.id);
  return {
    id: `anwb:${sourceId}`,
    source: "anwb",
    sourceId,
    name: poi.name ?? "",
    brand: poi.brand,
    address: formatAddress(poi.address),
    town: poi.address?.city ?? "",
    postcode: poi.address?.postalCode,
    country: "NL",
    location: { lat: poi.location.lat, lon: poi.location.lon },
    prices: { [fuel]: matched.price },
    observedAt: matched.lastUpdated,
    isMotorway: poi.isMotorway,
    openingHours: poi.openingHours,
  };
}

export class AnwbPriceProvider implements PriceProvider {
  readonly id = "anwb" as const;
  readonly countries = ["NL"] as const;
  readonly unofficial = false;

  async stationsInBBox(bbox: BoundingBox, fuel: FuelType, signal?: AbortSignal): Promise<Station[]> {
    const apiKey = process.env.ANWB_API_KEY;
    const headers: Record<string, string> = apiKey ? { [API_KEY_HEADER]: apiKey } : {};

    const body = await fetchJson<AnwbResponse>(buildUrl(bbox), { signal, headers });
    if (!body || !Array.isArray(body.results)) return [];

    const stations: Station[] = [];
    for (const poi of body.results) {
      const station = parsePoi(poi, fuel);
      if (station) stations.push(station);
    }
    return stations;
  }
}

registerProvider(new AnwbPriceProvider());
