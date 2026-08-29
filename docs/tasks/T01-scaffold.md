# T01 — Next.js scaffold and design tokens

**Depends on:** nothing · **Unblocks:** everything · **Network:** npm only

## Goal
A running Next.js app with the design system in place and nothing else. No business
logic, no API calls, no components beyond a shell.

## Inputs
- `docs/DESIGN.md` — tokens, fonts, theme rules.

## Outputs
| File | Contains |
|---|---|
| `package.json` | Next 15+, React 19, TypeScript 5, vitest, eslint. Scripts: `dev`, `build`, `start`, `test`, `test:watch`, `lint`, `typecheck` |
| `tsconfig.json` | `strict: true`, path alias `@/*` → repo root |
| `next.config.mjs` | minimal |
| `app/layout.tsx` | html/body, Google Fonts link (Fraunces, Archivo), `<title>Brandstof</title>` |
| `app/globals.css` | the full token block from DESIGN.md, both themes, plus a reset |
| `app/page.tsx` | placeholder that renders the masthead and one empty rail node |
| `.env.example` | the variables listed in DATA-SOURCES.md, no values |
| `.gitignore` | `node_modules`, `.next`, `.env*.local`, coverage |

## Acceptance criteria
- [ ] `npm run build` completes with no errors and no TypeScript errors.
- [ ] `npm run typecheck` and `npm run lint` pass clean.
- [ ] All three theme states render correctly: light, `prefers-color-scheme: dark`,
      and an explicit `data-theme="light"` on a dark OS. Check by toggling the
      attribute on `<html>` in devtools.
- [ ] `body` sets an explicit background from a token (not transparent).
- [ ] No colour is defined *only* inside a media query or `[data-theme]` block.
- [ ] Fonts load; the fallback stack is real, not just the family name.

## Out of scope
Any component in `components/`, anything in `lib/`, any API route.
