// Spanish government price adapter — Ministerio para la Transición Ecológica
// (sedeaplicaciones.minetur.gob.es). See docs/DATA-SOURCES.md and
// docs/tasks/T08-price-fr-es-it.md. `stationsInBBox` never throws: on any
// upstream failure it resolves to `[]` (see CONTRACTS.md).
//
// This endpoint has no bbox parameter — it returns the whole country
// (~12k stations) in one response. Fetch once per call, filter to the bbox in
// memory. Prices use comma decimals ("1,529"), which must be parsed, not
// `parseFloat`'d blind.

import type { BoundingBox, FuelType, PriceProvider, Station } from "../types";
import { fetchJson } from "./http";
import { registerProvider } from "./registry";

const BASE_URL =
  "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/";

type SpainFuelField =
  | "Precio Gasoleo A"
  | "Precio Gasolina 95 E10"
  | "Precio Gasolina 98 E5"
  | "Precio Gases licuados del petróleo";

const FUEL_FIELD: Record<FuelType, SpainFuelField> = {
  diesel: "Precio Gasoleo A",
  e10: "Precio Gasolina 95 E10",
  e5: "Precio Gasolina 98 E5",
  lpg: "Precio Gases licuados del petróleo",
};

interface SpainStationRaw {
  IDEESS?: string;
  "Rótulo"?: string;
  "Dirección"?: string;
  Localidad?: string;
  Municipio?: string;
  "C.P."?: string;
  Latitud?: string;
  "Longitud (WGS84)"?: string;
  "Precio Gasoleo A"?: string;
  "Precio Gasolina 95 E10"?: string;
  "Precio Gasolina 98 E5"?: string;
  "Precio Gases licuados del petróleo"?: string;
}

interface SpainResponse {
  Fecha?: string;
  ListaEESSPrecio?: SpainStationRaw[];
}

/** "1,529" -> 1.529. Blank/"" means "not sold" -> returns undefined. */
export function parseSpainPrice(raw: string | undefined): number | undefined {
  if (!raw || raw.trim() === "") return undefined;
  const normalised = raw.trim().replace(",", ".");
  const value = Number(normalised);
  return Number.isFinite(value) ? value : undefined;
}

/** "12/34,567890" style latitude/longitude strings, comma-decimal. */
function parseCoord(raw: string | undefined): number | undefined {
  if (!raw || raw.trim() === "") return undefined;
  const value = Number(raw.trim().replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

/** Parses the "DD/MM/YYYY HH:mm:ss" date the whole-country payload carries. */
function parseObservedAt(fecha: string | undefined): string {
  if (fecha) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(fecha.trim());
    if (match) {
      const [, day, month, year] = match;
      return `${year}-${month}-${day}T00:00:00Z`;
    }
  }
  // This feed refreshes once daily and has no per-station timestamp — the
  // date parsed above is the honest observation granularity. Falling back to
  // "now" only covers a malformed/missing Fecha field.
  return new Date().toISOString();
}

function inBBox(bbox: BoundingBox, lat: number, lon: number): boolean {
  return lat >= bbox.minLat && lat <= bbox.maxLat && lon >= bbox.minLon && lon <= bbox.maxLon;
}

function parseStation(
  raw: SpainStationRaw,
  lat: number,
  lon: number,
  fuel: FuelType,
  observedAt: string,
): Station | null {
  if (!raw.IDEESS) return null;

  const price = parseSpainPrice(raw[FUEL_FIELD[fuel]]);
  if (price === undefined) return null;

  return {
    id: `es-minetur:${raw.IDEESS}`,
    source: "es-minetur",
    sourceId: raw.IDEESS,
    name: raw["Rótulo"] ?? "",
    address: raw["Dirección"] ?? "",
    town: raw.Municipio ?? raw.Localidad ?? "",
    postcode: raw["C.P."],
    country: "ES",
    location: { lat, lon },
    prices: { [fuel]: price },
    observedAt,
  };
}

export class SpainPriceProvider implements PriceProvider {
  readonly id = "es-minetur" as const;
  readonly countries = ["ES"] as const;
  readonly unofficial = false;

  async stationsInBBox(bbox: BoundingBox, fuel: FuelType, signal?: AbortSignal): Promise<Station[]> {
    const body = await fetchJson<SpainResponse>(BASE_URL, { signal });
    if (!body || !Array.isArray(body.ListaEESSPrecio)) return [];

    const observedAt = parseObservedAt(body.Fecha);
    const stations: Station[] = [];
    for (const raw of body.ListaEESSPrecio) {
      const lat = parseCoord(raw.Latitud);
      const lon = parseCoord(raw["Longitud (WGS84)"]);
      if (lat === undefined || lon === undefined || !inBBox(bbox, lat, lon)) continue;

      const station = parseStation(raw, lat, lon, fuel, observedAt);
      if (station) stations.push(station);
    }
    return stations;
  }
}

registerProvider(new SpainPriceProvider());
