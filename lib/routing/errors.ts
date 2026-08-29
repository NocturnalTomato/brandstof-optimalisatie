// Typed errors a RoutingProvider throws. The API route (T11) maps `RoutingError`
// to `no-route` / `upstream` per docs/CONTRACTS.md's error handling policy.

export class RoutingError extends Error {
  constructor(
    message: string,
    readonly kind: "no-route" | "upstream",
  ) {
    super(message);
    this.name = "RoutingError";
  }
}

/** Thrown by a provider that cannot geocode (e.g. OSRM). */
export class NotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotSupportedError";
  }
}
