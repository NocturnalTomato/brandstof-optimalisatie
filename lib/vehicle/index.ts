// Bundled vehicle dataset lookup. See scripts/build-vehicles.ts for how vehicles.json
// is generated and docs/tasks/T03-vehicle-data.md for the contract.

import type { Vehicle, VehicleRecord } from "../types";
import rawVehicles from "./vehicles.json";

const vehicles: VehicleRecord[] = rawVehicles as VehicleRecord[];

const byId = new Map<string, VehicleRecord>(vehicles.map((v) => [v.id, v]));

function foldAccents(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function allMakes(): string[] {
  const makes = new Set<string>();
  for (const v of vehicles) makes.add(v.make);
  return [...makes].sort((a, b) => a.localeCompare(b));
}

export function modelsForMake(make: string): VehicleRecord[] {
  const folded = foldAccents(make);
  return vehicles
    .filter((v) => foldAccents(v.make) === folded)
    .sort((a, b) => a.model.localeCompare(b.model));
}

export function findVehicle(id: string): VehicleRecord | undefined {
  return byId.get(id);
}

/** Case- and accent-insensitive prefix + substring search across "make model". */
export function searchVehicles(query: string, limit = 20): VehicleRecord[] {
  const q = foldAccents(query.trim());
  if (q === "") return [];

  const scored: Array<{ record: VehicleRecord; score: number }> = [];
  for (const record of vehicles) {
    const make = foldAccents(record.make);
    const model = foldAccents(record.model);
    const combined = `${make} ${model}`;

    let score: number;
    if (make.startsWith(q) || model.startsWith(q)) {
      score = 0;
    } else if (combined.startsWith(q)) {
      score = 1;
    } else if (combined.includes(q)) {
      score = 2;
    } else {
      continue;
    }

    scored.push({ record, score });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return `${a.record.make} ${a.record.model}`.localeCompare(`${b.record.make} ${b.record.model}`);
  });

  return scored.slice(0, limit).map((s) => s.record);
}

export function isPlausibleVehicle(v: Vehicle): boolean {
  return (
    Number.isFinite(v.tankLitres) &&
    v.tankLitres >= 10 &&
    v.tankLitres <= 200 &&
    Number.isFinite(v.consumptionLPer100Km) &&
    v.consumptionLPer100Km >= 1 &&
    v.consumptionLPer100Km <= 40
  );
}
