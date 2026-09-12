# Strava Scout

Scans `https://www.strava.com/challenges/<id>` twice a day, detects new
challenges by incrementing the id, and posts new ones to a Telegram chat.

## How it works

Strava's challenge page is a client-rendered app. It embeds **JSON-LD
structured data** (`<script type="application/ld+json">`) and standard
`<meta>` tags for SEO, which would normally make a plain `fetch()`
enough — but in testing, Strava's edge serves a bare "upgrade your
browser" fallback shell (no meta tags, no JSON-LD, just nav/footer) to
plain `fetch()` requests coming from a Cloudflare Worker, regardless of
what headers are sent. That points to origin/fingerprint-based bot
detection rather than a header check.

So this renders each page through **Cloudflare's Browser Rendering REST
API** ("Quick Actions") — a plain `fetch()` call *from* the Worker *to*
`api.cloudflare.com`, which runs the page through a real headless
Chromium instance server-side and hands back the rendered HTML. No
`puppeteer`/`playwright` package, no Workers `[browser]` binding — just
an API token. The rendered HTML is then parsed with the same JSON-LD/meta
logic either way.

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

Calls to the render API are spaced `REQUEST_DELAY_MS` apart (default
10.5s) to stay under the Free plan's 1-request/10s limit for this
endpoint; a `429` is also retried automatically using the `Retry-After`
value Cloudflare sends back.

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

## ⚠️ Two things to verify before relying on it

I don't have visibility into Strava's actual JSON-LD schema, rendered
page text, or whether Strava specifically blocks Cloudflare's Browser
Rendering product signature (Cloudflare's own docs note that Browser
Rendering traffic is always identifiable as a bot to the destination,
though not every site chooses to act on that). Two things to check via
`/debug/6386?token=...` once deployed:

1. **Does it get past the block at all?** If you still see
   `"blocked-or-js-required"` in the response, Strava is filtering out
   Browser Rendering traffic specifically, not just non-browser-shaped
   requests — that's a harder wall (rate-limiting or a different fetch
   path won't fix it; we'd need to talk through other options).
2. **Are the fields parsing correctly?** If a field comes back
   `"Not published"` or the run logs `parse-failed`, open the `rawText`
   the debug endpoint returns and adjust the relevant function
   (`parseChallenge`, `dateIntervalFromText`, or `activityListFromText`)
   to match what's actually on the page. Also worth checking against a
   **known-missing id** (e.g. a very high number that shouldn't exist
   yet) — the "missing" detection here relies purely on page text
   (`NOT_FOUND_HINTS`), since this API doesn't surface the raw HTTP
   status of the underlying navigation, so confirm the wording matches.

## Setup

### 1. Prerequisites

- A Cloudflare account (Workers Free plan works — this uses the Browser
  Rendering REST API's "Quick Actions" quota, separate from the browser
  hours/session limits, rate-limited to 1 request/10s on Free).
- Node.js installed locally.
- A Telegram bot: message [@BotFather](https://t.me/BotFather), run
  `/newbot`, and save the token it gives you.
- A chat/channel to post to: add the bot to it, then get the chat id —
  easiest way is to send a message in the chat and visit
  `https://api.telegram.org/bot<TOKEN>/getUpdates` to read the `chat.id`
  field (for a channel, add the bot as admin and use the `-100...` id).
- A Cloudflare **API token** scoped to Browser Rendering: dashboard →
  **My Profile** → **API Tokens** → **Create Token** → **Custom Token** →
  add permission **Account → Browser Rendering → Edit**. Save the token
  value.
- Your **Account ID**: visible in the right sidebar of almost any page
  in the Cloudflare dashboard (e.g. the Workers & Pages overview).

### 2. Install dependencies

```bash
npm install
```

(There's nothing to install beyond `wrangler` itself now — no
`@cloudflare/puppeteer`.)

### 3. Create the KV namespace

```bash
npx wrangler kv namespace create STRAVA_SCOUT_STATE_KV
```

Copy the `id` it prints into `wrangler.toml`, replacing
`REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.

> **Already deployed before?** Your existing namespace and its data
> (frontier id, retry queue) are untouched by any of these changes —
> just reuse the same namespace id you already have.

### 4. Set secrets

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put ADMIN_TOKEN     # any random string, protects /run and /debug
npx wrangler secret put CF_ACCOUNT_ID   # your Cloudflare account id
npx wrangler secret put CF_API_TOKEN    # the Browser Rendering - Edit token
```

### 5. Adjust `wrangler.toml` if you want

- `START_ID` — first id to start scanning from.
- `crons` — currently `30 2,14 * * *` (08:00 and 20:00 IST /
  02:30 and 14:30 UTC). Edit the hour list to change times.
- `CONSECUTIVE_MISSING_LIMIT` — how many misses in a row stop a run
  (default 4, matching your spec).
- `MAX_FORWARD_CHECKS` / `MAX_RETRY_CHECKS` — per-run caps.
- `REQUEST_DELAY_MS` — spacing between render API calls (default
  10500ms to respect the Free plan's 1-request/10s limit).

### 6. Deploy

```bash
npx wrangler deploy
```

### 7. Calibrate extraction (do this once)

```bash
curl "https://<your-worker>.workers.dev/debug/6386?token=<ADMIN_TOKEN>"
```

This renders + parses challenge id 6386 (the example you gave) and
returns the extracted `title`, `description`, `dateInterval`,
`activities`, plus `rawText` (the rendered page's stripped text, first
4000 chars). Compare against what you see on strava.com/challenges/6386.

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

- **A run now takes longer wall-clock time** than a plain-fetch version
  would, because of the 10.5s spacing between render calls (e.g. 15
  forward checks ≈ 2.5 minutes). This doesn't cost CPU time on the
  Workers Free plan — Workers suspend (and aren't billed) while awaiting
  a `fetch()` response — so it's not a budget concern, just note it if
  you're watching `/run` in a browser/terminal and it seems slow.
- If you see `429`s from the render API that don't clear even after the
  built-in retry, check `/state` and space `REQUEST_DELAY_MS` out
  further.
- If Strava changes its markup enough that parsing breaks, `/debug/<id>`
  is the fastest way to see what changed and fix the corresponding
  function.
- The retry queue keeps retrying an id up to `MAX_RETRY_ATTEMPTS` times
  before giving up on it entirely (default 10, i.e. ~5 days at 2
  runs/day) — raise this if you want ids checked for longer before being
  dropped.
