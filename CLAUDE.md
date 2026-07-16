# Pestie Fulfillment Ops

Next.js (App Router) ops app for the Pestie fulfillment warehouse: executive overview,
shift/labor planning, lines & stations, station displays, and a live **Time Study Tool**.
See `SETUP.md` for full setup/deploy; `README.md` for product context.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) · Tailwind v4 ·
Catalyst UI kit (`src/components/*`) · **Clerk** (auth) · **Supabase** (DB + realtime) ·
Motion (`motion/react`) · **lucide-react** (icons) · deployed on Vercel.

## Commands

```bash
npm run dev         # dev server (localhost:3000)
npm run build       # production build -- NEEDS env vars set (see below)
npm run lint        # eslint (Next core-web-vitals + React Compiler rules)
npm run typecheck   # tsc --noEmit
npx supabase db push   # apply supabase/migrations/*.sql to the linked project
```

Run `lint` + `typecheck` before committing. `build` fails locally without Clerk/Supabase
env vars (the root `ClerkProvider` prerenders `/_not-found` and needs a publishable key) --
this is expected; Vercel has the vars. To smoke-test a build locally, pass dummy values:
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Y2xlcmsuZXhhbXBsZS5jb20k CLERK_SECRET_KEY=... NEXT_PUBLIC_SUPABASE_URL=https://dummy.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x npm run build`.

## Architecture

```
src/app/(dashboard)/   authenticated ops UI (Clerk-gated, Catalyst sidebar shell)
  page.tsx             executive overview (mock data)
  studies/             Time Study Tool -- list, new, [id]/setup|timer|results
src/app/display/[token]/  PUBLIC station screens -- gated by signed token, NOT Clerk
src/app/api/pairing/   code (Clerk-gated, mint) + pair (public, redeem) for displays
src/app/manifest.ts    PWA manifest;  public/sw.js  static-only service worker
src/components/         Catalyst UI kit (button, sidebar, table, dialog, switch, …)
src/lib/supabase/       server.ts (service-role + Clerk-token clients), client.ts, types.ts
src/lib/studies/        data.ts (reads), actions.ts (server actions) for time studies
src/lib/time-study.ts   isomorphic fmtMs + results/bottleneck math (no DB, no React)
src/middleware.ts       Clerk middleware; display + pair routes are public
supabase/migrations/    0001 core schema, 0002 time-study tables -- all RLS-enabled
```

## Auth & data model (important -- easy to get wrong)

- **Clerk owns auth.** It is registered in Supabase as a **third-party auth provider**, so
  Postgres RLS reads the Clerk user id from **`auth.jwt()->>'sub'`** (text). Do **not** use
  Supabase Auth, and do **not** use `auth.uid()` in policies.
- **Server writes use the service-role client** (`createServiceRoleClient()`, bypasses RLS).
  Every server action must validate the Clerk session first -- call `requireUserId()`
  (`src/lib/studies/data.ts`) -- and scope every query by `user_id` in code. RLS is
  defense-in-depth, not the primary guard.
- `createServerSupabaseClient()` (Clerk token → RLS) exists for Clerk-scoped reads;
  `useSupabaseBrowserClient()` is the browser/Realtime client.
- **Auth toggle:** `NEXT_PUBLIC_ENABLE_AUTH` (`src/lib/auth-config.ts`). Unset/false ⇒ no
  login required (dev build-out; a warning banner shows). When off, `requireUserId()`
  returns a stable `'dev-user'` id so the app still works.
- `src/lib/supabase/types.ts` is **hand-written** to match the migrations. After schema
  changes, update it (or regenerate: `npx supabase gen types typescript --project-id <ref>`).

## Conventions & gotchas

- **`(dashboard)` layout is `force-dynamic`** -- authed routes must never be prerendered
  (no Clerk request context at build time). Keep it that way.
- **Icons: lucide-react is stroke-based.** Color via `text-*` / `currentColor`, **never
  `fill-*`** (a fill utility overrides lucide's `fill="none"` and floods the glyph solid).
  Catalyst's `SidebarItem`/`NavbarItem` were patched to color icons with `text-*`; give any
  sidebar icon `data-slot="icon"` so it sizes correctly.
- **React Compiler purity lint:** `Date.now()` / `Math.random()` are flagged inside a
  component's render scope. When you need them in an event handler, isolate the call in a
  module-scope helper (see `nowMs` in `studies/[id]/timer/timer-screen.tsx`).
- **No `localStorage`** -- all state goes to the DB. Time-study observations are written
  **immediately, one row per Stop click** (no batching); results read live from the DB so
  refresh/resume is always accurate.
- **Path alias:** `@/*` → `src/*`.
- **Prettier:** no semicolons, single quotes, `printWidth` 120, es5 trailing commas,
  imports auto-organized, Tailwind classes auto-sorted. Match the surrounding style.

## Deploy

Merges to `main` deploy to production on Vercel; every PR gets a preview URL. Migrations are
applied separately via `npx supabase db push` -- they are not part of the Vercel build.
