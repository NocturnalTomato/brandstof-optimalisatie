// Offline generator for lib/vehicle/vehicles.json. Not shipped to the client — run by
// hand (`npx tsx scripts/build-vehicles.ts`) and the JSON output committed.
//
// Intended source: EEA CO2-monitoring dataset (https://co2cars.apps.eea.europa.eu/) or
// UK VCA car fuel data (https://www.vehicle-certification-agency.gov.uk/fuel-consumption-co2/).
// The dev sandbox this repo was built in has no outbound network access, so the raw
// input checked in at scripts/raw-vehicle-data.csv was hand-curated from published
// manufacturer WLTP tank and combined-consumption figures rather than downloaded from
// either source above. Anyone regenerating this dataset for real should replace that
// CSV with an extract from one of the two URLs and re-run this script; the transform
// below (validation, id derivation, sorting) does not need to change.
//
// Raw CSV columns: make,model,fuel,tankLitres,consumptionLPer100Km

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FUEL_TYPES, type FuelType, type VehicleRecord } from "../lib/types";

const RAW_PATH = path.join(__dirname, "raw-vehicle-data.csv");
const OUT_PATH = path.join(__dirname, "../lib/vehicle/vehicles.json");

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents after NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseCsv(text: string): string[][] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(","));
}

function isFuelType(value: string): value is FuelType {
  return (FUEL_TYPES as readonly string[]).includes(value);
}

function buildRecords(): VehicleRecord[] {
  const rows = parseCsv(readFileSync(RAW_PATH, "utf-8"));
  const [header, ...dataRows] = rows;
  if (header.join(",") !== "make,model,fuel,tankLitres,consumptionLPer100Km") {
    throw new Error(`Unexpected CSV header: ${header.join(",")}`);
  }

  const seenIds = new Set<string>();
  const records: VehicleRecord[] = dataRows.map(([make, model, fuel, tank, consumption], i) => {
    const line = i + 2; // 1-indexed, plus header row

    if (!make || !model) {
      throw new Error(`Row ${line}: make/model missing`);
    }
    if (!isFuelType(fuel)) {
      throw new Error(`Row ${line}: unknown fuel type "${fuel}"`);
    }

    const tankLitres = Number(tank);
    const consumptionLPer100Km = Number(consumption);
    if (!Number.isFinite(tankLitres) || tankLitres < 20 || tankLitres > 120) {
      throw new Error(`Row ${line}: tankLitres ${tank} out of range [20,120]`);
    }
    if (!Number.isFinite(consumptionLPer100Km) || consumptionLPer100Km < 2 || consumptionLPer100Km > 20) {
      throw new Error(`Row ${line}: consumptionLPer100Km ${consumption} out of range [2,20]`);
    }

    const id = `${slugify(make)}-${slugify(model)}`;
    if (seenIds.has(id)) {
      throw new Error(`Row ${line}: duplicate id "${id}" (make+model must be unique)`);
    }
    seenIds.add(id);

    return { id, make, model, tankLitres, consumptionLPer100Km, fuel };
  });

  records.sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model));

  if (records.length < 150) {
    throw new Error(`Only ${records.length} records generated, need at least 150`);
  }

  return records;
}

function main() {
  const records = buildRecords();
  writeFileSync(OUT_PATH, JSON.stringify(records, null, 2) + "\n");
  console.log(`Wrote ${records.length} vehicles to ${path.relative(process.cwd(), OUT_PATH)}`);
}

main();
