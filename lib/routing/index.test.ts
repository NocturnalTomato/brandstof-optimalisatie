import { afterEach, describe, expect, it, vi } from "vitest";
import { getRoutingProvider, OrsRoutingProvider, OsrmRoutingProvider } from "./index";

describe("getRoutingProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns OrsRoutingProvider when ORS_API_KEY is set", () => {
    vi.stubEnv("ORS_API_KEY", "test-key");
    expect(getRoutingProvider()).toBeInstanceOf(OrsRoutingProvider);
  });

  it("falls back to OsrmRoutingProvider without throwing when ORS_API_KEY is missing", () => {
    vi.stubEnv("ORS_API_KEY", "");
    expect(() => getRoutingProvider()).not.toThrow();
    expect(getRoutingProvider()).toBeInstanceOf(OsrmRoutingProvider);
  });
});
