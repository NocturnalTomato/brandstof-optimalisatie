# Task board

Fifteen tasks. Each is one PR. Each file states its inputs, its outputs as exact file
paths and exported signatures, and acceptance criteria you can check.

**Before starting any task:** read `docs/CONTRACTS.md`. It defines every type crossing
a module boundary. Import from `lib/types.ts`; never redeclare a shape locally.

---

## Dependency graph

```
T01 scaffold
 └── T02 core types + units            ← everything below depends on this
      ├── T03 vehicle dataset ────────────────────┐
      ├── T04 routing provider ───────────────────┤
      ├── T05 price provider core ──┐             │
      │     ├── T06 NL/BE adapter   │ parallel    │
      │     ├── T07 DE adapter      │             │
      │     └── T08 FR/ES/IT adapter│             │
      ├── T09 corridor ─────────────┘             │
      ├── T10 optimiser (pure, no deps beyond T02)│
      └── T13 maps links (pure)                   │
                                                  │
      T11 plan API  ← needs T03,T04,T05,T09,T10,T13
       └── T12 UI flow ── T14 UI result  ← needs T11
                                          T15 caching + limits ← needs T11
                                          T16 tests + CI ← runs alongside everything
```

## Lanes — what can be built at the same time

| Lane | Tasks | Needs |
|---|---|---|
| Foundations | T01 → T02 | nothing |
| Pure logic | **T10**, T13, T03 | T02 only. No network. Start these first — they are the highest-value, lowest-risk work. |
| Data adapters | T05 → T06, T07, T08 | T02. Fixture-driven, no live network needed. |
| Geometry | T04, T09 | T02 |
| Composition | T11 | all of the above |
| Interface | T12, T14 | T11 (can be built against a stubbed response earlier) |
| Hardening | T15, T16 | T11 |

T06, T07 and T08 are genuinely independent — three agents, no conflicts, one file each.

---

## Task list

| Id | Task | Depends on | Network needed |
|---|---|---|---|
| [T01](T01-scaffold.md) | Next.js scaffold + design tokens | — | npm only |
| [T02](T02-core-types.md) | Core types and unit helpers | T01 | no |
| [T03](T03-vehicle-data.md) | Bundled vehicle dataset + lookup | T02 | offline generation |
| [T04](T04-routing.md) | RoutingProvider: ORS + OSRM + polyline | T02 | yes (deploy to verify) |
| [T05](T05-price-core.md) | PriceProvider interface + registry | T02 | no |
| [T06](T06-price-nl-be.md) | NL/BE adapter (ANWB, DirectLease) | T05 | yes (deploy to verify) |
| [T07](T07-price-de.md) | DE adapter (Tankerkönig) | T05 | yes (deploy to verify) |
| [T08](T08-price-fr-es-it.md) | FR/ES/IT adapters | T05 | yes (deploy to verify) |
| [T09](T09-corridor.md) | Corridor projection + detour filter | T02 | no |
| [T10](T10-optimiser.md) | The optimiser DP | T02 | no |
| [T11](T11-plan-api.md) | `POST /api/plan` | T03–T10, T13 | yes |
| [T12](T12-ui-flow.md) | Guided flow UI | T02, T03 | no |
| [T13](T13-maps-links.md) | Google/Apple deep links | T02 | no |
| [T14](T14-ui-result.md) | Result rail, tabs, cap slider | T11, T12 | no |
| [T15](T15-caching.md) | Price caching + rate limiting | T11 | no |
| [T16](T16-testing-ci.md) | Test setup + CI | T01 | no |

---

## Claiming a task

1. Branch from `claude/fuel-optimization-app-gplx1x`.
2. Read your task file and `docs/CONTRACTS.md` in full.
3. Build only what the task's **Outputs** section lists. Its **Out of scope** section
   is there because another task owns that work — respect it or you will collide.
4. Meet every acceptance criterion. In your PR, state which you verified and how.
5. If you must change a shared type in `docs/CONTRACTS.md`, put it in the PR title.
   Other tasks are being built against those types right now.

## Honesty rules for this repo

- **"The fixture parses" and "the endpoint answers" are different claims.** The dev
  sandbox cannot reach any price API. Do not report live behaviour you have not seen.
- If a task turns out to be blocked or wrong, finish everything around it and say
  plainly what you left and why. Do not silently narrow the scope.
- If an endpoint in `docs/DATA-SOURCES.md` is dead, fix that table in your PR.
