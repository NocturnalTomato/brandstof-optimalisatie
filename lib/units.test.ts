import { describe, expect, it } from "vitest";
import {
  formatLitres,
  formatMoney,
  formatPricePerLitre,
  litresForDistance,
  litresToPercent,
  metresToKm,
  percentToLitres,
  roundMoney,
  roundPrice,
} from "./units";

describe("litresForDistance", () => {
  it("matches the analytic example from the task spec", () => {
    expect(litresForDistance(808_000, 6.2)).toBeCloseTo(50.096, 9);
  });

  it("is zero for zero distance", () => {
    expect(litresForDistance(0, 6.2)).toBe(0);
  });
});

describe("percentToLitres / litresToPercent round-trip", () => {
  const tanks = [36, 50, 66];
  const percents = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

  for (const tank of tanks) {
    for (const percent of percents) {
      it(`round-trips for tank=${tank}L percent=${percent}%`, () => {
        const litres = percentToLitres(percent, tank);
        const back = litresToPercent(litres, tank);
        expect(back).toBeCloseTo(percent, 9);
      });
    }
  }
});

describe("metresToKm", () => {
  it("converts metres to kilometres", () => {
    expect(metresToKm(808_000)).toBe(808);
  });
});

describe("roundMoney", () => {
  it("rounds half-up, not banker's rounding", () => {
    expect(roundMoney(80.815)).toBe(80.82);
  });

  it("rounds down when below the half", () => {
    expect(roundMoney(80.814)).toBe(80.81);
  });

  it("leaves an already-2dp value unchanged", () => {
    expect(roundMoney(12.5)).toBe(12.5);
  });
});

describe("roundPrice", () => {
  it("rounds to 3 decimals half-up", () => {
    expect(roundPrice(1.7295)).toBe(1.73);
    expect(roundPrice(1.7294)).toBe(1.729);
  });
});

describe("formatters under nl-NL", () => {
  it("formatMoney", () => {
    expect(formatMoney(80.815)).toBe("€80,82");
  });

  it("formatLitres", () => {
    expect(formatLitres(48.3)).toBe("48,3 L");
  });

  it("formatPricePerLitre", () => {
    expect(formatPricePerLitre(1.729)).toBe("€1,729");
  });
});
