# T14 — Result: the rail, tabs, cap slider

**Depends on:** T11, T12 · **Network:** no

## Goal
The answer screen. The rail from the form continues as the route: hollow nodes at
origin and destination, filled nodes at refuelling stops.

## Inputs
- `PlanApiResponse` from T11.
- `docs/DESIGN.md`. Reference prototype:
  <https://claude.ai/code/artifact/63dc2d69-a769-48d2-ad1c-1b0b1b0ff64b>

## Outputs

| File | Owns |
|---|---|
| `components/result/Rail.tsx` | legs: origin, each stop, destination |
| `components/result/PlanTabs.tsx` | Cheapest / Fewest stops |
| `components/result/CapSlider.tsx` | max-stops slider |
| `components/result/InfoDot.tsx` | the ⓘ button and tooltip |
| `components/result/Result.tsx` | composes the above, owns tab + cap state |

Rules from DESIGN.md that are acceptance criteria here, not suggestions:

- **Bare minimum on screen**: headline, tabs, slider, stops, one primary button.
  No disclaimers, no source notes, no fine print in the layout.
- **Detail lives in ⓘ tooltips**: address, €/litre, km mark, motorway flag, price
  timestamp; on the total, what it excludes.
- **The cap slider's floor is `minStops`**, and it renders only when
  `maxStopsAvailable > minStops`. An inert slider is worse than none.
- **The slider must be a persistent DOM node.** Re-rendering it on `input` destroys the
  element mid-drag and the drag dies instantly. This bug was hit in the prototype.

Changing the cap re-requests `/api/plan` with the new `maxStops`. Debounce at 250 ms,
abort the in-flight request, and keep the previous plan visible while loading — never
flash an empty rail.

Honesty in the UI, in tooltips rather than banners:
- If `sources[].unofficial`, the price-timestamp tooltip says where the data came from.
- If `uncovered` is non-empty, stops are still shown but the tooltip on the total notes
  which countries had no price data.

## Acceptance criteria
- [ ] Zero-stop plans render as "No stops needed." with no empty rail and no slider.
- [ ] Infeasible responses (`422`) render the API's `message` verbatim with a way back
      to change an answer. No raw error text, no blank screen.
- [ ] Dragging the slider is smooth — the input is never re-created mid-drag. Verify by
      dragging from floor to ceiling in one motion without releasing.
- [ ] Tooltips open on hover **and** keyboard focus, and each ⓘ has an `aria-label`
      carrying the same text.
- [ ] Tabs are real tabs: `role="tablist"`/`role="tab"`, `aria-selected`, arrow-key
      navigation.
- [ ] Money uses `tabular-nums` and aligns in its column.
- [ ] Truncated Google waypoint lists (>9 stops) surface the omission from T13's
      `TruncationInfo`.
- [ ] Works at 360 px with no horizontal scroll; all three theme states correct.
- [ ] Loading state keeps the previous plan visible; errors do not clear it either.

## Out of scope
The form (T12). The optimiser (T10). Caching (T15).
