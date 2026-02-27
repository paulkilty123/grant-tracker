# 🌱 Grant Tracker

A funding search and pipeline tracker for small charities, community organisations and social enterprises.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Grants data | 360Giving API + curated seed list |

---

## Getting started in 5 steps

### 1. Clone and install

```bash
git clone <your-repo-url> grant-tracker
cd grant-tracker
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **New Project** — choose a name, region (UK if possible), and a strong database password
3. Wait ~2 minutes for it to spin up

### 3. Run the database migration

1. In your Supabase dashboard, go to **SQL Editor → New query**
2. Copy the entire contents of `supabase/migrations/001_initial_schema.sql`
3. Paste and click **Run**

This creates all tables, indexes, and security policies.

### 4. Add your environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in your values from **Supabase Dashboard → Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to the login page.

---

## Project structure

```
src/
├── app/
│   ├── auth/
│   │   ├── login/          # Login page
│   │   ├── signup/         # Signup page
│   │   └── callback/       # Email confirmation handler
│   └── dashboard/
│       ├── layout.tsx      # Sidebar + auth wrapper
│       ├── page.tsx        # Dashboard overview
│       ├── pipeline/       # Kanban pipeline (drag & drop)
│       ├── search/         # Grant search
│       ├── local/          # Local & regional grants
│       ├── deadlines/      # Deadline calendar
│       └── profile/        # Organisation profile
├── components/
│   └── layout/
│       └── Sidebar.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts       # Browser Supabase client
│   │   └── server.ts       # Server Supabase client
│   ├── pipeline.ts         # Pipeline CRUD
│   ├── organisations.ts    # Org CRUD
│   ├── grants.ts           # 360Giving API + seed grants
│   └── utils.ts            # Helpers, formatting, constants
├── types/
│   └── index.ts            # All TypeScript types
└── middleware.ts            # Auth route protection
```

---

## Key features built

- ✅ Full auth (signup, login, email confirmation, protected routes)
- ✅ Organisation profile with funding preferences
- ✅ Pipeline with drag-and-drop between 6 stages
- ✅ Per-card notes, progress tracking, deadlines
- ✅ Row-level security (each org only sees their own data)
- ✅ 360Giving API integration scaffold
- ✅ Match scoring engine (0–100 based on org profile)
- ✅ Curated seed grants database

## What to build next

### Priority 1 — Complete the UI pages
The following pages need building out (structure is in place):
- `src/app/dashboard/search/page.tsx` — grant search with filters
- `src/app/dashboard/local/page.tsx` — local/regional grants
- `src/app/dashboard/deadlines/page.tsx` — deadline calendar
- `src/app/dashboard/profile/page.tsx` — organisation profile editor

### Priority 2 — Email notifications
Use [Resend](https://resend.com) (free tier: 3,000 emails/month):
```bash
npm install resend
```
Create a Supabase Edge Function or Next.js cron job that checks for upcoming deadlines daily.

### Priority 3 — Richer grants data
- Integrate live 360Giving API (already scaffolded in `src/lib/grants.ts`)
- Add a scraper for local council grant pages
- Consider [GrantFinder](https://www.grantfinder.co.uk) API for commercial data

### Priority 4 — Team access
Add an `org_members` table linking multiple users to one organisation with roles (admin/editor/viewer).

### Priority 5 — Deploy
```bash
# Deploy to Vercel (free)
npm install -g vercel
vercel
```
Add your environment variables in the Vercel dashboard.

---

## Useful commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run db:types     # Regenerate TypeScript types from Supabase schema
```
