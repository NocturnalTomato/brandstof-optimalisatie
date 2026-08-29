import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PriceProvider } from "../types";

function fakeProvider(id: PriceProvider["id"], countries: PriceProvider["countries"]): PriceProvider {
  return {
    id,
    countries,
    unofficial: false,
    stationsInBBox: vi.fn().mockResolvedValue([]),
  };
}

// registry.ts holds module-level state; each test gets a clean module instance.
beforeEach(() => {
  vi.resetModules();
});

describe("registerProvider / allProviders", () => {
  it("returns every registered provider", async () => {
    const registry = await import("./registry");
    const a = fakeProvider("directlease", ["NL", "BE"]);
    const b = fakeProvider("tankerkoenig", ["DE"]);

    registry.registerProvider(a);
    registry.registerProvider(b);

    expect(registry.allProviders()).toEqual([a, b]);
  });
});

describe("providersForCountries", () => {
  it("puts anwb before directlease for NL, regardless of registration order", async () => {
    const registry = await import("./registry");
    const directlease = fakeProvider("directlease", ["NL", "BE"]);
    const anwb = fakeProvider("anwb", ["NL"]);

    registry.registerProvider(directlease);
    registry.registerProvider(anwb);

    expect(registry.providersForCountries(["NL"]).map((p) => p.id)).toEqual([
      "anwb",
      "directlease",
    ]);
  });

  it("only returns providers covering a requested country", async () => {
    const registry = await import("./registry");
    const nl = fakeProvider("anwb", ["NL"]);
    const de = fakeProvider("tankerkoenig", ["DE"]);

    registry.registerProvider(nl);
    registry.registerProvider(de);

    expect(registry.providersForCountries(["DE"])).toEqual([de]);
  });

  it("returns a provider once even when it covers multiple requested countries", async () => {
    const registry = await import("./registry");
    const nlBe = fakeProvider("directlease", ["NL", "BE"]);

    registry.registerProvider(nlBe);

    expect(registry.providersForCountries(["NL", "BE"])).toEqual([nlBe]);
  });
});
