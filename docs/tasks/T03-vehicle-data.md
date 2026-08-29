# T03 — Bundled vehicle dataset and lookup

**Depends on:** T02 · **Unblocks:** T11, T12 · **Network:** offline generation only

## Goal
Let someone pick their car and get a tank size and consumption figure, without any
runtime API. There is no free EU make/model → L/100km service; see DATA-SOURCES.md.

## Inputs
- `VehicleRecord` from `lib/types.ts`.
- Source data: EEA CO₂-monitoring dataset or UK VCA car fuel data (public, downloadable).

## Outputs

`scripts/build-vehicles.ts` — offline generator. Reads a raw dataset, emits the JSON
below. Documented at the top with the exact source URL and download date. Not shipped
to the client; run by hand and the output committed.

`lib/vehicle/vehicles.json` — array of `VehicleRecord`, **at least 150 models** covering
the makes common in NL/BE/DE/FR: VW, Toyota, Renault, Peugeot, Opel, Ford, Škoda, Kia,
Hyundai, BMW, Mercedes, Audi, Volvo, Dacia, Citroën, Fiat, Seat, Nissan, Tesla omitted
(no liquid fuel). Sorted by make then model. Ids are kebab-case and stable.

`lib/vehicle/index.ts`:

```ts
export function allMakes(): string[];
export function modelsForMake(make: string): VehicleRecord[];
export function findVehicle(id: string): VehicleRecord | undefined;
/** Case- and accent-insensitive prefix + substring search across "make model". */
export function searchVehicles(query: string, limit?: number): VehicleRecord[];
export function isPlausibleVehicle(v: Vehicle): boolean;
```

`isPlausibleVehicle` guards manual entry: tank 10–200 L, consumption 1–40 L/100km,
both finite. The UI and the API both call it.

`lib/vehicle/index.test.ts`.

## Acceptance criteria
- [ ] `vehicles.json` has ≥150 records; every one validates against `VehicleRecord`.
- [ ] Every `tankLitres` ∈ [20,120]; every `consumptionLPer100Km` ∈ [2,20]. A record
      outside these is a data bug — fix or drop it, don't ship it.
- [ ] Ids are unique and stable across regeneration (derived from make+model, not index).
- [ ] `searchVehicles("golf")` returns Golf variants ranked above incidental matches.
- [ ] `searchVehicles("citroen")` matches "Citroën" — accent folding works.
- [ ] `isPlausibleVehicle({tankLitres:0, ...})` is `false`.
- [ ] The generator script names its source URL and download date in a header comment.

## Out of scope
RDW plate lookup. Any UI. Real-world consumption correction factors — ship the
official figures and let the user override.
