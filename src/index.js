import puppeteer from "@cloudflare/puppeteer";

const STATE_KEY = "scan-state-v1";

// ---------- State helpers ----------

async function loadState(env) {
  const raw = await env.STATE_KV.get(STATE_KEY, "json");
  if (raw) return raw;
  return {
    frontier: parseInt(env.START_ID, 10) || 1,
    retryQueue: [], // [{ id, type: 'missing' | 'error', attempts, firstSeen }]
    notifiedCount: 0,
  };
}

async function saveState(env, state) {
  await env.STATE_KV.put(STATE_KEY, JSON.stringify(state));
}

// ---------- Telegram ----------

async function notifyTelegram(env, data) {
  const text =
    `New Challenge Detected!\n` +
    `Title: ${data.title}\n` +
    `Description: ${data.description}\n` +
    `Date Interval: ${data.dateInterval}\n` +
    `Qualifying Activities: ${data.activities}\n` +
    `${data.url}`;

  const resp = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: false,
      }),
    }
  );

  if (!resp.ok) {
    const body = await resp.text();
    console.error("Telegram send failed", resp.status, body);
  }
  return resp.ok;
}

async function notifyTelegramText(env, text) {
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
    });
  } catch (e) {
    console.error("Telegram text send failed", e);
  }
}

// ---------- Scraping ----------

const ACTIVITY_KEYWORDS = [
  "Trail Run",
  "Virtual Run",
  "Virtual Ride",
  "E-Bike Ride",
  "Mountain Bike Ride",
  "Gravel Ride",
  "Run",
  "Ride",
  "Walk",
  "Hike",
  "Swim",
  "Rowing",
  "Kayaking",
  "Canoeing",
  "Nordic Ski",
  "Alpine Ski",
  "Snowboard",
  "Snowshoe",
  "Ice Skate",
  "Inline Skate",
  "Wheelchair",
  "Handcycle",
  "Yoga",
  "Workout",
  "Weight Training",
  "Crossfit",
  "Elliptical",
  "Stair Stepper",
  "Golf",
];

const DATE_RE = /([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/g;
const NOT_FOUND_HINTS = [
  "page not found",
  "we can't seem to find",
  "sorry, we couldn't find",
  "doesn't exist",
];

/**
 * Visits one challenge URL with a real headless browser and extracts data.
 * Returns { status: 'found', data } | { status: 'missing' } | { status: 'error', reason }
 */
async function checkChallenge(browser, id) {
  const url = `https://www.strava.com/challenges/${id}`;
  let page;
  try {
    page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    );

    const response = await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 20000,
    });

    const status = response ? response.status() : 0;
    if (status === 404 || status === 410) {
      return { status: "missing" };
    }

    // Give the SPA a brief moment to hydrate/render challenge widgets.
    // page.waitForTimeout() was removed in newer Puppeteer versions —
    // a plain delay does the same job here.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const extracted = await page.evaluate(() => {
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content || "";
      const ogDesc = document.querySelector('meta[property="og:description"]')?.content || "";
      const bodyText = document.body ? document.body.innerText : "";
      return { ogTitle, ogDesc, bodyText };
    });

    const bodyLower = extracted.bodyText.toLowerCase();
    if (NOT_FOUND_HINTS.some((hint) => bodyLower.includes(hint))) {
      return { status: "missing" };
    }

    const title = extracted.ogTitle.replace(/\s*-\s*Strava Challenges\s*$/i, "").trim();
    if (!title) {
      // Couldn't find a title at all — treat as a soft failure to retry later
      // rather than a confirmed "missing" (avoids false positives from a slow
      // render or a Strava layout change).
      return { status: "error", reason: "no-title" };
    }

    const description = extractDescription(extracted.bodyText, extracted.ogDesc);
    const dateInterval = extractDateInterval(extracted.bodyText);
    const activities = extractActivities(extracted.bodyText);

    return {
      status: "found",
      data: {
        id,
        url,
        title,
        description,
        dateInterval,
        activities,
        rawText: extracted.bodyText, // handy for /debug, not sent to Telegram
      },
    };
  } catch (err) {
    return { status: "error", reason: String(err && err.message ? err.message : err) };
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (_) {
        /* ignore */
      }
    }
  }
}

function extractDescription(bodyText, ogDescFallback) {
  // Look for a line right after the "Qualifying Activities" label going
  // backwards, or a line that starts with a typical goal verb. This is
  // heuristic because Strava's markup isn't publicly documented — adjust
  // here if you see mismatches via the /debug endpoint.
  const lines = bodyText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const goalLine = lines.find((l) => /^(Complete|Run|Ride|Walk|Log|Climb|Cover|Reach)\b/i.test(l));
  if (goalLine && goalLine.length < 120) return goalLine;

  return ogDescFallback.trim() || "(not found — check /debug)";
}

// Matches a same-line date range first, e.g. "Sep 1 - Sep 30, 2026",
// "September 1, 2026 to September 30, 2026". This is tried before the
// looser fallback below because it correctly pairs a start/end that
// belong together, rather than grabbing the first two unrelated dates
// anywhere on the page (e.g. a copyright year elsewhere in the DOM).
const DATE_RANGE_RE =
  /([A-Z][a-z]{2,8}\s+\d{1,2}(?:,\s*\d{4})?)\s*(?:-|–|—|to)\s*([A-Z][a-z]{2,8}\s+\d{1,2},\s*\d{4})/;

function extractDateInterval(bodyText) {
  const rangeMatch = bodyText.match(DATE_RANGE_RE);
  if (rangeMatch) {
    let start = rangeMatch[1];
    const end = rangeMatch[2];
    if (!/\d{4}/.test(start)) {
      // Start date had no year of its own (e.g. "Sep 1 - Sep 30, 2026") —
      // borrow the year from the end date so it's unambiguous.
      const year = end.match(/\d{4}/);
      if (year) start = `${start}, ${year[0]}`;
    }
    return `${start} to ${end}`;
  }

  // Fallback: first two standalone full dates found anywhere on the page.
  const matches = bodyText.match(DATE_RE);
  if (matches && matches.length >= 2) {
    return `${matches[0]} to ${matches[1]}`;
  }
  if (matches && matches.length === 1) {
    return `${matches[0]} (end date not found — check /debug)`;
  }
  return "(not found — check /debug)";
}

function extractActivities(bodyText) {
  const idx = bodyText.toLowerCase().indexOf("qualifying activities");
  if (idx === -1) return "(not found — check /debug)";

  // Bounded window after the label. If /debug shows activities getting
  // cut off or a wrong tail keyword bleeding in from further down the
  // page, adjust this window (or better, cut it off at the next heading
  // you see in rawText, e.g. "Leaderboard" or "Rules").
  const searchText = bodyText.slice(idx, idx + 500);

  const foundWithPos = ACTIVITY_KEYWORDS.map((kw) => ({
    kw,
    pos: searchText.indexOf(kw),
  })).filter((x) => x.pos !== -1);

  if (!foundWithPos.length) return "(not found — check /debug)";

  // Drop a generic keyword (e.g. "Run") when it's really just the tail of
  // a more specific match at the same position (e.g. "Trail Run" also
  // contains "Run" ending at the same spot) — avoids double-counting one
  // chip as two activities.
  const filtered = foundWithPos.filter(({ kw, pos }) => {
    return !foundWithPos.some(
      (other) =>
        other.kw !== kw &&
        other.kw.endsWith(kw) &&
        other.pos + (other.kw.length - kw.length) === pos
    );
  });

  // Preserve the order the activities appear on the page rather than the
  // order of ACTIVITY_KEYWORDS, so the message reads naturally.
  filtered.sort((a, b) => a.pos - b.pos);
  return filtered.map((x) => x.kw).join(", ");
}

// ---------- Core scan ----------

async function runScan(env, { verbose = false } = {}) {
  const state = await loadState(env);
  const maxForward = parseInt(env.MAX_FORWARD_CHECKS, 10) || 40;
  const maxRetry = parseInt(env.MAX_RETRY_CHECKS, 10) || 20;
  const maxAttempts = parseInt(env.MAX_RETRY_ATTEMPTS, 10) || 10;
  const missLimit = parseInt(env.CONSECUTIVE_MISSING_LIMIT, 10) || 4;

  const browser = await puppeteer.launch(env.MYBROWSER);
  const log = [];
  let notifiedCount = 0;

  try {
    // ---- Phase 1: retry previously missing/error ids ----
    const stillPending = [];
    let retried = 0;
    for (const item of state.retryQueue) {
      if (retried >= maxRetry) {
        stillPending.push(item);
        continue;
      }
      retried++;
      const result = await checkChallenge(browser, item.id);
      if (result.status === "found") {
        await notifyTelegram(env, result.data);
        notifiedCount++;
        log.push(`retry: ${item.id} FOUND`);
      } else {
        const attempts = (item.attempts || 0) + 1;
        log.push(`retry: ${item.id} still ${result.status} (attempt ${attempts})`);
        if (attempts < maxAttempts) {
          stillPending.push({ ...item, attempts, type: result.status });
        } else {
          log.push(`retry: ${item.id} gave up after ${attempts} attempts`);
        }
      }
    }
    state.retryQueue = stillPending;

    // ---- Phase 2: forward scan from frontier ----
    let id = state.frontier;
    let consecutiveMissing = 0;
    let checked = 0;

    while (checked < maxForward && consecutiveMissing < missLimit) {
      const result = await checkChallenge(browser, id);
      checked++;

      if (result.status === "found") {
        await notifyTelegram(env, result.data);
        notifiedCount++;
        consecutiveMissing = 0;
        state.frontier = id + 1;
        log.push(`forward: ${id} FOUND`);
      } else if (result.status === "missing") {
        consecutiveMissing++;
        state.retryQueue.push({ id, type: "missing", attempts: 0, firstSeen: Date.now() });
        state.frontier = id + 1;
        log.push(`forward: ${id} missing (streak ${consecutiveMissing})`);
      } else {
        // error: don't let it silently block forward progress, but do
        // count it like a miss so a run of dead requests still halts.
        consecutiveMissing++;
        state.retryQueue.push({ id, type: "error", attempts: 0, firstSeen: Date.now() });
        state.frontier = id + 1;
        log.push(`forward: ${id} error (${result.reason}) (streak ${consecutiveMissing})`);
      }
      id++;
    }

    state.notifiedCount = (state.notifiedCount || 0) + notifiedCount;
    await saveState(env, state);
  } finally {
    await browser.close();
  }

  const summary = {
    notifiedCount,
    frontier: state.frontier,
    retryQueueSize: state.retryQueue.length,
    log,
  };

  if (verbose) return summary;
  return { notifiedCount, frontier: state.frontier, retryQueueSize: state.retryQueue.length };
}

// ---------- Worker entrypoints ----------

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runScan(env).catch((err) => {
        console.error("scan failed", err);
        return notifyTelegramText(env, `⚠️ Strava challenge scan failed: ${err}`);
      })
    );
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Manually trigger a scan: GET /run?token=<ADMIN_TOKEN>
    if (url.pathname === "/run") {
      if (url.searchParams.get("token") !== env.ADMIN_TOKEN) {
        return new Response("Unauthorized", { status: 401 });
      }
      const result = await runScan(env, { verbose: true });
      return Response.json(result);
    }

    // Inspect current state: GET /state?token=<ADMIN_TOKEN>
    if (url.pathname === "/state") {
      if (url.searchParams.get("token") !== env.ADMIN_TOKEN) {
        return new Response("Unauthorized", { status: 401 });
      }
      const state = await loadState(env);
      return Response.json(state);
    }

    // Render one id and return raw extraction for selector calibration:
    // GET /debug/6386?token=<ADMIN_TOKEN>
    if (url.pathname.startsWith("/debug/")) {
      if (url.searchParams.get("token") !== env.ADMIN_TOKEN) {
        return new Response("Unauthorized", { status: 401 });
      }
      const id = url.pathname.split("/debug/")[1];
      const browser = await puppeteer.launch(env.MYBROWSER);
      try {
        const result = await checkChallenge(browser, id);
        return Response.json(result);
      } finally {
        await browser.close();
      }
    }

    return new Response(
      "Strava Scout.\n" +
        "GET /run?token=...   trigger a scan now\n" +
        "GET /state?token=... view current scan state\n" +
        "GET /debug/<id>?token=... render one challenge id and return raw extraction\n",
      { headers: { "content-type": "text/plain" } }
    );
  },
};
