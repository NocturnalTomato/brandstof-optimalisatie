# T15 — Price caching and rate limiting

**Depends on:** T11 · **Network:** no

## Goal
Stop us hammering the upstreams, and make repeat plans fast. Wraps the price layer
without changing its interface.

## Why this matters more than it looks
DirectLease is an unsanctioned source with deliberate anti-automation measures
(DATA-SOURCES.md). ORS's free tier is 2 000 requests/day. Spain and Italy return the
entire country per call. Uncached, this app is both rude and slow.

## Inputs
- `fetchStations` from T05. Do not change its signature.

## Outputs

`lib/cache/ttl.ts`:
```ts
export interface CacheEntry<T> { value: T; expiresAt: number }
export function getOrSet<T>(key: string, ttlS: number, fn: () => Promise<T>): Promise<T>;
export function invalidate(prefix?: string): void;
```
In-memory, per-instance. Serverless instances are short-lived and unshared — that is
fine and expected; say so in a comment so nobody assumes it is a shared cache.

**Single-flight is the important part**: concurrent misses on the same key must await
one in-flight promise, not start N upstream fetches.

`lib/cache/priceCache.ts` — wraps the providers. TTL by source cadence:
live sources (ANWB, Tankerkönig, FR) **900 s**; daily sources (ES, IT, DirectLease)
**6 h**. Key on source id + a bbox rounded to ~0.25° so nearby routes share entries.

`lib/cache/rateLimit.ts`:
```ts
export function allow(key: string, limit: number, windowS: number): boolean;
```
Per-IP limit on `/api/plan`: **20 requests per 5 minutes**. Over the limit → `429`
with a `Retry-After` header.

Wire both into `app/api/plan/route.ts`.

## Acceptance criteria
- [ ] Two identical plan requests inside the TTL produce exactly **one** upstream fetch
      per source. Assert the call count with a stubbed provider.
- [ ] **Single-flight**: ten concurrent identical requests trigger one upstream call.
      Test with a deliberately slow stub.
- [ ] An expired entry refetches; a fetch that throws does **not** poison the cache with
      an empty value — the previous good value is preferred over caching a failure.
- [ ] Bbox rounding makes two nearby routes share a cache entry; test that two distant
      routes do not.
- [ ] Rate limiting returns `429` with `Retry-After` and does not count requests that
      failed validation with `400`.
- [ ] TTLs are configurable via `PRICE_CACHE_TTL_S` with the documented defaults.
- [ ] Cache keys contain no API key and no personal data.

## Out of scope
Redis or any external store — if we need cross-instance caching, that is its own task
and its own decision.
