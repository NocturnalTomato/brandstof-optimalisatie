# T12 — Guided flow UI

**Depends on:** T02, T03 (can start against a stubbed API) · **Unblocks:** T14 · **Network:** no

## Goal
The four-question flow: route, car, tank now, tank on arrival. One question on screen
at a time, answered steps collapsing to a line, auto-scroll to the next.

## Inputs
- `docs/DESIGN.md` — tokens, motion, interaction rules. Follow it closely.
- Reference prototype: <https://claude.ai/code/artifact/63dc2d69-a769-48d2-ad1c-1b0b1b0ff64b>
- `lib/vehicle` (T03) for the car picker.

## Outputs

| File | Owns |
|---|---|
| `components/flow/Step.tsx` | rail node, `open`/`done`/`locked` states, collapsed summary, scroll-on-open |
| `components/flow/RouteStep.tsx` | from/to inputs, suggestion chips, resolution + debounce |
| `components/flow/CarStep.tsx` | search over `searchVehicles`, results grid, manual tank/consumption entry |
| `components/flow/FuelStep.tsx` | segmented bar gauge + range input; used twice with different props |
| `components/flow/useFlow.ts` | flow state machine: current step, answers, advance/reopen |
| `app/page.tsx` | composes the four steps and the result slot |

Flow state:
```ts
interface FlowState {
  from?: GeocodeResult; to?: GeocodeResult;
  vehicle?: Vehicle;
  startPercent: number;    // default 25
  arrivalPercent: number;  // default 20
  step: 0 | 1 | 2 | 3 | 4;
}
```

Auto-advance timings are in DESIGN.md and are deliberate — 220 ms after a chip, 650 ms
after typing, 800 ms on manual entry, and **never** on a slider drag.

## Acceptance criteria
- [ ] Only one step is interactive at a time; later steps are dimmed and
      `pointer-events: none`.
- [ ] Answering a step collapses it to a summary line and scrolls the next into view
      below the sticky header (no content hidden behind it).
- [ ] Clicking a collapsed summary reopens that step and re-locks the ones after it,
      preserving answers already given.
- [ ] Keyboard-only completion works end to end: Tab reaches every control, Enter
      submits the route step, arrow keys drive both sliders.
- [ ] Every control has an accessible name. The gauge exposes its value to assistive
      tech (`aria-valuenow` or a live region), not just as coloured bars.
- [ ] `prefers-reduced-motion: reduce` disables smooth scrolling and the fade-in.
- [ ] Works at 360 px wide with no horizontal page scroll.
- [ ] All three theme states render correctly (light, system-dark, explicit-light-on-dark-OS).
- [ ] Typing an unknown city does not advance and does not throw; the field simply
      stays unresolved.

## Out of scope
The result screen (T14). Calling the real API — stub it behind one function T14 replaces.
