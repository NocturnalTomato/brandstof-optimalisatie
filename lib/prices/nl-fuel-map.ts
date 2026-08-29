// Shared NL/BE fuel-name mapping for the anwb and directlease adapters. Both
// upstreams use the same Dutch fuel-type vocabulary, so this table is shared
// rather than duplicated. See docs/tasks/T06-price-nl-be.md for the exact table:
//
//   Euro95 / E10  -> e10
//   Diesel        -> diesel
//   LPG           -> lpg
//   Superplus / E5 -> e5
//
// Matching is case-insensitive and trims whitespace, since upstream casing is
// not guaranteed to be consistent across sources or over time.

import type { FuelType } from "../types";

const NL_FUEL_NAME_TO_TYPE: Record<string, FuelType> = {
  euro95: "e10",
  e10: "e10",
  diesel: "diesel",
  lpg: "lpg",
  superplus: "e5",
  e5: "e5",
};

/** Maps an upstream NL/BE fuel-name string to our `FuelType`, or `undefined` if unknown. */
export function mapNlFuelName(rawName: string | undefined | null): FuelType | undefined {
  if (!rawName) return undefined;
  return NL_FUEL_NAME_TO_TYPE[rawName.trim().toLowerCase()];
}
