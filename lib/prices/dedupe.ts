// Cross-source station dedup. Each adapter dedupes within its own source (see
// CONTRACTS.md); this layer merges across sources. See docs/tasks/T05-price-core.md.

import type { PriceSourceId, Station } from "../types";
import { haversineM } from "../routing/geo";

const DEDUPE_RADIUS_M = 60;
const MIN_TOKEN_LENGTH = 3;

// Reverse-engineered / unsanctioned sources — see docs/DATA-SOURCES.md. Kept here
// (rather than threading a Station -> unofficial lookup through callers) because
// dedupeStations only ever sees Station[].
const UNOFFICIAL_SOURCES: ReadonlySet<PriceSourceId> = new Set(["directlease"]);

function brandTokens(station: Station): Set<string> {
  const raw = station.brand ?? station.name;
  return new Set(
    raw
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= MIN_TOKEN_LENGTH),
  );
}

function shareBrandToken(a: Station, b: Station): boolean {
  const tokensA = brandTokens(a);
  for (const token of brandTokens(b)) {
    if (tokensA.has(token)) return true;
  }
  return false;
}

function isSameStation(a: Station, b: Station): boolean {
  return haversineM(a.location, b.location) <= DEDUPE_RADIUS_M && shareBrandToken(a, b);
}

function isOfficial(station: Station): boolean {
  return !UNOFFICIAL_SOURCES.has(station.source);
}

/** True if `candidate` should replace `existing` as the record kept for a duplicate. */
function isBetter(candidate: Station, existing: Station): boolean {
  if (candidate.observedAt !== existing.observedAt) {
    return candidate.observedAt > existing.observedAt;
  }
  return isOfficial(candidate) && !isOfficial(existing);
}

export function dedupeStations(stations: Station[]): Station[] {
  const kept: Station[] = [];

  for (const candidate of stations) {
    const dupIndex = kept.findIndex((existing) => isSameStation(existing, candidate));
    if (dupIndex === -1) {
      kept.push(candidate);
    } else if (isBetter(candidate, kept[dupIndex])) {
      kept[dupIndex] = candidate;
    }
  }

  return kept;
}
