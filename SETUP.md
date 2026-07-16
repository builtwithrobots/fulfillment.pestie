# Setup & Deployment

This app is **Next.js (App Router) + TypeScript + Tailwind v4 + Catalyst UI**, with
**Clerk** for authentication and **Supabase** for the database + realtime, deployed to
**Vercel** at `fulfillment.pestie.com`.

## Architecture at a glance

```
Next.js (App Router, RSC)
├─ src/app/(dashboard)/     authenticated ops UI (Clerk-gated), Catalyst sidebar shell
│   ├─ page.tsx             executive overview
│   ├─ studies/             Time Study Tool (setup → live timing → results), PWA-ready
│   ├─ shifts, labor, lines, displays, settings
├─ src/app/display/[token]/ PUBLIC read-only station screens (signed token, no Clerk)
├─ src/app/api/pairing/
│   ├─ code/  (Clerk-gated)  admin mints a short-lived pairing code
│   └─ pair/  (public)       a screen redeems the code for a display token
├─ src/lib/supabase/        server + browser clients (Clerk token → Supabase RLS)
├─ src/lib/pairing/         signed station-display token helpers (jose/HS256)
├─ src/middleware.ts        Clerk middleware; display + pair routes are public
└─ supabase/migrations/     schema + RLS keyed to the Clerk user id (auth.jwt()->>'sub')
```

**Auth model:** Clerk owns login and user identity. Clerk is registered in Supabase as a
third-party auth provider, so Postgres RLS reads the Clerk user id from `auth.jwt()->>'sub'`.
Station displays are *not* Clerk users — they use their own signed, station-scoped token.

## Local development

```bash
cp .env.example .env.local   # fill in the values below
npm install
npm run dev                  # http://localhost:3000
```

### 1. Clerk
1. Create an application at https://dashboard.clerk.com.
2. Copy the **Publishable key** and **Secret key** into `.env.local`.
3. Under **Configure → Integrations**, enable the **Supabase** integration (this makes
   Clerk mint tokens Supabase can verify — no JWT template needed).

### 2. Supabase
1. Create a project at https://supabase.com.
2. Copy the **Project URL**, **anon key**, and **service_role key** into `.env.local`.
3. Under **Authentication → Sign In / Providers → Third-Party Auth**, add **Clerk** and
   paste your Clerk domain. RLS will now accept Clerk-issued JWTs.
4. Apply the schema:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push          # runs supabase/migrations/0001_init.sql
   ```
5. Regenerate types (replaces the placeholder in `src/lib/supabase/types.ts`):
   ```bash
   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/types.ts
   ```

### 3. Station-display secret
```bash
openssl rand -base64 48   # → TOKEN_SIGNING_SECRET
```

## Deploying to Vercel

1. **Import the repo** — Vercel dashboard → *Add New… → Project* → pick
   `builtwithrobots/fulfillment.pestie`. Next.js is auto-detected; no build settings needed
   (`next build`, output handled automatically).
2. **Environment variables** — Project → Settings → Environment Variables. Add every key
   from `.env.example`, scoped to Production **and** Preview. Keep `SUPABASE_SERVICE_ROLE_KEY`
   and `TOKEN_SIGNING_SECRET` server-side (they are not `NEXT_PUBLIC_`).
3. **Preview deployments** — every PR gets its own URL automatically; use these to review a
   shift-planning change before it reaches production.
4. **Custom domain** — Project → Settings → Domains → add `fulfillment.pestie.com`, then add
   the CNAME Vercel shows you to the pestie.com DNS. TLS is provisioned automatically.
5. **Production** — merges to `main` deploy to production.

### Clerk + Supabase production notes
- Add your Vercel production and preview domains to Clerk's **allowed origins**.
- In Supabase, keep the Clerk third-party auth domain in sync if you use separate Clerk
  instances for preview vs production.
