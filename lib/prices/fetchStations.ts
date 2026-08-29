// Fans a bbox query out to every provider covering the requested countries, in
// parallel, tolerating individual failures. See docs/tasks/T05-price-core.md.

import type { BoundingBox, CountryCode, FuelType, PriceProvider, PriceSourceId, Station } from "../types";
import { providersForCountries } from "./registry";
import { dedupeStations } from "./dedupe";

export interface FetchResult {
  stations: Station[];
  sources: Array<{
    id: PriceSourceId;
    countries: CountryCode[];
    stationCount: number;
    oldestObservedAt: string;
    unofficial: boolean;
  }>;
  uncovered: CountryCode[];
}

/**
 * Calls one provider and always resolves — with its stations, with `[]` if it
 * rejects, or with `[]` the moment `signal` aborts, even if the provider's own
 * promise never settles. A misbehaving adapter can't hang the whole fetch.
 */
function callProvider(
  provider: PriceProvider,
  bbox: BoundingBox,
  fuel: FuelType,
  signal: AbortSignal | undefined,
): Promise<Station[]> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (stations: Station[]) => {
      if (settled) return;
      settled = true;
      resolve(stations);
    };

    if (signal) {
      if (signal.aborted) {
        finish([]);
        return;
      }
      signal.addEventListener("abort", () => finish([]), { once: true });
    }

    provider.stationsInBBox(bbox, fuel, signal).then(finish, (err) => {
      console.error(`price provider "${provider.id}" failed:`, err);
      finish([]);
    });
  });
}

export async function fetchStations(
  bbox: BoundingBox,
  countries: readonly CountryCode[],
  fuel: FuelType,
  signal?: AbortSignal,
): Promise<FetchResult> {
  const providers = providersForCountries(countries);
  const results = await Promise.all(
    providers.map((provider) => callProvider(provider, bbox, fuel, signal)),
  );

  const stations: Station[] = [];
  const sources: FetchResult["sources"] = [];
  const covered = new Set<CountryCode>();

  providers.forEach((provider, i) => {
    const stationsFromProvider = results[i];
    if (stationsFromProvider.length === 0) return;

    for (const s of stationsFromProvider) covered.add(s.country);

    let oldestObservedAt = stationsFromProvider[0].observedAt;
    for (const s of stationsFromProvider) {
      if (s.observedAt < oldestObservedAt) oldestObservedAt = s.observedAt;
    }

    sources.push({
      id: provider.id,
      countries: [...provider.countries],
      stationCount: stationsFromProvider.length,
      oldestObservedAt,
      unofficial: provider.unofficial,
    });

    stations.push(...stationsFromProvider);
  });

  const uncovered = countries.filter((c) => !covered.has(c));

  return { stations: dedupeStations(stations), sources, uncovered };
}
