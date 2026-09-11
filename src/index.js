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

// ---------- Strava fetch + response classification ----------

const STRAVA_BASE_URL = "https://www.strava.com";
const STRAVA_CHALLENGE_URL = (id) =>
  `${STRAVA_BASE_URL}/challenges/${encodeURIComponent(id)}`;

// Keep this conservative.
// Do NOT try to spoof dozens of browser headers.
const STRAVA_HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
};

const BLOCK_HINTS = [
  "browser-detection-error",
  "version of internet explorer",
  "strava no longer supports",
  "please upgrade your web browser",
];

const RATE_LIMIT_HINTS = [
  "too many requests",
  "rate limit",
  "rate-limit",
];

const TRANSIENT_HTTP_STATUS = new Set([
  408,
  425,
  429,
  500,
  502,
  503,
  504,
]);

function classifyStravaHtml(html) {
  const lower = (html || "").toLowerCase();

  if (BLOCK_HINTS.some((hint) => lower.includes(hint))) {
    return {
      kind: "blocked",
      reason: "browser-detection",
    };
  }

  if (RATE_LIMIT_HINTS.some((hint) => lower.includes(hint))) {
    return {
      kind: "rate-limited",
      reason: "rate-limit-page",
    };
  }

  return {
    kind: "html",
    reason: null,
  };
}

function retryDelay(attempt, baseMs = 5000, maxMs = 120000) {
  // Exponential backoff + jitter.
  const exponential = Math.min(
    maxMs,
    baseMs * Math.pow(2, Math.max(0, attempt - 1))
  );

  const jitter = Math.floor(Math.random() * Math.min(3000, exponential * 0.25));

  return exponential + jitter;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch one Strava challenge page.
 *
 * Important:
 * - 404/410 = genuinely missing
 * - 429/5xx/network errors = retryable error
 * - Strava browser-detection page = blocked
 * - valid HTML = parse it
 *
 * Never convert blocked/rate-limited/network errors into "missing".
 */
async function fetchChallengePage(id, attempt = 1) {
  const url = STRAVA_CHALLENGE_URL(id);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: STRAVA_HEADERS,
    });

    const contentType =
      response.headers.get("content-type") || "";

    const finalUrl = response.url || url;

    // Genuine missing challenge.
    if (response.status === 404 || response.status === 410) {
      return {
        kind: "missing",
        id,
        status: response.status,
        url: finalUrl,
      };
    }

    // Rate limiting.
    if (response.status === 429) {
      return {
        kind: "retry",
        id,
        status: response.status,
        reason: "HTTP 429",
        retryAfter: parseRetryAfter(
          response.headers.get("retry-after")
        ),
      };
    }

    // Other transient HTTP errors.
    if (TRANSIENT_HTTP_STATUS.has(response.status)) {
      return {
        kind: "retry",
        id,
        status: response.status,
        reason: `HTTP ${response.status}`,
      };
    }

    // Any other non-success response.
    if (!response.ok) {
      return {
        kind: "error",
        id,
        status: response.status,
        reason: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();

    const classification = classifyStravaHtml(html);

    if (classification.kind === "blocked") {
      return {
        kind: "blocked",
        id,
        status: response.status,
        reason: classification.reason,
        url: finalUrl,
        contentType,
        rawText: clean(stripTags(html)).slice(0, 1200),
      };
    }

    if (classification.kind === "rate-limited") {
      return {
        kind: "retry",
        id,
        status: response.status,
        reason: classification.reason,
        url: finalUrl,
        rawText: clean(stripTags(html)).slice(0, 1200),
      };
    }

    return {
      kind: "ok",
      id,
      html,
      status: response.status,
      url: finalUrl,
      contentType,
    };
  } catch (err) {
    return {
      kind: "retry",
      id,
      reason: err?.message || String(err),
    };
  }
}

function parseRetryAfter(value) {
  if (!value) return null;

  const seconds = Number(value);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const date = Date.parse(value);

  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return null;
}

/**
 * Fetch + parse one challenge.
 *
 * Returns:
 *
 *   { status: "found", data }
 *   { status: "missing" }
 *   { status: "blocked", ... }
 *   { status: "retry", ... }
 *   { status: "error", ... }
 */
async function checkChallenge(id, { includeRaw = false } = {}) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await fetchChallengePage(id, attempt);

    if (result.kind === "missing") {
      return {
        status: "missing",
      };
    }

    if (result.kind === "blocked") {
      return {
        status: "blocked",
        reason: result.reason,
        httpStatus: result.status,
        rawText: includeRaw ? result.rawText : undefined,
      };
    }

    if (result.kind === "ok") {
      const parsed = parseChallenge(
        result.html,
        id,
        result.url
      );

      if (!parsed) {
        const response = {
          status: "error",
          reason: "parse-failed",
        };

        if (includeRaw) {
          response.rawText = clean(
            stripTags(result.html)
          ).slice(0, 4000);
        }

        return response;
      }

      if (includeRaw) {
        parsed.rawText = clean(
          stripTags(result.html)
        ).slice(0, 4000);
      }

      return {
        status: "found",
        data: parsed,
      };
    }

    // Retryable.
    if (
      result.kind === "retry" &&
      attempt < maxAttempts
    ) {
      const delay =
        result.retryAfter ??
        retryDelay(attempt);

      console.log(
        `Strava retry: id=${id} attempt=${attempt} ` +
        `reason=${result.reason} delay=${delay}ms`
      );

      await sleep(delay);
      continue;
    }

    if (result.kind === "retry") {
      return {
        status: "retry",
        reason: result.reason,
        httpStatus: result.status,
      };
    }

    return {
      status: "error",
      reason: result.reason || "unknown-error",
    };
  }

  return {
    status: "error",
    reason: "retry-exhausted",
  };
}

// ---------- Core scan ----------

async function runScan(env, { verbose = false } = {}) {
  const state = await loadState(env);

  const maxForward =
    parseInt(env.MAX_FORWARD_CHECKS, 10) || 20;

  const maxRetry =
    parseInt(env.MAX_RETRY_CHECKS, 10) || 10;

  const maxAttempts =
    parseInt(env.MAX_RETRY_ATTEMPTS, 10) || 10;

  const missLimit =
    parseInt(env.CONSECUTIVE_MISSING_LIMIT, 10) || 4;

  // New safety valve.
  // If Strava starts blocking us, stop the entire scan.
  const maxBlockedResponses = 1;

  const log = [];

  let notifiedCount = 0;
  let blockedResponses = 0;

  // ------------------------------------------------------------
  // Phase 1: retry previously failed IDs
  // ------------------------------------------------------------

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

      log.push(
        `retry: ${item.id} FOUND`
      );

      continue;
    }

    if (result.status === "missing") {
      log.push(
        `retry: ${item.id} still missing`
      );

      const attempts =
        (item.attempts || 0) + 1;

      if (attempts < maxAttempts) {
        stillPending.push({
          ...item,
          attempts,
          type: "missing",
        });
      } else {
        log.push(
          `retry: ${item.id} gave up after ${attempts} attempts`
        );
      }

      continue;
    }

    if (result.status === "blocked") {
      blockedResponses++;

      log.push(
        `retry: ${item.id} BLOCKED (${result.reason})`
      );

      // Keep it in the queue.
      stillPending.push({
        ...item,
        type: "blocked",
      });

      // Do not hammer Strava.
      if (blockedResponses >= maxBlockedResponses) {
        log.push(
          "Strava appears to be blocking requests. " +
          "Stopping scan."
        );

        break;
      }

      continue;
    }

    // retry/error
    const attempts =
      (item.attempts || 0) + 1;

    log.push(
      `retry: ${item.id} ${result.status} ` +
      `(attempt ${attempts})`
    );

    if (attempts < maxAttempts) {
      stillPending.push({
        ...item,
        attempts,
        type: result.status,
      });
    } else {
      log.push(
        `retry: ${item.id} gave up after ${attempts} attempts`
      );
    }
  }

  state.retryQueue = stillPending;

  // If Strava is blocking us during retry phase,
  // do not start a forward scan.
  if (blockedResponses >= maxBlockedResponses) {
    await saveState(env, state);

    return verbose
      ? {
          notifiedCount,
          frontier: state.frontier,
          retryQueueSize: state.retryQueue.length,
          stopped: true,
          stopReason: "strava-blocked",
          log,
        }
      : {
          notifiedCount,
          frontier: state.frontier,
          retryQueueSize: state.retryQueue.length,
          stopped: true,
          stopReason: "strava-blocked",
        };
  }

  // ------------------------------------------------------------
  // Phase 2: forward scan
  // ------------------------------------------------------------

  let id = state.frontier;

  let consecutiveMissing = 0;
  let checked = 0;

  while (
    checked < maxForward &&
    consecutiveMissing < missLimit
  ) {
    const result = await checkChallenge(id);

    checked++;

    // ----------------------------------------------------------
    // FOUND
    // ----------------------------------------------------------

    if (result.status === "found") {
      await notifyTelegram(env, result.data);

      notifiedCount++;

      consecutiveMissing = 0;

      state.frontier = id + 1;

      log.push(
        `forward: ${id} FOUND`
      );

      // Small delay between successful requests.
      // This prevents a tight request loop.
      await sleep(
        parseInt(env.REQUEST_DELAY_MS, 10) || 1500
      );

      id++;

      continue;
    }

    // ----------------------------------------------------------
    // MISSING
    // ----------------------------------------------------------

    if (result.status === "missing") {
      consecutiveMissing++;

      state.retryQueue.push({
        id,
        type: "missing",
        attempts: 0,
        firstSeen: Date.now(),
      });

      state.frontier = id + 1;

      log.push(
        `forward: ${id} missing ` +
        `(streak ${consecutiveMissing})`
      );

      id++;

      continue;
    }

    // ----------------------------------------------------------
    // BLOCKED
    // ----------------------------------------------------------

    if (result.status === "blocked") {
      blockedResponses++;

      // IMPORTANT:
      // Do NOT advance frontier.
      // Do NOT count this as missing.
      // We want to retry this exact ID later.

      state.retryQueue.push({
        id,
        type: "blocked",
        attempts: 0,
        firstSeen: Date.now(),
      });

      log.push(
        `forward: ${id} BLOCKED ` +
        `(${result.reason})`
      );

      break;
    }

    // ----------------------------------------------------------
    // RETRYABLE ERROR
    // ----------------------------------------------------------

    if (result.status === "retry") {
      state.retryQueue.push({
        id,
        type: "error",
        attempts: 0,
        firstSeen: Date.now(),
      });

      log.push(
        `forward: ${id} RETRY ` +
        `(${result.reason})`
      );

      // Critical:
      // Do NOT increment consecutiveMissing.
      // Do NOT move the frontier.
      break;
    }

    // ----------------------------------------------------------
    // PARSE / UNKNOWN ERROR
    // ----------------------------------------------------------

    state.retryQueue.push({
      id,
      type: "error",
      attempts: 0,
      firstSeen: Date.now(),
    });

    log.push(
      `forward: ${id} ERROR ` +
      `(${result.reason})`
    );

    // Again, this is not a missing challenge.
    // Stop rather than blindly marching forward.
    break;
  }

  state.notifiedCount =
    (state.notifiedCount || 0) +
    notifiedCount;

  await saveState(env, state);

  const summary = {
    notifiedCount,
    frontier: state.frontier,
    retryQueueSize: state.retryQueue.length,
    checked,
    consecutiveMissing,
    stopped:
      blockedResponses > 0 ||
      checked < maxForward,
    stopReason:
      blockedResponses > 0
        ? "strava-blocked"
        : checked < maxForward
        ? "request-error"
        : null,
    log,
  };

  return verbose
    ? summary
    : {
        notifiedCount,
        frontier: state.frontier,
        retryQueueSize: state.retryQueue.length,
      };
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
