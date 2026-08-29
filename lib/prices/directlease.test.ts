import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoundingBox } from "../types";

// Bbox around the southern Netherlands / northern Belgium. Of the fixture's 4
// places: Breda (2001, NL) and Antwerpen (2002, BE) fall inside; Maastricht
// (2003, too far south) and Groningen (2004, too far north) fall outside.
const BBOX: BoundingBox = { minLat: 51, minLon: 4, maxLat: 51.8, maxLon: 5 };

vi.mock("./http", () => ({ fetchJson: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("DirectLeasePriceProvider", () => {
  it("has the required provider identity", async () => {
    const { DirectLeasePriceProvider } = await import("./directlease");
    const provider = new DirectLeasePriceProvider();

    expect(provider.id).toBe("directlease");
    expect(provider.countries).toEqual(["NL", "BE"]);
    expect(provider.unofficial).toBe(true);
  });

  it("returns [] rather than throwing when the places list 500s", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue(null as never);
    const { DirectLeasePriceProvider } = await import("./directlease");

    await expect(new DirectLeasePriceProvider().stationsInBBox(BBOX, "diesel")).resolves.toEqual([]);
  });

  it("returns [] rather than throwing when the places list request times out", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue(null as never);
    const { DirectLeasePriceProvider } = await import("./directlease");

    await expect(new DirectLeasePriceProvider().stationsInBBox(BBOX, "diesel")).resolves.toEqual([]);
  });

  it("returns [] rather than throwing when the places list is malformed JSON", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue(null as never);
    const { DirectLeasePriceProvider } = await import("./directlease");

    await expect(new DirectLeasePriceProvider().stationsInBBox(BBOX, "diesel")).resolves.toEqual([]);
  });

  it("returns [] when a per-station detail fetch fails, without failing the whole plan", async () => {
    const placesFixture = (await import("./__fixtures__/directlease-places.json", { with: { type: "json" } }))
      .default;
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockImplementation(async (url: string) => {
      if (url.includes("/v2/places?")) return placesFixture as never;
      return null as never; // every per-station detail fetch fails
    });

    const { DirectLeasePriceProvider } = await import("./directlease");
    await expect(new DirectLeasePriceProvider().stationsInBBox(BBOX, "diesel")).resolves.toEqual([]);
  });

  it("parses the fixtures into valid Station objects with real observedAt, correct country, and €/litre floats", async () => {
    const placesFixture = (await import("./__fixtures__/directlease-places.json", { with: { type: "json" } }))
      .default;
    const stationFixture = (await import("./__fixtures__/directlease-station.json", { with: { type: "json" } }))
      .default;
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockImplementation(async (url: string) => {
      if (url.includes("/v2/places?")) return placesFixture as never;
      return stationFixture as never;
    });

    const { DirectLeasePriceProvider } = await import("./directlease");
    const stations = await new DirectLeasePriceProvider().stationsInBBox(BBOX, "diesel");

    // Only Breda (2001) and Antwerpen (2002) are inside the bbox.
    expect(stations).toHaveLength(2);
    const breda = stations.find((s) => s.sourceId === "2001");
    expect(breda).toMatchObject({
      id: "directlease:2001",
      source: "directlease",
      country: "NL",
      prices: { diesel: 1.799 },
      observedAt: "2026-08-29T06:10:00+02:00",
    });
    for (const station of stations) {
      expect(typeof station.prices.diesel).toBe("number");
      expect(station.prices.diesel).toBeLessThan(1000); // proves the /1000 conversion happened
    }
  });

  it("omits a station with no price for the requested fuel, rather than a zero or null", async () => {
    const placesFixture = (await import("./__fixtures__/directlease-places.json", { with: { type: "json" } }))
      .default;
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockImplementation(async (url: string) => {
      if (url.includes("/v2/places?")) return placesFixture as never;
      // Neither place in bbox sells e5 in this per-station response.
      return { id: 0, prices: [{ type: "Diesel", amount: 1799, date: "2026-08-29T06:10:00+02:00" }] } as never;
    });

    const { DirectLeasePriceProvider } = await import("./directlease");
    const stations = await new DirectLeasePriceProvider().stationsInBBox(BBOX, "e5");

    expect(stations).toEqual([]);
  });

  it("maps NL fuel names explicitly: Euro95/E10 -> e10, Diesel -> diesel, LPG -> lpg, Superplus/E5 -> e5", async () => {
    const placesFixture = (await import("./__fixtures__/directlease-places.json", { with: { type: "json" } }))
      .default;
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockImplementation(async (url: string) => {
      if (url.includes("/v2/places?")) return placesFixture as never;
      const id = url.match(/places\/(\d+)/)?.[1];
      if (id === "2001") {
        return {
          id: 2001,
          prices: [
            { type: "Euro95", amount: 1929, date: "2026-08-29T06:00:00Z" },
            { type: "LPG", amount: 899, date: "2026-08-29T06:00:00Z" },
          ],
        } as never;
      }
      return {
        id: 2002,
        prices: [
          { type: "E10", amount: 1899, date: "2026-08-29T06:00:00Z" },
          { type: "Superplus", amount: 2049, date: "2026-08-29T06:00:00Z" },
        ],
      } as never;
    });

    const { DirectLeasePriceProvider } = await import("./directlease");
    const provider = new DirectLeasePriceProvider();

    const e10 = await provider.stationsInBBox(BBOX, "e10");
    expect(e10.map((s) => s.sourceId).sort()).toEqual(["2001", "2002"]);

    const lpg = await provider.stationsInBBox(BBOX, "lpg");
    expect(lpg.map((s) => s.sourceId)).toEqual(["2001"]);

    const e5 = await provider.stationsInBBox(BBOX, "e5");
    expect(e5.map((s) => s.sourceId)).toEqual(["2002"]);
  });

  it("filters places to the bbox BEFORE fetching per-station detail — never fetches every place", async () => {
    const { fetchJson } = await import("./http");
    const detailCalls: string[] = [];

    // 2 places inside a tight bbox, 500 outside it — a naive "fetch everyone"
    // implementation would issue 502 detail requests; a correct one issues 2.
    const inBboxPlaces = [
      { id: "in-1", name: "A", street: "s", city: "c", country: "NL", lat: 52.0, lng: 5.0 },
      { id: "in-2", name: "B", street: "s", city: "c", country: "NL", lat: 52.01, lng: 5.01 },
    ];
    const outOfBboxPlaces = Array.from({ length: 500 }, (_, i) => ({
      id: `out-${i}`,
      name: "Out",
      street: "s",
      city: "c",
      country: "NL",
      lat: 10 + i * 0.001, // far outside the bbox below
      lng: 10,
    }));

    vi.mocked(fetchJson).mockImplementation(async (url: string) => {
      if (url.includes("/v2/places?")) {
        return { places: [...inBboxPlaces, ...outOfBboxPlaces] } as never;
      }
      detailCalls.push(url);
      return { id: 0, prices: [{ type: "Diesel", amount: 1000, date: "2026-08-29T06:00:00Z" }] } as never;
    });

    const { DirectLeasePriceProvider } = await import("./directlease");
    const tightBbox: BoundingBox = { minLat: 51.9, minLon: 4.9, maxLat: 52.1, maxLon: 5.1 };
    await new DirectLeasePriceProvider().stationsInBBox(tightBbox, "diesel");

    expect(detailCalls).toHaveLength(2);
  });

  it("caps at 60 stations per plan even when the bbox-filtered list is longer", async () => {
    const { fetchJson } = await import("./http");
    const detailCalls: string[] = [];

    const manyPlacesInBbox = Array.from({ length: 200 }, (_, i) => ({
      id: `p-${i}`,
      name: "Station",
      street: "s",
      city: "c",
      country: "NL",
      lat: 52.0 + i * 0.0001,
      lng: 5.0,
    }));

    vi.mocked(fetchJson).mockImplementation(async (url: string) => {
      if (url.includes("/v2/places?")) return { places: manyPlacesInBbox } as never;
      detailCalls.push(url);
      return { id: 0, prices: [{ type: "Diesel", amount: 1000, date: "2026-08-29T06:00:00Z" }] } as never;
    });

    const { DirectLeasePriceProvider } = await import("./directlease");
    const wideBbox: BoundingBox = { minLat: 51, minLon: 4, maxLat: 53, maxLon: 6 };
    const stations = await new DirectLeasePriceProvider().stationsInBBox(wideBbox, "diesel");

    expect(detailCalls).toHaveLength(60);
    expect(stations).toHaveLength(60);
  });

  it("never runs more than 6 per-station detail fetches concurrently", async () => {
    const { fetchJson } = await import("./http");
    let concurrent = 0;
    let maxConcurrent = 0;

    const places = Array.from({ length: 20 }, (_, i) => ({
      id: `p-${i}`,
      name: "Station",
      street: "s",
      city: "c",
      country: "NL",
      lat: 52.0 + i * 0.0001,
      lng: 5.0,
    }));

    vi.mocked(fetchJson).mockImplementation(async (url: string) => {
      if (url.includes("/v2/places?")) return { places } as never;

      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 5));
      concurrent--;
      return { id: 0, prices: [{ type: "Diesel", amount: 1000, date: "2026-08-29T06:00:00Z" }] } as never;
    });

    const { DirectLeasePriceProvider } = await import("./directlease");
    const bbox: BoundingBox = { minLat: 51, minLon: 4, maxLat: 53, maxLon: 6 };
    await new DirectLeasePriceProvider().stationsInBBox(bbox, "diesel");

    expect(maxConcurrent).toBeLessThanOrEqual(6);
    expect(maxConcurrent).toBeGreaterThan(1); // proves it's actually running in parallel, not serially
  });

  it("sends an X-Checksum header on every request", async () => {
    const { fetchJson } = await import("./http");
    const seenHeaders: Array<Record<string, string> | undefined> = [];

    vi.mocked(fetchJson).mockImplementation(async (_url: string, options?: { headers?: Record<string, string> }) => {
      seenHeaders.push(options?.headers);
      if (_url.includes("/v2/places?")) {
        return {
          places: [{ id: "1", name: "A", street: "s", city: "c", country: "NL", lat: 52, lng: 5 }],
        } as never;
      }
      return { id: 1, prices: [{ type: "Diesel", amount: 1000, date: "2026-08-29T06:00:00Z" }] } as never;
    });

    const { DirectLeasePriceProvider } = await import("./directlease");
    const bbox: BoundingBox = { minLat: 51, minLon: 4, maxLat: 53, maxLon: 6 };
    await new DirectLeasePriceProvider().stationsInBBox(bbox, "diesel");

    expect(seenHeaders.length).toBeGreaterThan(0);
    for (const headers of seenHeaders) {
      expect(headers?.["X-Checksum"]).toBeTruthy();
    }
  });
});
