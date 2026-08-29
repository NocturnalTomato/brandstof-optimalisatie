import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoundingBox } from "../types";
import fixture from "./__fixtures__/spain-all.json";
import { parseSpainPrice } from "./spain";

// Madrid only: station 1001/1002 fall inside, Barcelona (2001) falls outside.
const MADRID_BBOX: BoundingBox = { minLat: 40.3, minLon: -3.8, maxLat: 40.5, maxLon: -3.6 };

vi.mock("./http", () => ({ fetchJson: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("parseSpainPrice", () => {
  it("parses comma decimals", () => {
    expect(parseSpainPrice("1,529")).toBeCloseTo(1.529);
  });

  it("treats a blank price as not sold", () => {
    expect(parseSpainPrice("")).toBeUndefined();
    expect(parseSpainPrice(undefined)).toBeUndefined();
  });
});

describe("SpainPriceProvider", () => {
  it("has the required provider identity", async () => {
    const { SpainPriceProvider } = await import("./spain");
    const provider = new SpainPriceProvider();

    expect(provider.id).toBe("es-minetur");
    expect(provider.countries).toEqual(["ES"]);
    expect(provider.unofficial).toBe(false);
  });

  it("parses diesel prices and filters to the bbox in memory", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue(fixture as never);
    const { SpainPriceProvider } = await import("./spain");

    const stations = await new SpainPriceProvider().stationsInBBox(MADRID_BBOX, "diesel");

    expect(stations).toHaveLength(2);
    expect(stations.every((s) => s.country === "ES")).toBe(true);
    expect(stations.find((s) => s.sourceId === "1001")?.prices.diesel).toBeCloseTo(1.529);
  });

  it("omits a station for a fuel it does not sell (blank price)", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue(fixture as never);
    const { SpainPriceProvider } = await import("./spain");

    const stations = await new SpainPriceProvider().stationsInBBox(MADRID_BBOX, "e5");

    expect(stations.find((s) => s.sourceId === "1002")).toBeUndefined();
    expect(stations.find((s) => s.sourceId === "1001")).toBeDefined();
  });

  it("fetches the whole-country endpoint at most once per call", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue(fixture as never);
    const { SpainPriceProvider } = await import("./spain");

    await new SpainPriceProvider().stationsInBBox(MADRID_BBOX, "diesel");

    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("returns [] rather than throwing on upstream failure", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue(null as never);
    const { SpainPriceProvider } = await import("./spain");

    await expect(new SpainPriceProvider().stationsInBBox(MADRID_BBOX, "diesel")).resolves.toEqual([]);
  });

  it("returns [] rather than throwing on a malformed payload", async () => {
    const { fetchJson } = await import("./http");
    vi.mocked(fetchJson).mockResolvedValue({ nonsense: true } as never);
    const { SpainPriceProvider } = await import("./spain");

    await expect(new SpainPriceProvider().stationsInBBox(MADRID_BBOX, "diesel")).resolves.toEqual([]);
  });
});
