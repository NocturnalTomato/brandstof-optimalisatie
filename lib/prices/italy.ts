// Italian MIMIT price adapter — joins two whole-country CSVs on `idImpianto`.
// See docs/DATA-SOURCES.md and docs/tasks/T08-price-fr-es-it.md.
// `stationsInBBox` never throws: on any upstream failure it resolves to `[]`
// (see CONTRACTS.md).
//
// Neither CSV has a bbox parameter — both are whole-country. Fetch each once
// per call, join in memory, filter to the bbox. Both files are
// semicolon-separated with a junk first line before the real header row.

import type { BoundingBox, FuelType, PriceProvider, Station } from "../types";
import { fetchText } from "./http";
import { registerProvider } from "./registry";

const ANAGRAFICA_URL = "https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv";
const PREZZI_URL = "https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv";

type ItalyFuelLabel = "Benzina" | "Gasolio" | "GPL";

const FUEL_LABEL: Partial<Record<FuelType, ItalyFuelLabel>> = {
  e5: "Benzina",
  diesel: "Gasolio",
  lpg: "GPL",
};

interface AnagraficaRow {
  name: string;
  brand?: string;
  address: string;
  town: string;
  lat: number;
  lon: number;
}

interface PrezzoRow {
  descCarburante: string;
  prezzo: number;
  observedAt: string;
}

/**
 * Splits one semicolon-delimited CSV line into fields, honouring double-quoted
 * fields that may themselves contain a semicolon.
 */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ";") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

/** Parses a semicolon CSV with a junk first line, returning header + data rows. */
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return { header: [], rows: [] };

  const header = splitCsvLine(lines[1]);
  const rows = lines.slice(2).map(splitCsvLine);
  return { header, rows };
}

function rowToRecord(header: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  header.forEach((key, i) => {
    record[key] = row[i] ?? "";
  });
  return record;
}

function parseItalianNumber(raw: string | undefined): number | undefined {
  if (!raw || raw.trim() === "") return undefined;
  const value = Number(raw.trim().replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

function parseAnagrafica(text: string): Map<string, AnagraficaRow> {
  const { header, rows } = parseCsv(text);
  const byId = new Map<string, AnagraficaRow>();

  for (const row of rows) {
    const record = rowToRecord(header, row);
    const id = record["idImpianto"];
    const lat = parseItalianNumber(record["Latitudine"]);
    const lon = parseItalianNumber(record["Longitudine"]);
    if (!id || lat === undefined || lon === undefined) continue;

    byId.set(id, {
      name: record["Nome Impianto"] || record["Gestore"] || "",
      brand: record["Bandiera"] || undefined,
      address: record["Indirizzo"] || "",
      town: record["Comune"] || "",
      lat,
      lon,
    });
  }
  return byId;
}

function parsePrezzi(text: string): Map<string, PrezzoRow[]> {
  const { header, rows } = parseCsv(text);
  const byId = new Map<string, PrezzoRow[]>();

  for (const row of rows) {
    const record = rowToRecord(header, row);
    const id = record["idImpianto"];
    const prezzo = parseItalianNumber(record["prezzo"]);
    const descCarburante = record["descCarburante"];
    if (!id || prezzo === undefined || !descCarburante) continue;

    const entry: PrezzoRow = {
      descCarburante,
      prezzo,
      observedAt: record["dtComu"] || new Date().toISOString(),
    };
    const existing = byId.get(id);
    if (existing) existing.push(entry);
    else byId.set(id, [entry]);
  }
  return byId;
}

function inBBox(bbox: BoundingBox, lat: number, lon: number): boolean {
  return lat >= bbox.minLat && lat <= bbox.maxLat && lon >= bbox.minLon && lon <= bbox.maxLon;
}

export class ItalyPriceProvider implements PriceProvider {
  readonly id = "it-mimit" as const;
  readonly countries = ["IT"] as const;
  readonly unofficial = false;

  async stationsInBBox(bbox: BoundingBox, fuel: FuelType, signal?: AbortSignal): Promise<Station[]> {
    const label = FUEL_LABEL[fuel];
    if (!label) return [];

    const [anagraficaText, prezziText] = await Promise.all([
      fetchText(ANAGRAFICA_URL, { signal }),
      fetchText(PREZZI_URL, { signal }),
    ]);
    if (!anagraficaText || !prezziText) return [];

    const anagrafica = parseAnagrafica(anagraficaText);
    const prezzi = parsePrezzi(prezziText);

    const stations: Station[] = [];
    for (const [id, entries] of prezzi) {
      const info = anagrafica.get(id);
      if (!info) continue; // orphaned price row: dropped, never emitted with an empty name
      if (!inBBox(bbox, info.lat, info.lon)) continue;

      const entry = entries.find((e) => e.descCarburante === label);
      if (!entry) continue;

      stations.push({
        id: `it-mimit:${id}`,
        source: "it-mimit",
        sourceId: id,
        name: info.name,
        brand: info.brand,
        address: info.address,
        town: info.town,
        country: "IT",
        location: { lat: info.lat, lon: info.lon },
        prices: { [fuel]: entry.prezzo },
        observedAt: entry.observedAt,
      });
    }
    return stations;
  }
}

registerProvider(new ItalyPriceProvider());
