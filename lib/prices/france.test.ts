import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoundingBox } from "../types";
import fixture from "./__fixtures__/france-records.json";

const BBOX: BoundingBox = { minLat: 48.8, minLon: 2.3, maxLat: 48.9, maxLon: 2.4 };

vi.mock("./http", () => ({ fetchJson: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
});

describe("FrancePriceProvider", () => {
  it("has the required provider identity", async () => {
    const { FrancePriceProvider } = await import("./france");
    const provider = new FrancePriceProvider();

    expect(provider.id).toBe("fr-gouv");
    expect(provider.countries).toEqual(["FR"]);
    expect(provider.unofficial).toBe(false);
  });

  it("parses diesel prices from the fixture, mapping gazole -> diesel", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValueOnce(fixture);
    const { FrancePriceProvider } = await import("./france");

    const stations = await new FrancePriceProvider().stationsInBBox(BBOX, "diesel");

    expect(stations).toHaveLength(2);
    expect(stations[0].prices.diesel).toBe(1.749);
    expect(stations[0].country).toBe("FR");
  });

  it("maps sp98 (falling back to sp95) to e5, and skips a record with neither", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValueOnce(fixture);
    const { FrancePriceProvider } = await import("./france");

    const stations = await new FrancePriceProvider().stationsInBBox(BBOX, "e5");

    expect(stations).toHaveLength(1);
    expect(stations[0].prices.e5).toBe(1.859);
  });

  it("applies the bbox as a server-side where=within_bbox(...) filter, not a local one", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValueOnce({ total_count: 0, results: [] });
    const { FrancePriceProvider } = await import("./france");

    await new FrancePriceProvider().stationsInBBox(BBOX, "diesel");

    const [url] = vi.mocked(fetchJson).mock.calls[0];
    expect(decodeURIComponent(String(url))).toContain("within_bbox(geom");
    expect(String(url)).toContain(String(BBOX.minLat));
  });

  it("paginates until total_count is exhausted", async () => {
    const { fetchJson } = await import("./http");
    const page1 = { total_count: 3, results: [fixture.results[0], fixture.results[1]] };
    const page2 = { total_count: 3, results: [fixture.results[0]] };
    vi.mocked(fetchJson).mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);
    const { FrancePriceProvider } = await import("./france");

    const stations = await new FrancePriceProvider().stationsInBBox(BBOX, "diesel");

    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(stations).toHaveLength(3);
  });

  it("stops paginating once a page returns no results", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValueOnce({ total_count: 500, results: [] });
    const { FrancePriceProvider } = await import("./france");

    await new FrancePriceProvider().stationsInBBox(BBOX, "diesel");

    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("returns [] rather than throwing on upstream failure", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue(null as never);
    const { FrancePriceProvider } = await import("./france");

    await expect(new FrancePriceProvider().stationsInBBox(BBOX, "diesel")).resolves.toEqual([]);
  });

  it("returns [] rather than throwing on a malformed payload", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue({ nonsense: true } as never);
    const { FrancePriceProvider } = await import("./france");

    await expect(new FrancePriceProvider().stationsInBBox(BBOX, "diesel")).resolves.toEqual([]);
  });
});
