# Tomorrow's to-do

Parked 17 Apr 2026 evening. Pick this up in the next session.

## The gap

The remaining 8am cloud gap is mostly deployment and verification, not app code. Today's setup:

- **20:00 sync** runs via launchd on Lynette's Mac (`com.lynette.budget-sync`). Good when her Mac is awake, silent when it's off.
- **8am email cron script** exists in `cron/morning.mjs` and already calls `runSync()` before checking pending reviews.
- If the Render cron job or env vars are missing, the cloud notification can still lag behind reality.

## Plan

### 1. Port the sync to Node so it runs on Render

Everything the Python `budget-sync` does, ported to `cron/sync.mjs` in the `budget-app` repo:

| Python | Node equivalent |
|---|---|
| `gmail_client.py` (OAuth + fetch) | `google-auth-library` + `googleapis` SDK |
| `parsers/fnb.py` (subject regex) | regex literal — same patterns |
| `parsers/discovery.py` (body regex + text/html walk) | same — `JSDOM` or manual MIME walk |
| `dedup.py` (hash on date+time+amount+account) | straight port |
| `categorise.py` (YAML rules) | query `category_rules` table + regex match |
| `supabase_client.py` (insert) | PostgREST via fetch |

V1 can skip retry detection + FX conversion (low volume; the UI already handles declined rows).

**Credentials to pass as Render env vars** (already in `~/.config/budget-sync/token.json` + `~/budget-sync/credentials.json`):
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`

The refresh token doesn't expire (used infrequently enough). google-auth-library handles the refresh→access exchange automatically.

### 2. Morning cron chains sync → email

`cron/morning.mjs` (already written) becomes:

```js
import { runSync } from "./sync.mjs";
await runSync();             // new — pulls Gmail since last sync, writes to Supabase
await checkPendingAndEmail(); // existing
```

### 3. Create the Render Cron Job

Via the Render dashboard or API using your own account credentials:

```json
{
  "type": "cron_job",
  "name": "budget-morning-review",
  "repo": "https://github.com/meetfrank-ai/budget-app",
  "branch": "main",
  "autoDeploy": "yes",
  "ownerId": "tea-d70laonfte5s73fnnsig",
  "serviceDetails": {
    "env": "node",
    "schedule": "0 6 * * *",
    "buildCommand": "pnpm install",
    "startCommand": "node cron/morning.mjs",
    "region": "frankfurt"
  }
}
```

Env vars:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_USER_ID`
- `RESEND_API_KEY`
- `REVIEW_TO_EMAIL`
- `REVIEW_APP_URL`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`

### 4. Smoke test

Manually trigger the cron via Render API once, verify:
- Render log shows "fetched N emails, inserted M transactions"
- Email lands in inbox within ~1 min
- Tapping the link opens `/` showing the pending review

### 5. Retire the launchd 20:00 sync (optional)

Once cloud sync is reliable for 3 days, remove `com.lynette.budget-sync` launchd job. Sheet-writing also stops (Supabase is source of truth). No data lost — Supabase has everything.

## Also parked

- **UI refinement:** move the Affected-categories preview from the Review page onto the Overview screen; drop `/overview` from nav (review + overview are two screens of one flow, not two tabs). Noted from earlier instruction, superseded by tonight's pivot to 8am plumbing. Pick up after cloud sync is green.
- **Adhoc tag** (`docs/future-features.md` item 1b) — now scoped, just needs building.

## Roast / overview improvements (next pass)

1. **Make the daily roast punchier and more focused on changed categories.**
   - Right now the roast covers monthly position broadly. Lynette wants it to lead with what changed yesterday — which categories moved, which crossed thresholds.
   - Edit the `lib/roast.ts` system prompt: "Lead with the categories that moved most yesterday. Mention monthly pace only if it's notably off. Aim for 2-3 sentences, not 4-5."
   - Pre-compute the per-category delta for the day before sending to Claude — pass it as structured input rather than letting Claude reason from totals.

2. **AI overview on the Budget tab.**
   - Generate a separate, longer-form roast for the whole budget — runs once per day, cached on a new `monthly_reviews` row keyed by (user_id, year, month).
   - Surface it at the top of `/budget` when she opens it.
   - Tone: same dry voice, more strategic. Comments on which categories are tracking well, which are silently bleeding, whether the plan still fits the pattern.
   - Trigger: on the morning cron after the daily roast generates, OR lazily on first /budget visit each day.

## Setup hardening (next pass)

1. **Add a real ESLint setup.**
   - Replace the temporary `pnpm lint -> pnpm typecheck` alias with an explicit ESLint config that works cleanly with Next 15.
   - Add `eslint`, `eslint-config-next`, and a committed config file so linting is non-interactive in local dev and CI.

2. **Make review-date calculations timezone-safe.**
   - Replace `toISOString().slice(0, 10)` for "today" and "yesterday" with one shared local-date helper.
   - Use the same helper across the app pages, review helpers, and cron code so the day boundary is stable in SAST and on Render.

3. **Add one build-level verification check.**
   - Run `next build` in CI or a deploy check so route metadata, server actions, and app-router behavior are validated before push/deploy.
   - Keep `typecheck` as the quick local signal, but add one higher-fidelity guardrail.

## What's already done tonight

- Mobile polish: sticky Lock-in above tab bar, safe-area-inset for iPhone home indicator, viewport-fit=cover, full-width lock button, PWA manifest.
- Resend API key in hand (saved in env vars below — don't commit plaintext).
- Render web service live at https://budget-app-5arn.onrender.com.
- `cron/morning.mjs` written and already wired to call `runSync()` before checking pending reviews.

## What NOT to do tomorrow

- Don't fold Budget-app into the Sharez Render service or repo. Separate infrastructure, always.
- Don't commit `GOOGLE_REFRESH_TOKEN` or `RESEND_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` to git. Env vars only.
