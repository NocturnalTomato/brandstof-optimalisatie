import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoundingBox } from "../types";
import { haversineM } from "../routing/geo";

const SMALL_BBOX: BoundingBox = { minLat: 52.5, minLon: 13.35, maxLat: 52.55, maxLon: 13.45 };

vi.mock("./http", () => ({ fetchJson: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.TANKERKOENIG_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.TANKERKOENIG_API_KEY;
});

describe("TankerkoenigPriceProvider", () => {
  it("has the required provider identity and MTS-K attribution", async () => {
    const { TankerkoenigPriceProvider } = await import("./tankerkoenig");
    const provider = new TankerkoenigPriceProvider();

    expect(provider.id).toBe("tankerkoenig");
    expect(provider.countries).toEqual(["DE"]);
    expect(provider.unofficial).toBe(false);
    expect(provider.attribution).toMatch(/MTS-K/);
  });

  it("returns [] without calling the network when no API key is configured", async () => {
    delete process.env.TANKERKOENIG_API_KEY;
    const { fetchJson } = await import("./http");
    const { TankerkoenigPriceProvider } = await import("./tankerkoenig");

    const stations = await new TankerkoenigPriceProvider().stationsInBBox(SMALL_BBOX, "diesel");

    expect(stations).toEqual([]);
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it("returns [] without calling the network for a fuel MTS-K does not cover (lpg)", async () => {
    const { fetchJson } = await import("./http");
    const { TankerkoenigPriceProvider } = await import("./tankerkoenig");

    const stations = await new TankerkoenigPriceProvider().stationsInBBox(SMALL_BBOX, "lpg");

    expect(stations).toEqual([]);
    expect(fetchJson).not.toHaveBeenCalled();
  });

  // fetchJson already collapses a 401, a 500, and malformed JSON into `null` (see
  // http.ts) — these confirm the adapter treats that `null`, and a 200 response
  // whose body reports `ok: false` (a bad-key rejection at the JSON level rather
  // than the HTTP level), as "no data" and never throws.
  it("returns [] rather than throwing on a 401 (bad key)", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue(null as never);
    const { TankerkoenigPriceProvider } = await import("./tankerkoenig");

    await expect(new TankerkoenigPriceProvider().stationsInBBox(SMALL_BBOX, "diesel")).resolves.toEqual([]);
  });

  it("returns [] rather than throwing on a 500", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue(null as never);
    const { TankerkoenigPriceProvider } = await import("./tankerkoenig");

    await expect(new TankerkoenigPriceProvider().stationsInBBox(SMALL_BBOX, "diesel")).resolves.toEqual([]);
  });

  it("returns [] rather than throwing on malformed JSON", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue(null as never);
    const { TankerkoenigPriceProvider } = await import("./tankerkoenig");

    await expect(new TankerkoenigPriceProvider().stationsInBBox(SMALL_BBOX, "diesel")).resolves.toEqual([]);
  });

  it("returns [] when the body itself reports ok: false", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue({ ok: false, status: "error" } as never);
    const { TankerkoenigPriceProvider } = await import("./tankerkoenig");

    await expect(new TankerkoenigPriceProvider().stationsInBBox(SMALL_BBOX, "diesel")).resolves.toEqual([]);
  });

  it("parses the fixture into valid Station objects and omits a station with no price for the requested fuel", async () => {
    const fixture = (await import("./__fixtures__/tankerkoenig-list.json", { with: { type: "json" } })).default;
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue(fixture as never);

    const { TankerkoenigPriceProvider } = await import("./tankerkoenig");
    const stations = await new TankerkoenigPriceProvider().stationsInBBox(SMALL_BBOX, "diesel");

    // fixture has 3 stations; one has diesel: null and must be omitted.
    expect(stations).toHaveLength(2);
    for (const station of stations) {
      expect(station.country).toBe("DE");
      expect(station.source).toBe("tankerkoenig");
      expect(typeof station.prices.diesel).toBe("number");
      expect(station.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    expect(stations.some((s) => s.sourceId === "51d4b55d-0003")).toBe(false);
  });

  it("shares one observedAt across every station from the same call, read from the fetch batch rather than re-read per station", async () => {
    const fixture = (await import("./__fixtures__/tankerkoenig-list.json", { with: { type: "json" } })).default;
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue(fixture as never);

    const { TankerkoenigPriceProvider } = await import("./tankerkoenig");
    const stations = await new TankerkoenigPriceProvider().stationsInBBox(SMALL_BBOX, "diesel");

    const distinctTimestamps = new Set(stations.map((s) => s.observedAt));
    expect(distinctTimestamps.size).toBe(1);
  });

  it("dedupes a station returned by two overlapping tiles by id before any cross-source dedup runs", async () => {
    // A bbox wide enough (~33 km tall) to produce exactly two 20 km tiles.
    const bbox: BoundingBox = { minLat: 52.0, minLon: 13.0, maxLat: 52.3, maxLon: 13.05 };
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson)
      .mockResolvedValueOnce({
        ok: true,
        status: "ok",
        stations: [{ id: "dup-1", name: "A", lat: 52.05, lng: 13.02, diesel: 1.7 }],
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: "ok",
        stations: [{ id: "dup-1", name: "A", lat: 52.05, lng: 13.02, diesel: 1.71 }],
      } as never);

    const { TankerkoenigPriceProvider } = await import("./tankerkoenig");
    const stations = await new TankerkoenigPriceProvider().stationsInBBox(bbox, "diesel");

    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(stations).toHaveLength(1);
    expect(stations[0].id).toBe("tankerkoenig:dup-1");
  });
});

describe("planTiles", () => {
  it("covers the whole bbox with no gaps for a bbox spanning ~400 km", async () => {
    const { planTiles } = await import("./tankerkoenig");
    const bbox: BoundingBox = { minLat: 47.5, minLon: 7.5, maxLat: 51.0, maxLon: 12.5 }; // ~390 km tall
    const radiusKm = 20;
    const tiles = planTiles(bbox, radiusKm, 1000); // cap high enough to stay in grid mode

    // Sample a dense grid of probe points across the bbox; every probe must fall
    // within radiusKm of some tile centre, or coverage has a gap.
    const probes: Array<{ lat: number; lon: number }> = [];
    for (let lat = bbox.minLat; lat <= bbox.maxLat; lat += 0.2) {
      for (let lon = bbox.minLon; lon <= bbox.maxLon; lon += 0.2) {
        probes.push({ lat, lon });
      }
    }

    for (const probe of probes) {
      const nearestM = Math.min(...tiles.map((t) => haversineM(probe, t)));
      expect(nearestM).toBeLessThanOrEqual(radiusKm * 1000);
    }
  });

  it("caps the tile count and falls back to route-sampled centres spanning the bbox", async () => {
    const { planTiles } = await import("./tankerkoenig");
    // A huge bbox at 20 km tiles needs far more than 40 to fill as a grid.
    const bbox: BoundingBox = { minLat: 40, minLon: 0, maxLat: 55, maxLon: 15 };
    const tiles = planTiles(bbox, 20, 40);

    expect(tiles.length).toBe(40);
    expect(tiles[0]).toEqual({ lat: bbox.minLat, lon: bbox.minLon });
    expect(tiles[tiles.length - 1]).toEqual({ lat: bbox.maxLat, lon: bbox.maxLon });
  });
});
