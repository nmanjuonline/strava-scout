# Strava Scout

Scans `https://www.strava.com/challenges/<id>` twice a day, detects new
challenges by incrementing the id, and posts new ones to a Telegram chat.

## How it works

Strava's challenge page is a JS-rendered (React) app — a plain `fetch()`
only returns the `<meta>` tags (title, short blurb, start date), not the
full date range or the "Qualifying Activities" list. So this Worker uses
**Cloudflare Browser Rendering** to actually load and render each page,
then reads the visible text off it.

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

## ⚠️ One thing to verify before relying on it

I don't have visibility into Strava's actual rendered DOM/class names (I
can only fetch the static, pre-JS HTML from here, which doesn't include
the challenge widgets). The extraction in `src/index.js`
(`extractDescription`, `extractDateInterval`, `extractActivities`) works
off the **visible text** of the rendered page using label/pattern
matching, which is more resilient to markup changes than CSS selectors,
but you should sanity-check it once against a real page before trusting
it fully. Use the built-in debug endpoint (see below) — if a field comes
back `(not found — check /debug)`, open the `rawText` field it returns
and adjust the relevant `extract*` function's regex/keywords to match
what's actually on the page.

## Setup

### 1. Prerequisites

- A Cloudflare account (Workers **Free** plan is enough — Browser
  Rendering gives you 10 browser-minutes/day free, plenty for twice-daily
  scans of a handful of ids).
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

This renders challenge id 6386 (the example you gave) and returns the
extracted `title`, `description`, `dateInterval`, `activities`, plus the
full `rawText` of the rendered page. Compare the extracted fields against
what you see on strava.com/challenges/6386 — if anything's off, the
`rawText` tells you exactly what to match in `extract*()`.

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

- **Strava may rate-limit or block a headless browser** if you scan very
  aggressively. Twice a day over a handful of ids should be well under
  any reasonable threshold, but if `/debug` starts returning odd results,
  try adding a random delay between page loads or spacing runs further
  apart.
- If Strava ever changes its markup enough that visible-text parsing
  breaks, `/debug/<id>` is your fastest way to see what changed and fix
  the corresponding `extract*` function.
- The retry queue keeps retrying an id up to `MAX_RETRY_ATTEMPTS` times
  before giving up on it entirely (default 10, i.e. ~5 days at 2
  runs/day) — raise this if you want ids checked for longer before being
  dropped.
