# Pestie Fulfillment Ops

> Internal labor management, station productivity, and shift planning system for the Pestie fulfillment warehouse. Built to run at `fulfillment.pestie.com`.

---

## What this is

A real-time fulfillment operations dashboard built for the Pestie warehouse team. Supervisors use it to plan shifts, allocate headcount, monitor line productivity, and pair big-screen station displays — all from a single interface.

It is not a customer-facing product. It is an internal ops tool designed to replace manual whiteboards, spreadsheets, and verbal headcount calls.

---

## Who uses it

| Role | What they do in the system |
|---|---|
| **Director / Admin** | Configure lines, stations, rates, employee roster, pesticide types |
| **Supervisor** | Plan the daily shift, input volume goals, assign headcount, manage callouts |
| **Floor Lead** | Monitor line status, trigger rebalancing, update actuals throughout the shift |
| **Executive** | View rolled-up KPIs, output trends, and shift-level alerts |
| **Station Display** | Read-only, token-authenticated big-screen view at each station |

---

## Core features

### Shift planning
- Input daily FAK and RAK volume targets (future: pulled via order system API)
- System recommends headcount per line based on standard rates and min/max constraints
- Pesticide run sequencer: FAK first, one type at a time (S1 → C1 → T2 → B2 → B1 → P1 → E1), then RAK
- Capacity forecast shows projected output vs. goal before the shift starts

### Labor allocation
- Assign employees to lines and stations
- Track callouts and attendance against scheduled headcount
- Float pool for rebalancing mid-shift
- Load balancing alerts when a station is understaffed or over min/max

### Line and station views
- Line View shows full station flow end-to-end with bottleneck highlighting
- Line 3 (UYAK Kitting) and Line 4 (UYAK Box) shown as linked flow
- Line 1.5 (overflow) has an activate/deactivate toggle — inactive lines are excluded from headcount recommendations

### Station display pairing
- Netflix-style pairing: generate a QR code + short text code per station
- Tokens are signed, station-scoped, and time-limited (10 min to pair, permanent once connected)
- Admin assigns a display template per screen: Full, Names Only, Productivity, Scoreboard, or Alert Mode
- View changes push to the screen instantly without re-pairing
- Full activity log of pairing events, view changes, and expired codes

### Executive summary
- Total headcount deployed vs. scheduled
- Overall efficiency % vs. target
- Kits completed and end-of-day projection
- 7-day output trend
- Priority alerts surfaced for leadership

---

## Line structure

| Line | Name | Type | Notes |
|---|---|---|---|
| Custom | Special Orders | Custom one-off | Headcount varies per job |
| Line 1 | RAK/FAK Kitting, Assembly & Shipping | Production | Primary FAK/RAK line |
| Line 1.5 | RAK/FAK Overflow | Production | Mirror of Line 1, activated on demand |
| Line 2 | RAK/FAK Automated Box Folding | Production | Automated folder, fewer HC needed |
| Line 3 | UYAK Kitting | Production | Feeds Line 4 |
| Line 4 | UYAK Box Assembly | Production | Downstream of Line 3 |
| Line 5 | Material Handling | Support | Supports all lines, scales with demand |

### Kit types

| Code | Name | Priority |
|---|---|---|
| FAK | First Application Kit | 1 — always runs first |
| RAK | Repeat Application Kit | 2 — runs after FAK |
| UYAK | Upfront Yearly Application Kit | Lines 3 and 4 |

### Pesticide types (run sequence)

`S1` `C1` `T2` `B2` `B1` `P1` `E1`

Sequence is configurable per shift. Additional types can be added in Setup. Current default: FAK types first in sequence, then RAK types in the same order.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Styling | Tailwind CSS + Tailwind UI Kit (`/templates/`) |
| Database | Supabase (Postgres + Realtime) |
| Auth | Clerk (role-based: admin, supervisor, floor-lead, executive, display) |
| Deployment | Vercel → `fulfillment.pestie.com` |
| Dev tooling | Claude Code (GitHub + Vercel auto-deploy) |

---

## Project structure

```
/
├── app/
│   ├── (dashboard)/          # Authenticated app shell
│   │   ├── setup/            # Line, station, employee, pesticide config
│   │   ├── planning/         # Shift planning and volume input
│   │   ├── floor/            # Live floor view and allocation
│   │   ├── lines/            # Line view with station flow
│   │   ├── displays/         # Station display pairing and management
│   │   └── executive/        # Rolled-up KPIs for leadership
│   ├── display/
│   │   └── [token]/          # Public token-authenticated station display page
│   └── pair/                 # Pairing landing page (shown on unpaired screens)
├── components/               # Shared UI components
├── lib/
│   ├── supabase/             # DB client and queries
│   ├── tokens/               # Display token generation and validation
│   └── planning/             # Headcount recommendation engine
├── templates/                # Tailwind UI Kit (source of global styles)
├── public/
└── README.md
```

---

## Roles and access

Roles are managed in Clerk and enforced at the route and API level.

| Role | Setup | Planning | Floor | Lines | Displays | Executive |
|---|---|---|---|---|---|---|
| `admin` | Read/Write | Read/Write | Read/Write | Read | Read/Write | Read |
| `supervisor` | Read | Read/Write | Read/Write | Read | Read/Write | Read |
| `floor-lead` | Read | Read | Read/Write | Read | Read | — |
| `executive` | — | Read | Read | Read | — | Read |
| `display` | — | — | — | — | — | — |

`display` role is granted by token only. It has no dashboard access and can only render its assigned station view.

---

## Display pairing

Each station display connects via a secure token flow:

1. Supervisor clicks **Generate code** for a station in the Displays dashboard
2. System creates a signed token tied to that station and generates a QR code + short text code (e.g., `KIT-7X2P`)
3. The TV browser navigates to `fulfillment.pestie.com/pair` and scans or types the code
4. Token is validated, station is confirmed, and the screen begins showing live data
5. Admin can change the view template or unpair the screen at any time from the dashboard
6. Revoking a token returns the screen to the unpaired/waiting state immediately

Token expiry: 10 minutes if unused. Permanent session once paired (stored in browser + Supabase).

---

## Setup before first use

Before running a shift, an admin must configure:

- [ ] Employee roster (name, ID, active status)
- [ ] Lines (name, min HC, max HC, standard rate, metric type)
- [ ] Stations per line (name, sequence order)
- [ ] Pesticide types (codes, add/remove as needed)
- [ ] Shift hours (default 8hr day shift)

This data is stored in Supabase and persists across shifts. It rarely changes unless a new line is added or rates are rebalanced.

---

## Applying the Tailwind UI Kit

The Tailwind Plus UI Kit source lives in `/templates/`. Before building any pages, Claude Code should:

1. Unzip and review the kit contents
2. Extract design tokens from `tailwind.config.js` -- colors, typography, spacing, shadows, border radius
3. Apply tokens to the project's `tailwind.config.js` and `globals.css`
4. Note reusable component patterns: stat cards, tables, nav, modals, badges, form layouts
5. Confirm the dark mode strategy (`class` vs. `media`) and apply consistently

Do not build pages until this foundation pass is complete and confirmed.

---

## Future integrations

| Integration | Purpose | Status |
|---|---|---|
| Order system API | Pull daily FAK/RAK/UYAK volume automatically | Planned |
| WMS / scanner feed | Push actual output counts to stations in real time | Planned |
| Multi-line parallel runs | Support mixed pesticide types across lines simultaneously | Planned |
| Historical analytics | Shift-over-shift productivity trends, efficiency benchmarking | Planned |

---

## Prototype reference

The UI concept was prototyped as interactive artifacts in Claude.ai before this build. The artifacts cover all six dashboard views and the full display pairing flow. Reference them for interaction design intent before building any new views.

---

## Contact

**Director of Fulfillment** — primary owner of this system.
Deployed and maintained via Vercel. Repository managed via GitHub with Claude Code.
