# T02 — Core types and unit helpers

**Depends on:** T01 · **Unblocks:** every other task · **Network:** no

## Goal
Transcribe `docs/CONTRACTS.md` into code, and provide the single place where unit
conversions live. This is a small task and a load-bearing one — get it exactly right,
because eleven other tasks import it.

## Inputs
- `docs/CONTRACTS.md`. Every type. Verbatim names, verbatim field names.

## Outputs

`lib/types.ts` — all types from CONTRACTS.md. Types and interfaces only; no runtime
logic beyond const arrays used for validation:

```ts
export const COUNTRY_CODES = ["NL","BE","LU","DE","FR","ES","IT","AT","CH","CZ","DK","PL"] as const;
export const FUEL_TYPES = ["e5","e10","diesel","lpg"] as const;
```

`lib/units.ts`:

```ts
export function percentToLitres(percent: number, tankLitres: number): number;
export function litresToPercent(litres: number, tankLitres: number): number;
export function litresForDistance(distanceM: number, consumptionLPer100Km: number): number;
export function metresToKm(m: number): number;
export function roundMoney(euros: number): number;      // 2 dp, half-up
export function roundPrice(euros: number): number;       // 3 dp, half-up
export function formatMoney(euros: number, locale?: string): string;   // "€80,82"
export function formatLitres(l: number, locale?: string): string;      // "48,3 L"
export function formatPricePerLitre(p: number, locale?: string): string; // "€1,729"
```

Default locale `nl-NL`: comma decimal separator, `€` prefix.

`lib/types.test.ts`, `lib/units.test.ts`.

## Acceptance criteria
- [ ] Every type in CONTRACTS.md exists with identical names and fields.
- [ ] `litresForDistance(808_000, 6.2) === 50.096` (within 1e-9).
- [ ] `percentToLitres` / `litresToPercent` round-trip within 1e-9 for
      tank ∈ {36, 50, 66}, percent ∈ {0, 5, …, 100}.
- [ ] `roundMoney(80.815) === 80.82` — half-up, not banker's rounding.
- [ ] Formatters produce `€80,82`, `48,3 L`, `€1,729` under `nl-NL`.
- [ ] `npm run typecheck` clean.

## Out of scope
Any provider, any DP, any component. This task ships types and arithmetic only.
