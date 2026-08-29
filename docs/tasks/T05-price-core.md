# T05 — Price provider core

**Depends on:** T02 · **Unblocks:** T06, T07, T08, T11 · **Network:** no

## Goal
The interface and registry every price adapter plugs into, plus the shared plumbing
so the three adapter tasks don't each invent their own. Build this before T06–T08.

## Inputs
- `PriceProvider`, `Station`, `PriceSourceId`, `BoundingBox`, `FuelType` from `lib/types.ts`.

## Outputs

`lib/prices/registry.ts`:
```ts
export function registerProvider(p: PriceProvider): void;
export function providersForCountries(cs: readonly CountryCode[]): PriceProvider[];
export function allProviders(): PriceProvider[];
```
Preference order matters where two providers cover one country: for NL, `anwb` before
`directlease`. Encode that explicitly, don't rely on registration order.

`lib/prices/fetchStations.ts`:
```ts
export interface FetchResult {
  stations: Station[];
  sources: Array<{ id: PriceSourceId; countries: CountryCode[];
                   stationCount: number; oldestObservedAt: string; unofficial: boolean }>;
  uncovered: CountryCode[];
}
export async function fetchStations(
  bbox: BoundingBox, countries: readonly CountryCode[],
  fuel: FuelType, signal?: AbortSignal,
): Promise<FetchResult>;
```
Runs the relevant providers **in parallel**, tolerates individual failures, merges,
deduplicates, and reports which route countries got no stations at all.

`lib/prices/dedupe.ts`:
```ts
export function dedupeStations(stations: Station[]): Station[];
```
Two stations are the same if they are within **60 m** and their names share a brand
token. Keep the one with the newer `observedAt`; on a tie prefer the official source.

`lib/prices/http.ts` — shared fetch helper: timeout via `AbortSignal`, one retry on
5xx/network with 400 ms backoff, a `User-Agent`, and `never throws` semantics that
adapters can build on.

`lib/prices/index.ts` — registers the built-in providers and re-exports.

Tests: `registry.test.ts`, `dedupe.test.ts`, `fetchStations.test.ts` (fake providers,
including one that rejects and one that hangs past the abort).

## Acceptance criteria
- [ ] A provider that rejects does not fail `fetchStations`; the others' results survive.
- [ ] A provider that never resolves is cut off by the abort signal and treated as empty.
- [ ] `uncovered` lists exactly the route countries with zero stations returned.
- [ ] `dedupeStations` merges two records of the same station 40 m apart with a shared
      brand token, and does **not** merge two genuinely different stations 40 m apart
      with unrelated names (a real case at motorway service areas).
- [ ] For NL, `providersForCountries(["NL"])` puts `anwb` before `directlease`.
- [ ] `oldestObservedAt` per source is the *oldest*, so the UI can be honest about staleness.

## Out of scope
Any specific country adapter (T06–T08). Caching — that is T15, and it wraps this layer
rather than living inside it.
