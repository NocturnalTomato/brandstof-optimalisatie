# Design — "The Rail"

Chosen from ten directions. Newspaper as **influence**, not format: serif for figures,
hairline rules, tabular numerals — on a screen you operate, not a page you read.

The organising idea: **one vertical rail runs down the entire page.** The four form
steps are nodes on it, filling in as you answer. At the end the same rail becomes the
route, with filled nodes at refuelling stops and hollow ones at origin and destination.
The form and the answer are one continuous line. Do not break this metaphor.

Reference prototype (working, interactive):
<https://claude.ai/code/artifact/63dc2d69-a769-48d2-ad1c-1b0b1b0ff64b>

---

## Tokens

Define once in `app/globals.css` as CSS custom properties. Never hard-code a colour in
a component. Style through the tokens so both themes resolve as a set.

```css
:root{
  --bg:#F4F2EB; --panel:#EBE9E0; --ink:#1D2A22; --soft:#66756C; --faint:#8E9C93;
  --line:#C4CDC6; --hair:#DFDDD4; --acc:#1D2A22; --on-acc:#F4F2EB; --node:#A3B2A9;
  --tip:#1D2A22; --tipfg:#F4F2EB; --warm:#A8552F;
}
@media (prefers-color-scheme:dark){ :root:not([data-theme="light"]){
  --bg:#0F1512; --panel:#18211C; --ink:#E7EDE7; --soft:#93A399; --faint:#6E7E74;
  --line:#2B362F; --hair:#212B25; --acc:#D8E8DC; --on-acc:#0F1512; --node:#4A5A50;
  --tip:#D8E8DC; --tipfg:#0F1512; --warm:#E39A72;
}}
:root[data-theme="dark"]{ /* same dark values, so an explicit toggle wins both ways */ }
```

Three theme states, not two: an explicit choice stamps `data-theme`, and the default
"system" setting stamps nothing. A colour defined **only** inside a media query or a
`[data-theme]` block will not apply in the unstamped state — that is the classic
unreadable-page bug. Always define the full light palette on bare `:root`.

## Type

| Role | Face | Use |
|---|---|---|
| Display / figures | **Fraunces** 600 | Questions, totals, per-stop money, summary values |
| Everything else | **Archivo** 400/500/600 | Labels, hints, controls, addresses |

Load from Google Fonts with `display=swap` and a real fallback stack
(`Fraunces, Georgia, serif` / `Archivo, system-ui, sans-serif`).

Every figure that sits in a column gets `font-variant-numeric: tabular-nums`.

## Motion

- Steps reveal with a 0.35 s fade-and-rise; the rail's filled segment grows over 0.5 s.
- Auto-scroll uses `scrollIntoView({behavior:"smooth", block:"start"})` with
  `scroll-margin-top: 74px` to clear the sticky header.
- Honour `prefers-reduced-motion: reduce` — drop to `behavior:"auto"` and no animation.

---

## Interaction rules

**Show only what is being asked.** Answered steps collapse to a single line
(`Amsterdam → München · 808 km`) that is clickable to reopen. Steps below the current
one are dimmed and `pointer-events: none`. Never more than one live question on screen.

**Auto-advance** when an answer is unambiguous:

| Step | Advances when |
|---|---|
| Route | both cities resolve — 220 ms after a chip click, 650 ms after typing stops |
| Car | immediately on picking a car; 800 ms debounce on manual tank + consumption |
| Tank now | on the explicit Continue button |
| Tank on arrival | on the explicit Plan it button |

Sliders never auto-advance: dragging is not a decision.

**Detail lives in ⓘ tooltips, not on the page.** No disclaimers, no data-source notes,
no fine print in the layout. The tooltip carries address, €/litre, km mark, motorway
flag, price timestamp, and what the total excludes. Tooltips open on hover **and**
keyboard focus, and the button carries an `aria-label` with the same text.

**The cap slider** appears only on the Cheapest tab, and only when raising the cap can
actually change the answer (`maxStopsAvailable > minStops`). Its floor is the
fewest-stops answer. An inert slider is worse than no slider.

---

## Components

| Component | Owns |
|---|---|
| `components/flow/Step.tsx` | rail node, open/done/locked states, collapsed summary, scroll-on-open |
| `components/flow/RouteStep.tsx` | from/to inputs, suggestion chips, city resolution |
| `components/flow/CarStep.tsx` | vehicle grid, manual tank + consumption entry |
| `components/flow/FuelStep.tsx` | segmented bar gauge + range input; used twice |
| `components/result/Rail.tsx` | origin, stops, destination as rail legs |
| `components/result/PlanTabs.tsx` | Cheapest / Fewest stops |
| `components/result/CapSlider.tsx` | max-stops slider |
| `components/result/InfoDot.tsx` | the ⓘ button and its tooltip |

**One implementation note that is easy to get wrong:** the cap slider must be a
*persistent DOM node*. Re-rendering it on every `input` event destroys the element
mid-drag and the drag dies on the first pixel. Keep the node and re-parent it, or lift
it out of the re-rendered subtree. This bug was hit and fixed in the prototype.
