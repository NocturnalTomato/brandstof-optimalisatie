import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "./http";

describe("fetchJson", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed body on a 2xx response", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(fetchJson("https://example.test")).resolves.toEqual({ ok: true });
  });

  it("sends a User-Agent header", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));

    await fetchJson("https://example.test");

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("User-Agent")).toMatch(/brandstof/);
  });

  it("retries once on a 5xx response, then returns the retry's result", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(fetchJson("https://example.test")).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("never throws — a network error on both attempts resolves to null", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    await expect(fetchJson("https://example.test")).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("resolves to null without retrying on a 4xx response", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 404 }));

    await expect(fetchJson("https://example.test")).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("resolves to null immediately if the caller's signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(fetchJson("https://example.test", { signal: controller.signal })).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
