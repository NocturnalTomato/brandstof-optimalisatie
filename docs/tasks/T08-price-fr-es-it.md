# T08 — France, Spain and Italy price adapters

**Depends on:** T05 · **Unblocks:** T11 · **Network:** yes (verify on deploy)

## Goal
Three official government open-data sources, three quite different shapes. All keyless.

## Inputs
- `PriceProvider`, `Station` from `lib/types.ts`; `lib/prices/http.ts`.
- Endpoints in DATA-SOURCES.md.

## Outputs

`lib/prices/france.ts` — `FrancePriceProvider`, countries `["FR"]`, `unofficial: false`.
Opendatasoft Explore v2.1. Supports a real geo filter, so query the bbox directly:
`where=within_bbox(geom, minLat, minLon, maxLat, maxLon)`, paginate at `limit=100`
until exhausted, cap total records. Fuel fields are `gazole`, `sp95`, `sp98`, `e10`,
`e85`, `gplc` → map `gazole`→`diesel`, `e10`→`e10`, `sp98`/`sp95`→`e5`, `gplc`→`lpg`.

`lib/prices/spain.ts` — `SpainPriceProvider`, countries `["ES"]`.
**Returns the entire country in one response (~12k rows)** — there is no bbox
parameter. Fetch whole, filter in memory. Numbers use comma decimals
(`"1,529"`) — parse them, do not `parseFloat` blind. Fields:
`Precio Gasoleo A`→`diesel`, `Precio Gasolina 95 E10`→`e10`,
`Precio Gasolina 98 E5`→`e5`, `Precio Gases licuados del petróleo`→`lpg`.

`lib/prices/italy.ts` — `ItalyPriceProvider`, countries `["IT"]`.
**Two CSVs that must be joined** on `idImpianto`: `anagrafica_impianti_attivi.csv`
(name, brand, address, lat/lon) and `prezzo_alle_8.csv` (prices). Both are
semicolon-separated with a junk first line. Whole-country, filter in memory.
`Benzina`→`e5`, `Gasolio`→`diesel`, `GPL`→`lpg`.

Fixtures for each: `france-records.json`, `spain-all.json` (trimmed to ~200 rows),
`italy-anagrafica.csv`, `italy-prezzi.csv`. Tests per adapter.

## Acceptance criteria
- [ ] Each returns `[]` on upstream failure and on malformed payloads. Never throws.
- [ ] **Spain: comma decimals parse correctly.** `"1,529"` → `1.529`. A blank or `""`
      price means "not sold" → omit the station for that fuel. Test both.
- [ ] **Italy: the join is correct.** A price row with no matching anagrafica row is
      dropped, not emitted with an empty name. Test with a deliberately orphaned row.
- [ ] **Italy: the junk first line** of each CSV is skipped, and the semicolon
      delimiter is handled including quoted fields containing semicolons.
- [ ] France: pagination fetches all pages and stops correctly; the bbox filter is
      applied server-side, not by downloading France and filtering locally.
- [ ] ES and IT whole-country responses are fetched **once per plan at most** and
      filtered in memory. Assert the fetch call count in a test.
- [ ] `observedAt` from the payload in all three (FR has a per-record timestamp; ES and
      IT are daily — use the file/dataset date, and be honest that it is daily).
- [ ] **Live check on a Vercel preview**, stated per country.

## Out of scope
Portugal, Austria, Poland — later adapters, same interface. Caching (T15).
