import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoundingBox } from "../types";
import { parseCsv, splitCsvLine } from "./italy";

const FIXTURES_DIR = join(__dirname, "__fixtures__");
const ANAGRAFICA_CSV = readFileSync(join(FIXTURES_DIR, "italy-anagrafica.csv"), "utf-8");
const PREZZI_CSV = readFileSync(join(FIXTURES_DIR, "italy-prezzi.csv"), "utf-8");

// Both fixture stations (Roma 5001, Milano 5002) sit inside a bbox spanning Italy.
const ITALY_BBOX: BoundingBox = { minLat: 36, minLon: 6, maxLat: 47.5, maxLon: 19 };

vi.mock("./http", () => ({ fetchText: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("splitCsvLine", () => {
  it("splits on semicolons", () => {
    expect(splitCsvLine("a;b;c")).toEqual(["a", "b", "c"]);
  });

  it("keeps a semicolon inside a quoted field intact", () => {
    expect(splitCsvLine('5001;"Via Tiburtina, 500; km 12";Roma')).toEqual([
      "5001",
      "Via Tiburtina, 500; km 12",
      "Roma",
    ]);
  });
});

describe("parseCsv", () => {
  it("skips the junk first line and reads the real header from the second", () => {
    const { header, rows } = parseCsv(ANAGRAFICA_CSV);

    expect(header).toContain("idImpianto");
    expect(header).not.toContain("Estrazione del 28/08/2026 - non ufficiale");
    expect(rows).toHaveLength(2);
  });
});

describe("ItalyPriceProvider", () => {
  it("has the required provider identity", async () => {
    const { ItalyPriceProvider } = await import("./italy");
    const provider = new ItalyPriceProvider();

    expect(provider.id).toBe("it-mimit");
    expect(provider.countries).toEqual(["IT"]);
    expect(provider.unofficial).toBe(false);
  });

  it("joins anagrafica and prezzi on idImpianto", async () => {
    const { fetchText } = await import("./http");
    vi.mocked(fetchText).mockResolvedValueOnce(ANAGRAFICA_CSV).mockResolvedValueOnce(PREZZI_CSV);
    const { ItalyPriceProvider } = await import("./italy");

    const stations = await new ItalyPriceProvider().stationsInBBox(ITALY_BBOX, "e5");

    const roma = stations.find((s) => s.sourceId === "5001");
    expect(roma?.name).toBe("IP Roma Est");
    expect(roma?.prices.e5).toBeCloseTo(1.789);
  });

  it("drops a price row with no matching anagrafica row, rather than emitting an empty name", async () => {
    const { fetchText } = await import("./http");
    vi.mocked(fetchText).mockResolvedValueOnce(ANAGRAFICA_CSV).mockResolvedValueOnce(PREZZI_CSV);
    const { ItalyPriceProvider } = await import("./italy");

    const stations = await new ItalyPriceProvider().stationsInBBox(ITALY_BBOX, "e5");

    expect(stations.find((s) => s.sourceId === "9999")).toBeUndefined();
  });

  it("fetches each whole-country CSV at most once per call", async () => {
    const { fetchText } = await import("./http");
    vi.mocked(fetchText).mockResolvedValueOnce(ANAGRAFICA_CSV).mockResolvedValueOnce(PREZZI_CSV);
    const { ItalyPriceProvider } = await import("./italy");

    await new ItalyPriceProvider().stationsInBBox(ITALY_BBOX, "diesel");

    expect(fetchText).toHaveBeenCalledTimes(2);
  });

  it("maps Benzina/Gasolio/GPL to e5/diesel/lpg", async () => {
    const { fetchText } = await import("./http");
    vi.mocked(fetchText).mockResolvedValueOnce(ANAGRAFICA_CSV).mockResolvedValueOnce(PREZZI_CSV);
    const { ItalyPriceProvider } = await import("./italy");

    const provider = new ItalyPriceProvider();
    const diesel = await provider.stationsInBBox(ITALY_BBOX, "diesel");
    expect(diesel.find((s) => s.sourceId === "5001")?.prices.diesel).toBeCloseTo(1.699);
  });

  it("returns [] for a fuel MIMIT does not report (e10)", async () => {
    const { fetchText } = await import("./http");
    const { ItalyPriceProvider } = await import("./italy");

    const stations = await new ItalyPriceProvider().stationsInBBox(ITALY_BBOX, "e10");

    expect(stations).toEqual([]);
    expect(fetchText).not.toHaveBeenCalled();
  });

  it("returns [] rather than throwing when either CSV fails to fetch", async () => {
    const { fetchText } = await import("./http");
    vi.mocked(fetchText).mockResolvedValueOnce(ANAGRAFICA_CSV).mockResolvedValueOnce(null as never);
    const { ItalyPriceProvider } = await import("./italy");

    await expect(new ItalyPriceProvider().stationsInBBox(ITALY_BBOX, "diesel")).resolves.toEqual([]);
  });
});
