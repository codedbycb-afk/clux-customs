// iCalendar (RFC 5545) — just enough to write bookings and read busy times.
import { zonedToUtc, TZ, hhmmToMin } from "./time.js";

                        
                                          
                                                           
                                                                                    
                    
  

const esc = (s        ) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

const stamp = (ms        ) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Fold to 75 octets per RFC 5545 §3.1 without splitting a UTF-8 sequence. */
function fold(line        )         {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out           = [];
  let cur = "", len = 0, limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (len + n > limit) { out.push(cur); cur = ""; len = 0; limit = 74; }
    cur += ch; len += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function vevent(e          , now = Date.now())           {
  const l = [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${esc(e.summary)}`,
  ];
  if (e.description) l.push(`DESCRIPTION:${esc(e.description)}`);
  if (e.location) l.push(`LOCATION:${esc(e.location)}`);
  if (e.url) l.push(`URL:${e.url}`);
  l.push(`STATUS:${e.status ?? "CONFIRMED"}`, `SEQUENCE:${e.sequence ?? 0}`);
  if (e.alarmMin != null) {
    l.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.summary)}`,
      `TRIGGER:-PT${e.alarmMin}M`, "END:VALARM");
  }
  l.push("END:VEVENT");
  return l;
}

export function buildCalendar(events            , name         )         {
  const l = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Twenty47 Marketing//C-Lux Booking//EN", "CALSCALE:GREGORIAN"];
  if (name) {
    l.push(`X-WR-CALNAME:${esc(name)}`, "X-PUBLISHED-TTL:PT15M", "REFRESH-INTERVAL;VALUE=DURATION:PT15M");
  }
  for (const e of events) l.push(...vevent(e));
  l.push("END:VCALENDAR");
  return l.map(fold).join("\r\n") + "\r\n";
}

// ---------- parsing ----------

                           
                                                           
                                                                                
  

function unesc(s        ) {
  return s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
}

function parseDate(value        , params                        , fallbackTz        )                                         {
  const v = value.trim();
  const dm = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dm || params.VALUE === "DATE") {
    const m = dm ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return { ms: zonedToUtc(`${m[1]}-${m[2]}-${m[3]}`, 0, fallbackTz), allDay: true };
  }
  const t = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!t) return null;
  const [, y, mo, d, h, mi, s, z] = t;
  if (z) return { ms: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s), allDay: false };
  let tz = (params.TZID || fallbackTz).replace(/^"|"$/g, "");
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { tz = fallbackTz; }
  return { ms: zonedToUtc(`${y}-${mo}-${d}`, hhmmToMin(`${h}:${mi}`), tz) + +s * 1000, allDay: false };
}

function parseDuration(v        )         {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return 0;
  const [, sign, w, d, h, mi, s] = m;
  const ms = ((+(w || 0) * 7 + +(d || 0)) * 86400 + +(h || 0) * 3600 + +(mi || 0) * 60 + +(s || 0)) * 1000;
  return sign === "-" ? -ms : ms;
}

/** Every VEVENT in an iCalendar text. Recurrence masters are returned as-is
 *  (we ask the CalDAV server to expand them; if it doesn't, only the first
 *  instance blocks time — flagged via `recurring`). */
export function parseIcs(text        , fallbackTz = TZ)                {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out                = [];
  let cur                                                                  = null;
  let depth = 0; // ignore VALARM etc. inside VEVENT
  for (const raw of lines) {
    if (raw === "BEGIN:VEVENT") { cur = {}; depth = 0; continue; }
    if (!cur) continue;
    if (raw.startsWith("BEGIN:")) { depth++; continue; }
    if (raw.startsWith("END:") && depth > 0) { depth--; continue; }
    if (raw === "END:VEVENT") {
      const st = cur.DTSTART && parseDate(cur.DTSTART.v, cur.DTSTART.p, fallbackTz);
      if (st) {
        let end        ;
        const en = cur.DTEND && parseDate(cur.DTEND.v, cur.DTEND.p, fallbackTz);
        if (en) end = en.ms;
        else if (cur.DURATION) end = st.ms + parseDuration(cur.DURATION.v);
        else end = st.ms + (st.allDay ? 86400000 : 0);
        out.push({
          uid: cur.UID?.v ?? "",
          start: st.ms, end, allDay: st.allDay,
          summary: unesc(cur.SUMMARY?.v ?? ""),
          transparent: (cur.TRANSP?.v ?? "").toUpperCase() === "TRANSPARENT",
          cancelled: (cur.STATUS?.v ?? "").toUpperCase() === "CANCELLED",
          recurring: !!cur.RRULE,
        });
      }
      cur = null; continue;
    }
    if (depth > 0) continue;
    const colon = raw.indexOf(":");
    if (colon < 0) continue;
    const [name, ...ps] = raw.slice(0, colon).split(";");
    const p                         = {};
    for (const kv of ps) { const i = kv.indexOf("="); if (i > 0) p[kv.slice(0, i).toUpperCase()] = kv.slice(i + 1); }
    const key = name.toUpperCase();
    if (!(key in cur)) cur[key] = { v: raw.slice(colon + 1), p };
  }
  return out;
}
