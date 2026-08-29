// Resolves the countries a route polyline passes through, without calling a
// geocoding API per sample point. See T04-routing.md for why this matters: the
// result drives which price adapters get called for a route.
//
// Approach: a bounding box per country gives fast, usually-unambiguous
// candidates. Where boxes overlap (or a point falls in none, e.g. a fjord or a
// border sliver) we fall back to nearest-anchor: the country whose nearest
// reference city is closest to the sample point.

import { COUNTRY_CODES, type CountryCode, type LatLon } from "../types";
import { cumulativeDistances, haversineM } from "./geo";

interface CountryBBox {
  code: CountryCode;
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

// Approximate mainland bounding boxes (WGS84 degrees). Deliberately loose —
// overlap is expected and resolved by the anchor fallback below.
const BBOXES: CountryBBox[] = [
  { code: "NL", minLat: 50.75, minLon: 3.35, maxLat: 53.55, maxLon: 7.22 },
  { code: "BE", minLat: 49.5, minLon: 2.5, maxLat: 51.5, maxLon: 6.4 },
  { code: "LU", minLat: 49.44, minLon: 5.73, maxLat: 50.18, maxLon: 6.53 },
  { code: "DE", minLat: 47.27, minLon: 5.87, maxLat: 55.06, maxLon: 15.04 },
  { code: "FR", minLat: 41.3, minLon: -5.2, maxLat: 51.1, maxLon: 9.6 },
  { code: "ES", minLat: 36.0, minLon: -9.3, maxLat: 43.8, maxLon: 3.3 },
  { code: "IT", minLat: 36.6, minLon: 6.6, maxLat: 47.1, maxLon: 18.5 },
  { code: "AT", minLat: 46.37, minLon: 9.53, maxLat: 49.02, maxLon: 17.16 },
  { code: "CH", minLat: 45.82, minLon: 5.96, maxLat: 47.81, maxLon: 10.49 },
  { code: "CZ", minLat: 48.55, minLon: 12.09, maxLat: 51.06, maxLon: 18.86 },
  { code: "DK", minLat: 54.56, minLon: 8.07, maxLat: 57.75, maxLon: 15.19 },
  { code: "PL", minLat: 49.0, minLon: 14.12, maxLat: 54.84, maxLon: 24.15 },
];

// A handful of reference cities per country, spread out so the nearest one is a
// decent proxy for "which country is this point actually in" when bounding
// boxes overlap (which happens a lot near the Alps and the Benelux borders).
const ANCHORS: Record<CountryCode, LatLon[]> = {
  NL: [
    { lat: 52.37, lon: 4.9 }, // Amsterdam
    { lat: 51.92, lon: 4.48 }, // Rotterdam
    { lat: 52.09, lon: 5.12 }, // Utrecht
    { lat: 53.22, lon: 6.57 }, // Groningen
    { lat: 50.85, lon: 5.69 }, // Maastricht
  ],
  BE: [
    { lat: 50.85, lon: 4.35 }, // Brussels
    { lat: 51.22, lon: 4.4 }, // Antwerp
    { lat: 50.63, lon: 5.57 }, // Liège
    { lat: 51.05, lon: 3.72 }, // Ghent
    { lat: 51.21, lon: 3.22 }, // Bruges
  ],
  LU: [
    { lat: 49.61, lon: 6.13 }, // Luxembourg City
    { lat: 49.5, lon: 5.98 }, // Esch-sur-Alzette
  ],
  DE: [
    { lat: 52.52, lon: 13.4 }, // Berlin
    { lat: 48.14, lon: 11.58 }, // Munich
    { lat: 53.55, lon: 9.99 }, // Hamburg
    { lat: 50.94, lon: 6.96 }, // Cologne
    { lat: 50.11, lon: 8.68 }, // Frankfurt
    { lat: 48.78, lon: 9.18 }, // Stuttgart
    { lat: 51.05, lon: 13.74 }, // Dresden
    { lat: 52.37, lon: 9.73 }, // Hanover
  ],
  FR: [
    { lat: 48.86, lon: 2.35 }, // Paris
    { lat: 45.76, lon: 4.83 }, // Lyon
    { lat: 43.3, lon: 5.37 }, // Marseille
    { lat: 43.6, lon: 1.44 }, // Toulouse
    { lat: 44.84, lon: -0.58 }, // Bordeaux
    { lat: 48.58, lon: 7.75 }, // Strasbourg
    { lat: 50.63, lon: 3.06 }, // Lille
    { lat: 47.22, lon: -1.55 }, // Nantes
  ],
  ES: [
    { lat: 40.42, lon: -3.7 }, // Madrid
    { lat: 41.39, lon: 2.17 }, // Barcelona
    { lat: 39.47, lon: -0.38 }, // Valencia
    { lat: 37.39, lon: -5.99 }, // Seville
    { lat: 43.26, lon: -2.93 }, // Bilbao
  ],
  IT: [
    { lat: 41.9, lon: 12.5 }, // Rome
    { lat: 45.46, lon: 9.19 }, // Milan
    { lat: 40.85, lon: 14.27 }, // Naples
    { lat: 45.07, lon: 7.69 }, // Turin
    { lat: 38.12, lon: 13.36 }, // Palermo
    { lat: 41.12, lon: 16.87 }, // Bari
  ],
  AT: [
    { lat: 48.21, lon: 16.37 }, // Vienna
    { lat: 47.07, lon: 15.44 }, // Graz
    { lat: 47.27, lon: 11.39 }, // Innsbruck
    { lat: 47.8, lon: 13.05 }, // Salzburg
    { lat: 48.31, lon: 14.29 }, // Linz
  ],
  CH: [
    { lat: 46.95, lon: 7.45 }, // Bern
    { lat: 47.38, lon: 8.54 }, // Zurich
    { lat: 46.2, lon: 6.14 }, // Geneva
    { lat: 47.56, lon: 7.59 }, // Basel
    { lat: 46.0, lon: 8.95 }, // Lugano
  ],
  CZ: [
    { lat: 50.08, lon: 14.44 }, // Prague
    { lat: 49.2, lon: 16.61 }, // Brno
    { lat: 49.84, lon: 18.29 }, // Ostrava
    { lat: 49.75, lon: 13.38 }, // Plzeň
  ],
  DK: [
    { lat: 55.68, lon: 12.57 }, // Copenhagen
    { lat: 56.16, lon: 10.21 }, // Aarhus
    { lat: 55.4, lon: 10.39 }, // Odense
    { lat: 57.05, lon: 9.92 }, // Aalborg
  ],
  PL: [
    { lat: 52.23, lon: 21.01 }, // Warsaw
    { lat: 50.06, lon: 19.94 }, // Kraków
    { lat: 51.11, lon: 17.04 }, // Wrocław
    { lat: 54.35, lon: 18.65 }, // Gdańsk
    { lat: 52.41, lon: 16.93 }, // Poznań
  ],
};

function bboxContains(bbox: CountryBBox, p: LatLon): boolean {
  return (
    p.lat >= bbox.minLat &&
    p.lat <= bbox.maxLat &&
    p.lon >= bbox.minLon &&
    p.lon <= bbox.maxLon
  );
}

function classifyPoint(p: LatLon): CountryCode {
  const candidates = BBOXES.filter((b) => bboxContains(b, p)).map((b) => b.code);
  const pool = candidates.length > 0 ? candidates : [...COUNTRY_CODES];

  let best = pool[0];
  let bestDist = Infinity;
  for (const code of pool) {
    for (const anchor of ANCHORS[code]) {
      const d = haversineM(p, anchor);
      if (d < bestDist) {
        bestDist = d;
        best = code;
      }
    }
  }
  return best;
}

const SAMPLE_INTERVAL_M = 10_000;

/** Countries the route passes through, in order of first entry, deduplicated. */
export function countriesAlongRoute(polyline: LatLon[]): CountryCode[] {
  if (polyline.length === 0) return [];

  const cum = cumulativeDistances(polyline);
  const result: CountryCode[] = [];
  const seen = new Set<CountryCode>();

  const record = (p: LatLon) => {
    const code = classifyPoint(p);
    if (!seen.has(code)) {
      seen.add(code);
      result.push(code);
    }
  };

  let nextSampleM = 0;
  for (let i = 0; i < polyline.length; i++) {
    if (cum[i] >= nextSampleM) {
      record(polyline[i]);
      nextSampleM = cum[i] + SAMPLE_INTERVAL_M;
    }
  }
  record(polyline[polyline.length - 1]);

  return result;
}
