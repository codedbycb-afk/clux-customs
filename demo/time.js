// Wall-clock <-> UTC helpers for one shop timezone, no dependencies.
// Dates are "YYYY-MM-DD" strings, times are minutes after midnight local.

export const TZ = "America/New_York";

const fmtCache = new Map                             ();
function parts(ms        , tz        ) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  const o                         = {};
  for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  return o;
}

/** Minutes the zone is ahead of UTC at this instant (EDT = -240). */
export function offsetMin(ms        , tz = TZ)         {
  const p = parts(ms, tz);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/** Local wall time in `tz` -> epoch ms. Nonexistent DST times roll forward. */
export function zonedToUtc(date        , minutes        , tz = TZ)         {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const o1 = offsetMin(guess, tz);
  let t = guess - o1 * 60000;
  const o2 = offsetMin(t, tz);
  if (o2 !== o1) t = guess - o2 * 60000;
  return t;
}

export function localDate(ms        , tz = TZ)         {
  const p = parts(ms, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

export function localMinutes(ms        , tz = TZ)         {
  const p = parts(ms, tz);
  return +p.hour * 60 + +p.minute;
}

export function addDays(date        , n        )         {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}

/** 0 = Sunday */
export function weekday(date        )         {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

export function hhmmToMin(s        )         {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minToHhmm(n        )         {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

export function timeLabel(ms        , tz = TZ)         {
  return new Date(ms).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
}

export function dateLabel(ms        , tz = TZ)         {
  return new Date(ms).toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" });
}

export function isDate(s         )              {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
