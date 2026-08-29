import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PriceProvider, Station } from "../types";

const BBOX = { minLat: 50, minLon: 3, maxLat: 53, maxLon: 7 };

function station(overrides: Partial<Station>): Station {
  return {
    id: "id",
    source: "directlease",
    sourceId: "1",
    name: "Station",
    address: "Straat 1",
    town: "Town",
    country: "NL",
    location: { lat: 52, lon: 5 },
    prices: { diesel: 1.8 },
    observedAt: "2026-08-29T08:00:00Z",
    ...overrides,
  };
}

function providerResolving(
  id: PriceProvider["id"],
  countries: PriceProvider["countries"],
  stations: Station[],
): PriceProvider {
  return { id, countries, unofficial: false, stationsInBBox: vi.fn().mockResolvedValue(stations) };
}

function providerRejecting(id: PriceProvider["id"], countries: PriceProvider["countries"]): PriceProvider {
  return {
    id,
    countries,
    unofficial: false,
    stationsInBBox: vi.fn().mockRejectedValue(new Error("upstream down")),
  };
}

function providerHanging(id: PriceProvider["id"], countries: PriceProvider["countries"]): PriceProvider {
  return {
    id,
    countries,
    unofficial: false,
    stationsInBBox: vi.fn(() => new Promise<Station[]>(() => {})),
  };
}

beforeEach(() => {
  vi.resetModules();
});

describe("fetchStations", () => {
  it("survives one provider rejecting, keeping the others' results", async () => {
    const registry = await import("./registry");
    const { fetchStations } = await import("./fetchStations");

    registry.registerProvider(providerRejecting("directlease", ["NL", "BE"]));
    registry.registerProvider(
      providerResolving("tankerkoenig", ["DE"], [station({ id: "de:1", source: "tankerkoenig", country: "DE" })]),
    );

    const result = await fetchStations(BBOX, ["NL", "BE", "DE"], "diesel");

    expect(result.stations).toHaveLength(1);
    expect(result.stations[0].id).toBe("de:1");
  });

  it("cuts off a provider that never resolves once the signal aborts", async () => {
    const registry = await import("./registry");
    const { fetchStations } = await import("./fetchStations");

    registry.registerProvider(providerHanging("anwb", ["NL"]));

    const controller = new AbortController();
    controller.abort();

    const result = await fetchStations(BBOX, ["NL"], "diesel", controller.signal);

    expect(result.stations).toEqual([]);
    expect(result.uncovered).toEqual(["NL"]);
  });

  it("lists exactly the requested countries with zero returned stations as uncovered", async () => {
    const registry = await import("./registry");
    const { fetchStations } = await import("./fetchStations");

    registry.registerProvider(
      providerResolving("anwb", ["NL"], [station({ id: "nl:1", source: "anwb", country: "NL" })]),
    );
    registry.registerProvider(providerResolving("tankerkoenig", ["DE"], []));

    const result = await fetchStations(BBOX, ["NL", "DE", "FR"], "diesel");

    expect(result.uncovered).toEqual(["DE", "FR"]);
  });

  it("reports the oldest observedAt per source", async () => {
    const registry = await import("./registry");
    const { fetchStations } = await import("./fetchStations");

    registry.registerProvider(
      providerResolving("anwb", ["NL"], [
        station({ id: "nl:1", source: "anwb", country: "NL", observedAt: "2026-08-29T09:00:00Z" }),
        station({ id: "nl:2", source: "anwb", country: "NL", observedAt: "2026-08-29T05:00:00Z" }),
      ]),
    );

    const result = await fetchStations(BBOX, ["NL"], "diesel");

    expect(result.sources).toEqual([
      {
        id: "anwb",
        countries: ["NL"],
        stationCount: 2,
        oldestObservedAt: "2026-08-29T05:00:00Z",
        unofficial: false,
      },
    ]);
  });

  it("runs providers in parallel rather than sequentially", async () => {
    const registry = await import("./registry");
    const { fetchStations } = await import("./fetchStations");

    let concurrent = 0;
    let maxConcurrent = 0;
    const track = (): Promise<Station[]> => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      return new Promise((resolve) =>
        setTimeout(() => {
          concurrent--;
          resolve([]);
        }, 10),
      );
    };

    registry.registerProvider({ id: "anwb", countries: ["NL"], unofficial: false, stationsInBBox: track });
    registry.registerProvider({ id: "tankerkoenig", countries: ["DE"], unofficial: false, stationsInBBox: track });

    await fetchStations(BBOX, ["NL", "DE"], "diesel");

    expect(maxConcurrent).toBe(2);
  });
});
