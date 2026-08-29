// Public surface of lib/prices. See docs/tasks/T05-price-core.md.
//
// Each country adapter self-registers via registerProvider() as a side effect
// of being imported (see registry.ts / anwb.ts / directlease.ts). Importing
// them here for side effects is what makes providersForCountries() /
// fetchStations() see them without every caller needing to know which
// adapters exist. T07/T08 should follow the same pattern: implement, then add
// a side-effect import line below.
import "./anwb";
import "./directlease";
import "./tankerkoenig";

export { registerProvider, providersForCountries, allProviders } from "./registry";
export { dedupeStations } from "./dedupe";
export { fetchStations } from "./fetchStations";
export type { FetchResult } from "./fetchStations";
export { fetchJson } from "./http";
export type { FetchJsonOptions } from "./http";
