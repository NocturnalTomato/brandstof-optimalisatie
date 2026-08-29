// French government price adapter — data.economie.gouv.fr, Opendatasoft Explore
// v2.1. See docs/DATA-SOURCES.md and docs/tasks/T08-price-fr-es-it.md.
// `stationsInBBox` never throws: on any upstream failure it resolves to `[]`
// (see CONTRACTS.md).
//
// Unlike Spain/Italy this endpoint supports a real server-side geo filter, so we
// query `within_bbox(geom, ...)` directly and paginate until exhausted, instead
// of downloading the whole country.

import type { BoundingBox, FuelType, PriceProvider, Station } from "../types";
import { fetchJson } from "./http";
import { registerProvider } from "./registry";

const BASE_URL =
  "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records";

const PAGE_LIMIT = 100;
const MAX_RECORDS = 2_000;

type FranceFuelField = "gazole" | "sp95" | "sp98" | "e10" | "e85" | "gplc";

const FUEL_FIELDS: Record<FuelType, FranceFuelField[]> = {
  diesel: ["gazole"],
  e10: ["e10"],
  // sp98 preferred over sp95 when both are present (sp98 is the closer match
  // to "e5" as a super-95/98 unleaded grade — see T08 field mapping).
  e5: ["sp98", "sp95"],
  lpg: ["gplc"],
};

interface FranceGeom {
  lat?: number;
  lon?: number;
}

interface FranceRecord {
  id?: string;
  adresse?: string;
  ville?: string;
  cp?: string;
  geom?: FranceGeom;
  gazole?: number | null;
  gazole_maj?: string;
  sp95?: number | null;
  sp95_maj?: string;
  sp98?: number | null;
  sp98_maj?: string;
  e10?: number | null;
  e10_maj?: string;
  e85?: number | null;
  e85_maj?: string;
  gplc?: number | null;
  gplc_maj?: string;
}

interface FranceResponse {
  total_count?: number;
  results?: FranceRecord[];
}

function bboxWhereClause(bbox: BoundingBox): string {
  return `within_bbox(geom, ${bbox.minLat}, ${bbox.minLon}, ${bbox.maxLat}, ${bbox.maxLon})`;
}

function buildUrl(bbox: BoundingBox, offset: number): string {
  const params = new URLSearchParams({
    where: bboxWhereClause(bbox),
    limit: String(PAGE_LIMIT),
    offset: String(offset),
  });
  return `${BASE_URL}?${params.toString()}`;
}

function parseRecord(record: FranceRecord, fuel: FuelType): Station | null {
  if (!record.id || !record.geom || record.geom.lat === undefined || record.geom.lon === undefined) {
    return null;
  }

  let price: number | null | undefined;
  let observedAt: string | undefined;
  for (const field of FUEL_FIELDS[fuel]) {
    const value = record[field];
    if (typeof value === "number") {
      price = value;
      observedAt = record[`${field}_maj` as keyof FranceRecord] as string | undefined;
      break;
    }
  }
  if (typeof price !== "number" || !observedAt) return null;

  return {
    id: `fr-gouv:${record.id}`,
    source: "fr-gouv",
    sourceId: record.id,
    name: record.ville ?? "",
    address: record.adresse ?? "",
    town: record.ville ?? "",
    postcode: record.cp,
    country: "FR",
    location: { lat: record.geom.lat, lon: record.geom.lon },
    prices: { [fuel]: price },
    observedAt,
  };
}

export class FrancePriceProvider implements PriceProvider {
  readonly id = "fr-gouv" as const;
  readonly countries = ["FR"] as const;
  readonly unofficial = false;

  async stationsInBBox(bbox: BoundingBox, fuel: FuelType, signal?: AbortSignal): Promise<Station[]> {
    const stations: Station[] = [];
    let offset = 0;
    let totalCount = Infinity;

    while (offset < totalCount && offset < MAX_RECORDS) {
      const body = await fetchJson<FranceResponse>(buildUrl(bbox, offset), { signal });
      if (!body || !Array.isArray(body.results)) break;

      for (const record of body.results) {
        const station = parseRecord(record, fuel);
        if (station) stations.push(station);
      }

      totalCount = typeof body.total_count === "number" ? body.total_count : offset + body.results.length;
      if (body.results.length === 0) break;
      offset += body.results.length;
    }

    return stations;
  }
}

registerProvider(new FrancePriceProvider());
