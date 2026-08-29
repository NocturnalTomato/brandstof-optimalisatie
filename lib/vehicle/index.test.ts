import { describe, expect, it } from "vitest";
import type { VehicleRecord } from "../types";
import { allMakes, findVehicle, isPlausibleVehicle, modelsForMake, searchVehicles } from "./index";
import vehiclesJson from "./vehicles.json";

const vehicles = vehiclesJson as VehicleRecord[];

describe("vehicles.json", () => {
  it("has at least 150 records", () => {
    expect(vehicles.length).toBeGreaterThanOrEqual(150);
  });

  it("has unique, kebab-case ids", () => {
    const ids = vehicles.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("keeps tankLitres within [20,120]", () => {
    for (const v of vehicles) {
      expect(v.tankLitres).toBeGreaterThanOrEqual(20);
      expect(v.tankLitres).toBeLessThanOrEqual(120);
    }
  });

  it("keeps consumptionLPer100Km within [2,20]", () => {
    for (const v of vehicles) {
      expect(v.consumptionLPer100Km).toBeGreaterThanOrEqual(2);
      expect(v.consumptionLPer100Km).toBeLessThanOrEqual(20);
    }
  });

  it("is sorted by make then model", () => {
    const sorted = [...vehicles].sort(
      (a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model),
    );
    expect(vehicles).toEqual(sorted);
  });
});

describe("allMakes", () => {
  it("returns unique makes, sorted", () => {
    const makes = allMakes();
    expect(new Set(makes).size).toBe(makes.length);
    expect(makes).toEqual([...makes].sort((a, b) => a.localeCompare(b)));
    expect(makes).toContain("Volkswagen");
  });
});

describe("modelsForMake", () => {
  it("returns only that make's records", () => {
    const models = modelsForMake("Volkswagen");
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) expect(m.make).toBe("Volkswagen");
  });

  it("is accent-insensitive", () => {
    expect(modelsForMake("Skoda").length).toBe(modelsForMake("Škoda").length);
    expect(modelsForMake("Skoda").length).toBeGreaterThan(0);
  });
});

describe("findVehicle", () => {
  it("finds a known id", () => {
    const [first] = vehicles;
    expect(findVehicle(first.id)).toEqual(first);
  });

  it("returns undefined for an unknown id", () => {
    expect(findVehicle("does-not-exist")).toBeUndefined();
  });
});

describe("searchVehicles", () => {
  it("ranks Golf variants above incidental matches for 'golf'", () => {
    const results = searchVehicles("golf");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].model.toLowerCase()).toContain("golf");
    for (const r of results) {
      expect(`${r.make} ${r.model}`.toLowerCase()).toContain("golf");
    }
  });

  it("matches 'Citroën' via the unaccented query 'citroen'", () => {
    const results = searchVehicles("citroen");
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) expect(r.make).toBe("Citroën");
  });

  it("matches an accented query against unaccented data", () => {
    const results = searchVehicles("škoda");
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) expect(r.make).toBe("Škoda");
  });

  it("respects the limit", () => {
    expect(searchVehicles("e", 5).length).toBeLessThanOrEqual(5);
  });

  it("returns [] for an empty query", () => {
    expect(searchVehicles("")).toEqual([]);
    expect(searchVehicles("   ")).toEqual([]);
  });

  it("returns [] when nothing matches", () => {
    expect(searchVehicles("zzzznotarealcar")).toEqual([]);
  });
});

describe("isPlausibleVehicle", () => {
  const base = { tankLitres: 50, consumptionLPer100Km: 6, fuel: "e10" as const };

  it("accepts a realistic vehicle", () => {
    expect(isPlausibleVehicle(base)).toBe(true);
  });

  it("rejects a zero tank", () => {
    expect(isPlausibleVehicle({ ...base, tankLitres: 0 })).toBe(false);
  });

  it("rejects an oversized tank", () => {
    expect(isPlausibleVehicle({ ...base, tankLitres: 250 })).toBe(false);
  });

  it("rejects zero or negative consumption", () => {
    expect(isPlausibleVehicle({ ...base, consumptionLPer100Km: 0 })).toBe(false);
    expect(isPlausibleVehicle({ ...base, consumptionLPer100Km: -1 })).toBe(false);
  });

  it("rejects non-finite values", () => {
    expect(isPlausibleVehicle({ ...base, tankLitres: NaN })).toBe(false);
    expect(isPlausibleVehicle({ ...base, consumptionLPer100Km: Infinity })).toBe(false);
  });

  it("accepts every bundled vehicle record", () => {
    for (const v of vehicles) {
      expect(isPlausibleVehicle(v)).toBe(true);
    }
  });
});
