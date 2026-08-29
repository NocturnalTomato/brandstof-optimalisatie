// Registry every price adapter (T06-T08) plugs into. See docs/tasks/T05-price-core.md.

import type { CountryCode, PriceProvider, PriceSourceId } from "../types";

const providers: PriceProvider[] = [];

// Where two providers cover the same country, this fixes which one is tried
// first — independent of registration order. Countries with a single provider
// need no entry.
const PREFERENCE: Partial<Record<CountryCode, PriceSourceId[]>> = {
  NL: ["anwb", "directlease"],
};

export function registerProvider(p: PriceProvider): void {
  providers.push(p);
}

export function allProviders(): PriceProvider[] {
  return [...providers];
}

export function providersForCountries(cs: readonly CountryCode[]): PriceProvider[] {
  const wanted = new Set(cs);
  const matched = providers.filter((p) => p.countries.some((c) => wanted.has(c)));

  // Stable sort: only reorders pairs an explicit preference covers.
  return matched.sort((a, b) => {
    for (const country of cs) {
      const order = PREFERENCE[country];
      if (!order) continue;
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      if (ai !== -1 && bi !== -1 && ai !== bi) return ai - bi;
    }
    return 0;
  });
}
