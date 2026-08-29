// -----------------------------------------------------------------------------
// QUARANTINE ZONE — DirectLease `X-Checksum` header.
//
// DirectLease's Tankservice feed is a private mobile-app API, not a published
// one (see docs/DATA-SOURCES.md). It expects requests to look like they come
// from their own app client, which means attaching an `X-Checksum` header
// derived, per limited public knowledge of that private API, from a device
// UUID, the current date, and the request path.
//
// This file exists ONLY to compute that header. It is deliberately isolated
// from directlease.ts so that if this source is ever dropped (DirectLease
// changes their auth scheme, the repo owner reconsiders the risk, or ANWB turns
// out to be a complete keyless replacement — see DATA-SOURCES.md), this whole
// file can be deleted without touching any other module.
//
// Nothing here is verified against a live response — the dev sandbox cannot
// reach tankservice.app-it-up.com (egress blocked). Treat this as a best-effort
// reconstruction from public knowledge, to be confirmed or corrected on a real
// Vercel preview deploy.
// -----------------------------------------------------------------------------

import { createHash } from "node:crypto";

// A stable per-deployment device identifier, standing in for the UUID a real
// installed app would generate once and persist. Overridable via env for
// reproducibility / in case DirectLease ever allowlists a specific value.
const DEVICE_UUID = process.env.DIRECTLEASE_DEVICE_UUID ?? "00000000-0000-4000-8000-000000000000";

/** `YYYY-MM-DD`, matching the date component the checksum is believed to bind to. */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Computes the `X-Checksum` value for one request. Combines the device UUID,
 * the request date, and the request path into a single SHA-256 hex digest —
 * the shape a private app-client checksum of this kind typically takes.
 */
export function computeChecksum(path: string, date: Date): string {
  const material = `${DEVICE_UUID}${formatDate(date)}${path}`;
  return createHash("sha256").update(material).digest("hex");
}

/** Builds the header object to merge into a DirectLease request's headers. */
export function buildChecksumHeader(path: string, date: Date): Record<string, string> {
  return {
    "X-Checksum": computeChecksum(path, date),
    "X-Device-Id": DEVICE_UUID,
  };
}
