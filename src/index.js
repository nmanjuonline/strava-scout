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
    `**Title:** ${data.title}\n` +
    `**Description:** ${data.description}\n` +
    `**Date Interval:** ${data.dateInterval}\n` +
    `**Qualifying Activities:** ${data.activities}\n` +
    `**URL:** ${data.url}`;

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

// ---------- HTML parsing helpers ----------

function clean(str) {
  return (str || "").replace(/\s+/g, " ").trim();
}

function decodeEntities(str) {
  return (str || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function meta(html, nameOrProperty) {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${nameOrProperty}["'][^>]+content=["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${nameOrProperty}["']`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1]);
  }
  return "";
}

function titleTag(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]) : "";
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n");
}

function parseJsonLd(html) {
  const blocks = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ].flatMap((match) => {
    try {
      return [JSON.parse(match[1])];
    } catch {
      return [];
    }
  });
  return blocks.flatMap((value) =>
    Array.isArray(value) ? value : value?.["@graph"] || [value]
  );
}

function parseReactProps(html) {
  const match = html.match(/data-react-props=(['"])([\s\S]*?)\1/i);
  if (!match) return null;
  try {
    return JSON.parse(decodeEntities(match[2]));
  } catch {
    return null;
  }
}

function challengeDataFromReactProps(props) {
  if (!props) return null;
  const title = clean(props.header?.name);
  const description = clean(props.header?.subtitle);
  const calendarTitle = props.summary?.calendar?.title || "";
  const sections = props.sections || [];
  const qualifying = sections
    .flatMap((section) => section.content || [])
    .find((content) => content.key === "qualifyingActivities")
    ?.qualifyingActivities;
  const activities = Array.isArray(qualifying)
    ? qualifying.map((item) => item.text || item.activityType).filter(Boolean).join(", ")
    : null;

  if (!title) return null;
  return { title, description, calendarTitle, activities };
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function dateRange(start, end) {
  const s = formatDate(start);
  const e = formatDate(end);
  if (s && e) return `${s} to ${e}`;
  if (s) return `${s} (end date not found — check /debug)`;
  return null;
}

function matchSection(text, regex) {
  const m = text.match(regex);
  return m ? clean(m[1]) : null;
}

// Same-line date range fallback, e.g. "Sep 1 - Sep 30, 2026",
// "September 1, 2026 to September 30, 2026" — tried when JSON-LD has no
// startDate/endDate.
const DATE_RANGE_RE =
  /([A-Z][a-z]{2,8}\s+\d{1,2}(?:,\s*\d{4})?)\s*(?:-|–|—|to)\s*([A-Z][a-z]{2,8}\s+\d{1,2},\s*\d{4})/;
const DATE_RE = /([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/g;

function dateIntervalFromText(text) {
  const rangeMatch = text.match(DATE_RANGE_RE);
  if (rangeMatch) {
    let start = rangeMatch[1];
    const end = rangeMatch[2];
    if (!/\d{4}/.test(start)) {
      const year = end.match(/\d{4}/);
      if (year) start = `${start}, ${year[0]}`;
    }
    return `${start} to ${end}`;
  }
  const labelMatch = matchSection(
    text,
    /(?:Challenge\s+)?Dates?\s*:?\s*([A-Z][a-z]{2,8}\.?\s+\d{1,2}[^|]{0,60})/i
  );
  if (labelMatch) return labelMatch;

  const matches = text.match(DATE_RE);
  if (matches && matches.length >= 2) return `${matches[0]} to ${matches[1]}`;
  if (matches && matches.length === 1) return `${matches[0]} (end date not found — check /debug)`;
  return null;
}

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

function activityListFromJsonLd(data) {
  const candidates = [data.activityType, data.sport, data.about, data.additionalType]
    .flat()
    .filter(Boolean)
    .map((v) => (typeof v === "string" ? v : v?.name))
    .filter(Boolean);
  if (!candidates.length) return null;
  return clean(candidates.join(", "));
}

function activityListFromText(text) {
  const idx = text.toLowerCase().indexOf("qualifying activities");
  if (idx === -1) return null;
  const window = text.slice(idx, idx + 500);

  const found = ACTIVITY_KEYWORDS.map((kw) => ({
    kw,
    pos: window.indexOf(kw),
  })).filter((x) => x.pos !== -1);
  if (!found.length) return null;

  const filtered = found.filter(({ kw, pos }) => {
    return !found.some(
      (other) =>
        other.kw !== kw &&
        other.kw.endsWith(kw) &&
        other.pos + (other.kw.length - kw.length) === pos
    );
  });
  filtered.sort((a, b) => a.pos - b.pos);
  return filtered.map((x) => x.kw).join(", ");
}

const NOT_FOUND_HINTS = [
  "page not found",
  "we can't seem to find",
  "sorry, we couldn't find",
  "doesn't exist",
];

const BROWSER_BLOCK_HINTS = [
  "version of internet explorer that strava no longer supports",
  "browser-detection-error",
  "upgrade your web browser",
];

function isBrowserBlockedPage(html) {
  const pageText = clean(decodeEntities(stripTags(html))).toLowerCase();
  return BROWSER_BLOCK_HINTS.some((hint) => pageText.includes(hint));
}

/**
 * Parses semantic JSON-LD first, then falls back to common metadata /
 * label-anchored text matching. Keep the fallbacks current if Strava
 * changes its markup — use /debug/<id> to see what's actually on a page.
 */
function parseChallenge(html, id, url) {
  const embedded = challengeDataFromReactProps(parseReactProps(html));
  const ld = parseJsonLd(html);
  const data =
    ld.find((value) => value && (value.name || value.headline || value.description)) || {};

  const title = clean(
    embedded?.title || data.name || data.headline || meta(html, "og:title") || titleTag(html)
  );
  const description = clean(
    embedded?.description || data.description || meta(html, "description") || meta(html, "og:description")
  );

  if (!title || !description) return null;

  const text = clean(stripTags(html));

  const dateInterval =
    dateRange(data.startDate, data.endDate) ||
    dateIntervalFromText(embedded?.calendarTitle || text) ||
    "Not published";

  const activities =
    embedded?.activities || activityListFromJsonLd(data) || activityListFromText(text) || "Not published";

  return {
    id,
    title,
    description,
    dateInterval,
    activities,
    url,
    discoveredAt: new Date().toISOString(),
  };
}

// ---------- Fetch + check one challenge id ----------

/**
 * Fetches one challenge URL directly (no browser needed — the fields we
 * need are present in the server-rendered HTML via JSON-LD/meta tags).
 * Returns { status: 'found', data } | { status: 'missing' } | { status: 'error', reason }
 */
async function checkChallenge(id, { includeRaw = false } = {}) {
  const url = `https://www.strava.com/challenges/${id}`;
  const requestUrl = `${url}.json`;
  try {
    const response = await fetch(requestUrl, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Upgrade-Insecure-Requests": "1",
      },
    });

    if (response.status === 404 || response.status === 410) {
      return { status: "missing" };
    }
    const html = await response.text();
    const lower = html.toLowerCase();
    if (!response.ok) {
      const upstreamReason = lower.includes("browser-detection-error")
        ? "browser-detection-error"
        : `HTTP ${response.status}`;
      const result = { status: "error", reason: upstreamReason };
      if (includeRaw) result.rawText = clean(stripTags(html)).slice(0, 4000);
      return result;
    }

    if (NOT_FOUND_HINTS.some((hint) => lower.includes(hint))) {
      return { status: "missing" };
    }

    if (isBrowserBlockedPage(html)) {
      const result = { status: "error", reason: "browser-detection-error" };
      if (includeRaw) result.rawText = clean(stripTags(html)).slice(0, 4000);
      return result;
    }

    const parsed = parseChallenge(html, id, url);
    if (!parsed) {
      const result = { status: "error", reason: "parse-failed" };
      if (includeRaw) result.rawText = clean(stripTags(html)).slice(0, 4000);
      return result;
    }

    if (includeRaw) parsed.rawText = clean(stripTags(html)).slice(0, 4000);
    return { status: "found", data: parsed };
  } catch (err) {
    return { status: "error", reason: String(err && err.message ? err.message : err) };
  }
}

// ---------- Core scan ----------

async function runScan(env, { verbose = false } = {}) {
  const state = await loadState(env);
  const maxForward = parseInt(env.MAX_FORWARD_CHECKS, 10) || 40;
  const maxRetry = parseInt(env.MAX_RETRY_CHECKS, 10) || 20;
  const maxAttempts = parseInt(env.MAX_RETRY_ATTEMPTS, 10) || 10;
  const missLimit = parseInt(env.CONSECUTIVE_MISSING_LIMIT, 10) || 4;

  const log = [];
  let notifiedCount = 0;

  // ---- Phase 1: retry previously missing/error ids ----
  const stillPending = [];
  let retried = 0;
  for (const item of state.retryQueue) {
    if (retried >= maxRetry) {
      stillPending.push(item);
      continue;
    }
    retried++;
    const result = await checkChallenge(item.id);
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
    const result = await checkChallenge(id);
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
      consecutiveMissing++;
      state.retryQueue.push({ id, type: "error", attempts: 0, firstSeen: Date.now() });
      state.frontier = id + 1;
      log.push(`forward: ${id} error (${result.reason}) (streak ${consecutiveMissing})`);
    }
    id++;
  }

  state.notifiedCount = (state.notifiedCount || 0) + notifiedCount;
  await saveState(env, state);

  const summary = {
    notifiedCount,
    frontier: state.frontier,
    retryQueueSize: state.retryQueue.length,
    log,
  };
  return verbose ? summary : { notifiedCount, frontier: state.frontier, retryQueueSize: state.retryQueue.length };
}

// ---------- Worker entrypoints ----------

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runScan(env).catch((err) => {
        console.error("scan failed", err);
        return notifyTelegramText(env, `⚠️ Strava Scout scan failed: ${err}`);
      })
    );
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/run") {
      if (url.searchParams.get("token") !== env.ADMIN_TOKEN) {
        return new Response("Unauthorized", { status: 401 });
      }
      try {
        const result = await runScan(env, { verbose: true });
        return Response.json(result);
      } catch (err) {
        console.error("run failed", err);
        return Response.json({ error: String(err && err.stack ? err.stack : err) }, { status: 500 });
      }
    }

    if (url.pathname === "/state") {
      if (url.searchParams.get("token") !== env.ADMIN_TOKEN) {
        return new Response("Unauthorized", { status: 401 });
      }
      try {
        const state = await loadState(env);
        return Response.json(state);
      } catch (err) {
        console.error("state failed", err);
        return Response.json({ error: String(err && err.stack ? err.stack : err) }, { status: 500 });
      }
    }

    // Fetch + parse one id and return the extracted fields plus raw
    // stripped text, for calibrating the parsing logic against a live
    // page: GET /debug/6386?token=<ADMIN_TOKEN>
    if (url.pathname.startsWith("/debug/")) {
      if (url.searchParams.get("token") !== env.ADMIN_TOKEN) {
        return new Response("Unauthorized", { status: 401 });
      }
      const id = url.pathname.split("/debug/")[1];
      try {
        const result = await checkChallenge(id, { includeRaw: true });
        return Response.json(result);
      } catch (err) {
        console.error("debug failed", err);
        return Response.json({ error: String(err && err.stack ? err.stack : err) }, { status: 500 });
      }
    }

    return new Response(
      "Strava Scout.\n" +
        "GET /run?token=...   trigger a scan now\n" +
        "GET /state?token=... view current scan state\n" +
        "GET /debug/<id>?token=... fetch + parse one challenge id and return raw extraction\n",
      { headers: { "content-type": "text/plain" } }
    );
  },
};
