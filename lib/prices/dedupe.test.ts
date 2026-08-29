import { describe, expect, it } from "vitest";
import { dedupeStations } from "./dedupe";
import type { Station } from "../types";

// Amsterdam-ish reference point; offsets below are chosen to land at roughly the
// stated distance using ~111,320 m per degree of latitude.
const BASE = { lat: 52.37, lon: 4.9 };

function offsetLat(metres: number): number {
  return BASE.lat + metres / 111_320;
}

function station(overrides: Partial<Station>): Station {
  return {
    id: "shell:1",
    source: "directlease",
    sourceId: "1",
    name: "Shell Amsterdam",
    address: "Teststraat 1",
    town: "Amsterdam",
    country: "NL",
    location: { ...BASE },
    prices: { diesel: 1.799 },
    observedAt: "2026-08-29T08:00:00Z",
    ...overrides,
  };
}

describe("dedupeStations", () => {
  it("merges two records of the same station 40m apart sharing a brand token", () => {
    const older = station({
      id: "directlease:1",
      source: "directlease",
      name: "Shell Amsterdam Zuid",
      location: { lat: BASE.lat, lon: BASE.lon },
      observedAt: "2026-08-29T06:00:00Z",
    });
    const newer = station({
      id: "anwb:2",
      source: "anwb",
      name: "Shell A10",
      location: { lat: offsetLat(40), lon: BASE.lon },
      observedAt: "2026-08-29T09:00:00Z",
    });

    const result = dedupeStations([older, newer]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("anwb:2");
  });

  it("does not merge two genuinely different stations 40m apart with unrelated names", () => {
    const shell = station({
      id: "directlease:1",
      name: "Shell",
      location: { lat: BASE.lat, lon: BASE.lon },
    });
    const bp = station({
      id: "directlease:2",
      name: "BP",
      location: { lat: offsetLat(40), lon: BASE.lon },
    });

    const result = dedupeStations([shell, bp]);

    expect(result).toHaveLength(2);
  });

  it("does not merge two stations far apart even with the same brand", () => {
    const a = station({ id: "a", location: { lat: BASE.lat, lon: BASE.lon } });
    const b = station({ id: "b", location: { lat: offsetLat(500), lon: BASE.lon } });

    expect(dedupeStations([a, b])).toHaveLength(2);
  });

  it("keeps the official source on a tie in observedAt", () => {
    const observedAt = "2026-08-29T08:00:00Z";
    const unofficial = station({ id: "directlease:1", source: "directlease", observedAt });
    const official = station({ id: "anwb:1", source: "anwb", observedAt });

    const result = dedupeStations([unofficial, official]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("anwb:1");
  });
});
