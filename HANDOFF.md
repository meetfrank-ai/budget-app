# Handoff — budget app local build

Written overnight 17 Apr 2026. Here's what happened and what to click.

## Status: working app running on your Mac

The Next.js dev server is **still running in the background**. Open http://localhost:3000 in your browser right now to see it. (If the terminal got closed, restart from `/Users/lynettedup/budget-app` with `pnpm dev`.)

## What's there

Five pages, all reading from your Supabase:

| Page | What it shows |
|---|---|
| **Today** (`/`) | Spent-today / yesterday / uncategorised count / month remaining. Canary callouts (categories ≥150%, Shopping at ≥80%). Latest 8 transactions. |
| **Budget** (`/budget`) | Month view. Every category: planned vs actual vs remaining with a burn bar. Month nav (prev/next). |
| **Transactions** (`/transactions`) | Month's transactions with category chips to filter. Refunds shown in green, declines struck through, transfers in grey. |
| **Subscriptions** (`/subscriptions`) | Summary cards (monthly-equiv, annualised, vs R24k/year cap). Table sorted by annualised cost. Source tag shows `seed` / `detected`. |
| **Review** (`/uncategorised`) | Queue of transactions waiting for a category. Pick one, tick "Always for this merchant", save — that row updates AND a new rule is created AND any other uncategorised rows matching the merchant get the same category. |

## What I did to your Supabase

- Added `Refund` as a valid `tx_type` (but no parser yet — see below)
- Added `linked_to_id`, `is_subscription` columns on transactions
- Created `subscriptions` table
- Added 3 missing categories: **Rent**, **Travel fund**, **Bank Fees**
- Seeded 252 budget rows (21 categories × 12 months of 2026) from `docs/budget-plan.md`
- Created views: `v_month_budget`, `v_subscriptions_summary`, `v_category_overage`, `v_today`
- Ran subscription detection — 13 found

## EOD sync — already scheduled

launchd job `com.lynette.budget-sync` runs every day at **23:00 local** and writes new transactions to both Sheet and Supabase (+ refreshes subscriptions). Logs at `~/budget-sync/data/launchd.log`.

To run it manually right now: `launchctl start com.lynette.budget-sync`.
To uninstall: `launchctl unload ~/Library/LaunchAgents/com.lynette.budget-sync.plist && rm ~/Library/LaunchAgents/com.lynette.budget-sync.plist`.

## Things I made judgement calls on — tell me if wrong

1. **Single-user, no login.** App connects via service role + env-pinned user_id. No magic link. Add auth later when you want to share.
2. **Weekly cafe visits show up as "subscriptions"** (Rosetta, SuperSpar, Loading Bay). They pass the "regular charge" heuristic even though they're habits. The UI tags them `detected` vs `seed` so you can tell them apart. Use the `status` column to mark them `cancelled` if they annoy you.
3. **Category rule auto-creation.** When you pick a category in the Review page with "Always for this merchant" ticked (default), I build the regex from the first 3 words of the description (lowercased, yoco-prefix stripped). Good enough for 80% of cases — occasionally you'll get an over-broad pattern. Rules screen is on the TODO.
4. **Deferred refund parsing.** Found FNB reversals in your inbox (`FNB:-) REVERSAL of R{amount} for goods purchased from...`) but no Discovery ones. Also found manual refunds (`R1800.00 paid to Aspire @ Online Banking. Ref.Lapis Refund`) — those look like regular EFT Out and need a keyword strategy. I'd rather ship these in a focused session with you looking over my shoulder.

## Known rough edges

- **Subscriptions duplicates**: Audible appears twice — once per card it's on. Unique constraint is `(merchant_key, account_id)` so this is "working as designed" but looks weird. May want to collapse in UI.
- **No "Salary / Earnings" in budget tab**: income isn't modelled as a category, just a constant (R50,000) in code. If you want incoming money to show up as transactions, we'll need a different approach.
- **Rent is budgeted but you never had "Rent" transactions** in April — the xlsx doesn't have them. When real rent emails start flowing we'll need a rule that catches "rent" / your landlord's reference.
- **The Sheet still gets written on every sync**. Safety net for now. Retire after ~1 month.

## Files added this session

```
budget-sync/
  docs/
    features-v2.md            ← your brief, committed
    budget-plan.md            ← your brief, committed
    app-plan.md               ← decisions + plan I wrote before executing
  supabase/migrations/
    0002_app_features.sql     ← the schema diff applied to your DB
  config/
    subscriptions.yaml        ← seed list of known subscription merchants
  src/budget_sync/
    subscriptions.py          ← detection + persistence
    supabase_client.py        ← already existed, unchanged tonight
  scripts/
    seed_budgets.py
    detect_subscriptions.py
    com.lynette.budget-sync.plist
    install_launchd.sh

budget-app/                   ← NEW (this whole dir)
  app/                        ← 5 pages
  lib/                        ← supabase client, queries, formatters
  .env.local                  ← credentials, gitignored
  HANDOFF.md                  ← this file
```

## When you wake up

1. Open http://localhost:3000 in your browser. Click through the 5 pages.
2. Try the Review page with "Always for this merchant" — pick a real uncategorised transaction, watch the rule apply.
3. Compare the Budget page's numbers against your Sheet. They should match for completed spending, not yet include refunds (no refund parser).
4. Read `~/budget-sync/docs/app-plan.md` to see the scope I set and the scope I skipped.
5. Flag anything that looks wrong or not-what-you-wanted. That's normal — I made design calls in the dark.

## Next session candidates

- **Refund parser** (FNB reversals + manual refund keyword detection)
- **Rules screen** — see + reorder + disable `category_rules`
- **Charts** — monthly spend line, category donut
- **Magic link auth** — so you can share with friends
- **Render deploy** — Supabase anon flow + Render Cron instead of launchd
- **Telegram bot** for inline categorisation from notifications
