# T13 — Maps deep links

**Depends on:** T02 · **Unblocks:** T11 · **Network:** no

## Goal
Build Google and Apple Maps URLs for a plan. Small, pure, entirely testable — and the
last thing the user actually touches, so the edge cases matter.

## Inputs
- `PlanStop`, `Station` from `lib/types.ts`.

## Outputs

`lib/maps/links.ts` — the four functions in CONTRACTS.md.

Formats:
- Google route: `https://www.google.com/maps/dir/?api=1&origin=…&destination=…&waypoints=a|b|c`
  Waypoints are `|`-separated and **capped at 9** by Google.
- Apple route: `http://maps.apple.com/?saddr=…&daddr=a+to:b+to:…`
- Google station: `https://www.google.com/maps/search/?api=1&query=…`
- Apple station: `http://maps.apple.com/?q=…&ll=lat,lon`

Prefer `lat,lon` over an address string for waypoints — it is unambiguous and immune to
geocoding drift. Include the station name in the *search* links, where a human reads it.

```ts
export interface TruncationInfo { truncated: boolean; omittedStops: number }
export function googleMapsRouteUrl(
  from: string, to: string, stops: PlanStop[],
): { url: string; truncation: TruncationInfo };
```
Return the truncation info rather than silently dropping stops — the UI must be able to
say "the last two stops aren't in this link".

`lib/maps/links.test.ts`.

## Acceptance criteria
- [ ] Every component is URL-encoded. Test with `Feuchtwangen, Ansbacher Str. 44` and
      with a name containing `&`, `#`, `+` and a non-ASCII character (`München`, `Gießen`).
      A raw `+` in an Apple URL must not be mistaken for the `to:` separator.
- [ ] Google waypoints cap at 9; `truncation` reports the count omitted.
- [ ] Zero stops produces a valid origin→destination URL with no empty `waypoints=`
      parameter dangling.
- [ ] Apple URLs join with `+to:` correctly for 0, 1 and many stops.
- [ ] All URLs are `https` except Apple's scheme, which is `http://maps.apple.com` by
      Apple's own spec — note this in a comment so nobody "fixes" it.
- [ ] Pure: no fetch, no clock, no key.

## Out of scope
Rendering the buttons (T14). Waze, TomTom, HERE.
