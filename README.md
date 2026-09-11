# Strava Scout

Scans `https://www.strava.com/challenges/<id>` twice a day, detects new
challenges by incrementing the id, and posts new ones to a Telegram chat.

## How it works

Strava's challenge page is a client-rendered app, but it still embeds
**JSON-LD structured data** (`<script type="application/ld+json">`) and
standard `<meta>` tags in the server-rendered HTML for SEO — so a plain
`fetch()` is enough; no headless browser needed. (An earlier version of
this project used Cloudflare Browser Rendering, but that hit a `429 Rate
limit exceeded` launching browsers, and it's unnecessary overhead for
this anyway — plain fetch is simpler, faster, and has no such limit.)

Each run:
1. **Retries** ids that previously came back "missing" or errored (up to
   `MAX_RETRY_CHECKS` of them, each retried up to `MAX_RETRY_ATTEMPTS`
   times before being given up on).
2. **Scans forward** from the last known id (`frontier`), checking each
   one. It stops the forward scan once it hits `CONSECUTIVE_MISSING_LIMIT`
   (default 4) not-found ids in a row — those ids go into the retry queue
   to be checked again on a later run, exactly as you described.
3. Any newly-found challenge gets posted to Telegram and the state is
   saved to KV so the next run (in 12 hours, or whenever you trigger it)
   picks up where this one left off.

Nothing is ever notified twice — once an id is found, it's dropped from
the queue and the frontier moves past it.

Parsing order for each field, in `parseChallenge()`:
- **Title / description**: JSON-LD `name`/`headline`/`description` →
  `<meta>` tags → `<title>`.
- **Date interval**: JSON-LD `startDate`/`endDate` → a same-line date
  range found in the page text (e.g. "Sep 1 - Sep 30, 2026") → a
  "Dates:" labeled line → the first two standalone dates found anywhere.
- **Qualifying activities**: JSON-LD `activityType`/`sport`/`about`
  fields → a keyword scan of the text right after a "Qualifying
  Activities" label on the page.

## ⚠️ One thing to verify before relying on it

I don't have visibility into Strava's actual JSON-LD schema or exact page
text (I can only fetch a cleaned/simplified version of the page from
here). The fallbacks above are pattern-based and should be resilient to
most markup tweaks, but use the built-in debug endpoint (see below) once
after deploying — if a field comes back `"Not published"` or the run
logs a `parse-failed` error, open the `rawText` it returns and adjust the
relevant function (`parseChallenge`, `dateIntervalFromText`, or
`activityListFromText`) to match what's actually on the page.

## Setup

### 1. Prerequisites

- A Cloudflare account (Workers **Free** plan is enough — this no longer
  uses Browser Rendering, just plain HTTP requests, so there's no
  meaningful usage limit for twice-daily scans of a handful of ids).
- Node.js installed locally.
- A Telegram bot: message [@BotFather](https://t.me/BotFather), run
  `/newbot`, and save the token it gives you.
- A chat/channel to post to: add the bot to it, then get the chat id —
  easiest way is to send a message in the chat and visit
  `https://api.telegram.org/bot<TOKEN>/getUpdates` to read the `chat.id`
  field (for a channel, add the bot as admin and use the `-100...` id).

### 2. Install dependencies

```bash
npm install
```

### 3. Create the KV namespace

```bash
npx wrangler kv namespace create STATE_KV
```

Copy the `id` it prints into `wrangler.toml`, replacing
`REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.

### 4. Set secrets

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put ADMIN_TOKEN   # any random string, protects /run and /debug
```

### 5. Adjust `wrangler.toml` if you want

- `START_ID` — first id to start scanning from.
- `crons` — currently `30 2,14 * * *` (08:00 and 20:00 IST /
  02:30 and 14:30 UTC). Edit the hour list to change times.
- `CONSECUTIVE_MISSING_LIMIT` — how many misses in a row stop a run
  (default 4, matching your spec).
- `MAX_FORWARD_CHECKS` / `MAX_RETRY_CHECKS` — per-run safety caps so a
  single cron run can't run indefinitely.

### 6. Deploy

```bash
npx wrangler deploy
```

### 7. Calibrate extraction (do this once)

```bash
curl "https://<your-worker>.workers.dev/debug/6386?token=<ADMIN_TOKEN>"
```

This fetches + parses challenge id 6386 (the example you gave) and
returns the extracted `title`, `description`, `dateInterval`,
`activities`, plus `rawText` (the page's stripped text, first 4000
chars). Compare against what you see on strava.com/challenges/6386 — if
anything's `"Not published"`, `rawText` tells you exactly what to match.

### 8. Trigger a manual run any time

```bash
curl "https://<your-worker>.workers.dev/run?token=<ADMIN_TOKEN>"
```

### 9. Check current scan state

```bash
curl "https://<your-worker>.workers.dev/state?token=<ADMIN_TOKEN>"
```

Shows the current `frontier` (next id to check) and `retryQueue` (ids
being revisited later).

## Notes / things you may want to tune

- **Strava may rate-limit or block scripted requests** if scanned very
  aggressively. Twice a day over a handful of ids should be well under
  any reasonable threshold. If you see a wave of `error` results with an
  HTTP 403/429 reason in `/state`, space runs further apart.
- If Strava changes its markup enough that parsing breaks, `/debug/<id>`
  is the fastest way to see what changed and fix the corresponding
  function.
- The retry queue keeps retrying an id up to `MAX_RETRY_ATTEMPTS` times
  before giving up on it entirely (default 10, i.e. ~5 days at 2
  runs/day) — raise this if you want ids checked for longer before being
  dropped.
