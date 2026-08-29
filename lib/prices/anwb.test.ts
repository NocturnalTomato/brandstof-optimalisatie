import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoundingBox } from "../types";

const BBOX: BoundingBox = { minLat: 51, minLon: 4, maxLat: 53, maxLon: 6 };

vi.mock("./http", () => ({ fetchJson: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("AnwbPriceProvider", () => {
  it("has the required provider identity", async () => {
    const { AnwbPriceProvider } = await import("./anwb");
    const provider = new AnwbPriceProvider();

    expect(provider.id).toBe("anwb");
    expect(provider.countries).toEqual(["NL"]);
    expect(provider.unofficial).toBe(false);
  });

  // fetchJson already collapses a 5xx, a timeout, and malformed JSON into `null`
  // (see http.ts) — these three cases each confirm the adapter treats that `null`
  // as "no data" and resolves to [] rather than throwing.
  it("returns [] rather than throwing when the upstream 500s", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue(null as never);
    const { AnwbPriceProvider } = await import("./anwb");

    await expect(new AnwbPriceProvider().stationsInBBox(BBOX, "diesel")).resolves.toEqual([]);
  });

  it("returns [] rather than throwing when the upstream times out", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue(null as never);
    const { AnwbPriceProvider } = await import("./anwb");

    await expect(new AnwbPriceProvider().stationsInBBox(BBOX, "diesel")).resolves.toEqual([]);
  });

  it("returns [] rather than throwing when the upstream returns malformed JSON", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue(null as never);
    const { AnwbPriceProvider } = await import("./anwb");

    await expect(new AnwbPriceProvider().stationsInBBox(BBOX, "diesel")).resolves.toEqual([]);
  });

  it("returns [] when the upstream responds with a shape missing the results array", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue({ unexpected: true } as never);
    const { AnwbPriceProvider } = await import("./anwb");

    await expect(new AnwbPriceProvider().stationsInBBox(BBOX, "diesel")).resolves.toEqual([]);
  });

  it("parses the fixture into valid Station objects with real observedAt, correct country, and €/litre floats", async () => {
    const fixture = (await import("./__fixtures__/anwb-poi.json", { with: { type: "json" } })).default;
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue(fixture as never);

    const { AnwbPriceProvider } = await import("./anwb");
    const provider = new AnwbPriceProvider();

    const stations = await provider.stationsInBBox(BBOX, "diesel");

    // fixture has 4 POIs; only 2 (1001, 1003) carry a diesel price.
    expect(stations).toHaveLength(2);
    for (const station of stations) {
      expect(station.country).toBe("NL");
      expect(station.source).toBe("anwb");
      expect(typeof station.prices.diesel).toBe("number");
      expect(station.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }

    const shell = stations.find((s) => s.sourceId === "anwb-poi-1001");
    expect(shell).toMatchObject({
      id: "anwb:anwb-poi-1001",
      name: "Shell A2 Amsterdam-Zuid",
      town: "Amsterdam",
      prices: { diesel: 1.799 },
      observedAt: "2026-08-29T06:15:00Z",
    });
  });

  it("omits a station with no price for the requested fuel, rather than a zero or null", async () => {
    const fixture = (await import("./__fixtures__/anwb-poi.json", { with: { type: "json" } })).default;
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue(fixture as never);

    const { AnwbPriceProvider } = await import("./anwb");
    const provider = new AnwbPriceProvider();

    // Tinq Almere (1004) has an empty fuelPrices array — must never appear.
    const stations = await provider.stationsInBBox(BBOX, "lpg");
    expect(stations.every((s) => s.sourceId !== "anwb-poi-1004")).toBe(true);
    expect(stations).toHaveLength(1);
    expect(stations[0].sourceId).toBe("anwb-poi-1001");
  });

  it("maps NL fuel names explicitly: Euro95/E10 -> e10, Diesel -> diesel, LPG -> lpg, Superplus/E5 -> e5", async () => {
    const fixture = (await import("./__fixtures__/anwb-poi.json", { with: { type: "json" } })).default;
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue(fixture as never);

    const { AnwbPriceProvider } = await import("./anwb");
    const provider = new AnwbPriceProvider();

    const e10Stations = await provider.stationsInBBox(BBOX, "e10");
    expect(e10Stations.map((s) => s.sourceId).sort()).toEqual(["anwb-poi-1001", "anwb-poi-1002"]);

    const e5Stations = await provider.stationsInBBox(BBOX, "e5");
    expect(e5Stations.map((s) => s.sourceId)).toEqual(["anwb-poi-1002"]);

    const lpgStations = await provider.stationsInBBox(BBOX, "lpg");
    expect(lpgStations.map((s) => s.sourceId)).toEqual(["anwb-poi-1001"]);
  });
});
