# Budget App

Personal budgeting app built around one daily habit: review yesterday's transactions, categorise anything unclear, and lock the day in.

## What the app does

- `/`: daily review flow and post-lock overview
- `/budget`: monthly budget view by category
- `/transactions`: monthly transaction browser with category filters

The app reads from Supabase and uses a morning cron flow to sync Gmail transaction emails into the database before sending a review reminder.

## Stack

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Supabase
- Anthropic SDK for the daily roast copy

## Local setup

1. Install dependencies:

```bash
pnpm install
```

2. Create local env vars:

```bash
cp .env.example .env.local
```

3. Start the app:

```bash
pnpm dev
```

4. Run the non-interactive project check:

```bash
pnpm typecheck
```

`pnpm lint` currently aliases `pnpm typecheck` so CI and local checks stay non-interactive until ESLint is added explicitly.

## Required env vars

App:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_USER_ID`
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `ANTHROPIC_API_KEY` optional, for the AI roast instead of the fallback copy

Morning sync and review email:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `RESEND_API_KEY`
- `REVIEW_TO_EMAIL`
- `REVIEW_FROM_EMAIL`
- `REVIEW_APP_URL`

## Project structure

```text
app/    Next.js routes and server actions
lib/    Supabase access, formatters, review helpers
cron/   Gmail sync and morning review jobs
public/ PWA assets
```

## Notes

- The app is currently single-user and server-side only. Queries pin to one `SUPABASE_USER_ID`.
- `HANDOFF.md` is a historical build note. Use this README for the current setup and `TODO.md` for active follow-ups.
