# T16 — Test setup and CI

**Depends on:** T01 · **Runs alongside everything** · **Network:** no

## Goal
Make it cheap for every other task to prove its acceptance criteria, and stop
regressions landing. Do this early — the other fifteen tasks assume `npm test` works.

## Outputs

`vitest.config.ts` — Node environment for `lib/**`, jsdom for `components/**`.
Coverage via v8. Path alias `@/*` matching `tsconfig.json`.

`vitest.setup.ts` — jsdom setup, `@testing-library/jest-dom`, and a **global fetch
guard**: any un-stubbed `fetch` in a unit test throws with a clear message. The sandbox
has no network, so an accidental live call should fail loudly rather than time out
mysteriously.

`lib/testing/fixtures.ts`:
```ts
export function makeRoute(opts?: Partial<{distanceKm:number; points:number; countries:CountryCode[]}>): Route;
export function makeStation(opts?: Partial<Station>): Station;
export function makeCorridor(opts?: Partial<{
  lengthKm:number; count:number; priceRange:[number,number]; seed:number;
}>): CorridorStation[];
export function makeVehicle(opts?: Partial<Vehicle>): Vehicle;
```
Corridor generation must be **seeded and deterministic** — T10's property tests depend
on reproducibility. A failing case must be replayable from its seed.

`.github/workflows/ci.yml` — on push and PR: install, `typecheck`, `lint`, `test`,
`build`. Node 20. Cache npm.

`docs/tasks/TESTING.md` — one page: how to add a test, how to record a fixture from a
real API response, and the naming convention for `__fixtures__`.

## Acceptance criteria
- [ ] `npm test` runs clean on a repo with only T01–T02 merged (no tests is not a failure).
- [ ] The fetch guard throws on an un-stubbed `fetch` in a unit test, with a message
      naming the offending URL.
- [ ] `makeCorridor({seed:42})` returns byte-identical output across runs and machines.
- [ ] CI fails on a type error, a lint error, a failing test, or a broken build —
      verify each by pushing a deliberate breakage once.
- [ ] Coverage is reported but **not** gated on a percentage. Thresholds here would
      reward tests of trivia; the acceptance criteria in each task are the real bar.

## Out of scope
E2E/browser tests. Add them once T12 and T14 are merged — separate task, separate
decision about tooling.
