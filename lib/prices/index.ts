// Public surface of lib/prices. See docs/tasks/T05-price-core.md.
//
// No providers are registered here yet — the NL/BE, DE and FR/ES/IT adapters
// (T06-T08) each call registerProvider() from their own module once built.

export { registerProvider, providersForCountries, allProviders } from "./registry";
export { dedupeStations } from "./dedupe";
export { fetchStations } from "./fetchStations";
export type { FetchResult } from "./fetchStations";
export { fetchJson } from "./http";
export type { FetchJsonOptions } from "./http";
