// Preview mode for static hosting (GitHub Pages): answers /api/* in the browser so the
// site and shop app work without the server. Data lives in this browser's localStorage,
// shared by the site and the app, so a booking made on the site shows up in the app.
// Slot math reuses the real server modules (type-stripped by scripts/build-preview.ts).
import { computeSlots, overlaps } from "./slots.js";
import { addDays, isDate, localDate, weekday, zonedToUtc, TZ } from "./time.js";
import { buildCalendar } from "./ics.js";
import { DEFAULT_BUSINESS, DEFAULT_HOURS, DEFAULT_RULES, DEFAULT_SERVICES } from "./defaults.js";

const KEY = "clux-demo-v1";
const AUTH = "clux-demo-auth";
const PASSCODE = "2477";
const DAY = 86400000;

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

// ---------- store ----------
let S = null;
function load() {
  if (S) return S;
  try { S = JSON.parse(ls.get(KEY) || "null"); } catch { S = null; }
  if (!S || !S.bookings) { S = seed(); save(); }
  return S;
}
const save = () => ls.set(KEY, JSON.stringify(S));

const REF_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const rand = n => [...crypto.getRandomValues(new Uint8Array(n))];
const newRef = () => "CL-" + rand(5).map(x => REF_CHARS[x % REF_CHARS.length]).join("");
const newToken = () => rand(16).map(x => x.toString(16).padStart(2, "0")).join("");

function seed() {
  const now = Date.now();
  const st = { settings: {}, bookings: [], blocks: [], apple: null, nextId: 1, nextBlock: 1 };
  // Open days around today, so the sample week always looks lived-in.
  const open = [];
  for (let i = -7; open.length < 14 && i < 30; i++) {
    const d = addDays(localDate(now), i);
    if (DEFAULT_HOURS.weekly[weekday(d)].length) open.push({ d, i });
  }
  const future = open.filter(x => x.i >= 0), past = open.filter(x => x.i < 0);
  const svc = id => DEFAULT_SERVICES.find(s => s.id === id);
  const add = (day, hhmm, ids, status, paid, cust, details = {}, notes = "") => {
    if (!day) return;
    const [h, m] = hhmm.split(":").map(Number);
    const start = zonedToUtc(day.d, h * 60 + m);
    const mins = ids.reduce((n, id) => n + svc(id).durationMin, 0);
    st.bookings.push(row(st, {
      services: ids.map(id => ({ id, name: svc(id).name })), details, start_ms: start, end_ms: start + mins * 60000,
      status, deposit_paid: paid, notes, source: "web", ...cust,
    }));
  };
  add(past[past.length - 1], "11:00", ["auto-tint"], "completed", true, { name: "Jordan Miles", phone: "(216) 555-0148", instagram: "jmiles.r" }, { vehicle: "2021 Dodge Charger", shade: "20%", film: "Ceramic" });
  add(past[past.length - 3], "13:00", ["calipers"], "completed", true, { name: "Andre Wallace", phone: "(440) 555-0119" }, { vehicle: "2019 Ford Mustang GT" });
  add(past[past.length - 4], "10:30", ["detail"], "no_show", false, { name: "Kev Thomas", phone: "(216) 555-0172" }, { vehicle: "2016 Honda Accord" });
  add(future[0], "10:00", ["auto-tint"], "confirmed", true, { name: "Marcus Johnson", phone: "(216) 555-0133", instagram: "marcusj216" }, { vehicle: "2022 Kia Telluride", shade: "15%", film: "Ceramic" }, "Wants the windshield strip too.");
  add(future[0], "14:00", ["headlights"], "pending", false, { name: "Tasha Reed", phone: "(216) 555-0190" }, { vehicle: "2020 Infiniti Q50" }, "Smoked taillights, not blacked out.");
  add(future[1], "10:30", ["chrome-delete", "auto-tint"], "confirmed", true, { name: "Devon Wright", phone: "(330) 555-0165", instagram: "devonw.cle" }, { vehicle: "2023 Dodge Challenger", shade: "5%", film: "Carbon" });
  add(future[2], "12:00", ["calipers"], "pending", false, { name: "Chris Allen", phone: "(216) 555-0107" }, { vehicle: "2018 BMW 340i" }, "Red calipers.");
  add(future[3], "10:00", ["building-tint"], "confirmed", false, { name: "Lakeview Dental", phone: "(216) 555-0124", email: "office@example.com" }, { address: "1200 Lakeside Ave, Cleveland, OH" });
  add(future[4], "11:00", ["detail", "wrap"], "pending", false, { name: "Nia Brooks", phone: "(216) 555-0186" }, { vehicle: "2021 Tesla Model 3" }, "Gloss black roof.");
  if (future[5]) {
    const b0 = zonedToUtc(future[5].d, 15 * 60);
    st.blocks.push({ id: st.nextBlock++, start_ms: b0, end_ms: b0 + 2 * 3600000, label: "Supply run" });
  }
  return st;
}

function row(st, b) {
  const now = Date.now();
  return {
    id: st.nextId++, ref: newRef(), token: newToken(), services: b.services, details: b.details ?? {},
    start_ms: b.start_ms, end_ms: b.end_ms, status: b.status, deposit_paid: !!b.deposit_paid,
    name: b.name, phone: b.phone, email: b.email || null, instagram: b.instagram || null, notes: b.notes || null, shop_notes: null,
    source: b.source, cal_href: null, cal_sync: calState(st), cal_error: null, cal_seq: 0, created_at: now, updated_at: now,
  };
}
const calState = st => (st.apple?.bookingCal ? "ok" : "none");

const services = () => load().settings.services ?? DEFAULT_SERVICES;
const hours = () => load().settings.hours ?? DEFAULT_HOURS;
const rules = () => load().settings.rules ?? DEFAULT_RULES;
const business = () => ({ ...DEFAULT_BUSINESS, ...(load().settings.business ?? {}) });

function listBookings(q = {}) {
  let out = load().bookings.slice();
  if (q.from != null) out = out.filter(b => b.end_ms > q.from);
  if (q.to != null) out = out.filter(b => b.start_ms < q.to);
  if (q.status?.length) out = out.filter(b => q.status.includes(b.status));
  if (q.search) {
    const s = q.search.toLowerCase();
    out = out.filter(b => [b.name, b.phone, b.ref, b.instagram, JSON.stringify(b.details)].some(v => String(v ?? "").toLowerCase().includes(s)));
  }
  return out.sort((a, b) => a.start_ms - b.start_ms).slice(0, Math.min(q.limit ?? 500, 2000));
}
const listBlocks = (from, to) => load().blocks.filter(b => b.end_ms > from && b.start_ms < to).sort((a, b) => a.start_ms - b.start_ms);

// Sample Apple events, only once the demo calendar is "connected".
function appleBusy(from, to) {
  const a = load().apple;
  if (!a?.busyCals?.length || !a.busyCals.includes("demo://personal")) return [];
  const out = [];
  for (let d = localDate(from); zonedToUtc(d, 0) < to; d = addDays(d, 1)) {
    if (weekday(d) === 3) out.push({ start: zonedToUtc(d, 17 * 60), end: zonedToUtc(d, 18 * 60 + 30), summary: "Kids' practice", allDay: false, calendar: "Personal" });
  }
  return out.filter(e => e.end > from && e.start < to);
}

function busyBetween(from, to, excludeId) {
  return [
    ...load().bookings.filter(b => ["pending", "confirmed", "completed"].includes(b.status) && b.end_ms > from && b.start_ms < to && b.id !== excludeId)
      .map(b => ({ start: b.start_ms, end: b.end_ms })),
    ...listBlocks(from, to).map(b => ({ start: b.start_ms, end: b.end_ms })),
    ...appleBusy(from, to).map(e => ({ start: e.start, end: e.end })),
  ];
}

// ---------- booking rules (mirrors server/booking.ts) ----------
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function pickServices(ids, onlineOnly) {
  if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, "Pick at least one service");
  const out = [...new Set(ids.map(String))].map(id => services().find(s => s.id === id && (!onlineOnly || s.online)));
  if (out.some(s => !s)) throw new HttpError(400, "That service isn't available to book online");
  return out;
}
const totalMinutes = svcs => svcs.reduce((n, s) => n + s.durationMin, 0);

function availability(ids, from, days = 42) {
  const svcs = pickServices(ids, true);
  const r = rules(), now = Date.now();
  const start = isDate(from) && from >= localDate(now) ? from : localDate(now);
  const n = Math.min(Math.max(1, days), r.maxDaysOut + 1);
  const busy = busyBetween(now - DAY, now + (n + 2) * DAY);
  return { durationMin: totalMinutes(svcs), days: computeSlots({ from: start, days: n, durationMin: totalMinutes(svcs), hours: hours(), rules: r, busy, now }) };
}

const clean = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
function normalizePhone(p) {
  const d = p.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (d.length !== 10) throw new HttpError(400, "Enter a 10-digit phone number");
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
function readCustomer(body) {
  const name = clean(body.name, 80);
  if (name.length < 2) throw new HttpError(400, "Enter your name");
  const email = clean(body.email, 120);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "That email doesn't look right");
  return { name, phone: normalizePhone(clean(body.phone, 30)), email, instagram: clean(body.instagram, 40).replace(/^@/, ""), notes: clean(body.notes, 1000) };
}
function readDetails(body, svcs) {
  const d = body.details ?? {}, details = {};
  if (svcs.some(s => s.kind === "vehicle")) {
    details.vehicle = clean(d.vehicle, 120);
    if (body.source !== "shop" && details.vehicle.length < 2) throw new HttpError(400, "Tell us the year, make and model");
  }
  if (svcs.some(s => s.options === "tint")) { details.shade = clean(d.shade, 40) || undefined; details.film = clean(d.film, 40) || undefined; }
  if (svcs.some(s => s.kind === "property")) {
    details.address = clean(d.address, 200);
    if (body.source !== "shop" && details.address.length < 5) throw new HttpError(400, "Enter the property address for the estimate");
  }
  return details;
}

const publicBooking = b => ({ ref: b.ref, token: b.token, start: b.start_ms, end: b.end_ms, status: b.status, services: b.services, details: b.details, name: b.name, depositPaid: b.deposit_paid });
const publicService = s => ({ id: s.id, name: s.name, short: s.short, blurb: s.blurb, durationMin: s.durationMin, kind: s.kind, options: s.options });
const feedUrl = () => new URL("../cal/demo-preview.ics", appBase()).href;
const appBase = () => new URL(location.pathname.includes("/app/") ? "./" : "app/", location.href).href;

function appleStatus() {
  const a = load().apple;
  if (!a) return { connected: false };
  return { connected: true, appleId: a.appleId, bookingCal: a.bookingCal, busyCals: a.busyCals, connectedAt: a.connectedAt, lastError: null, lastSyncAt: a.lastSyncAt ?? null };
}
const DEMO_CALS = [
  { url: "demo://home", name: "Home", color: "#3478f6" },
  { url: "demo://work", name: "Work", color: "#e5484d" },
  { url: "demo://personal", name: "Personal", color: "#30a46c" },
];

// ---------- routes ----------
function route(method, url, body) {
  const p = url.pathname.slice(url.pathname.indexOf("/api/"));
  const q = url.searchParams;
  const st = load();

  if (method === "GET" && p === "/api/config") {
    return { business: business(), tz: TZ, hours: hours().weekly, maxDaysOut: rules().maxDaysOut, services: services().filter(s => s.online).map(publicService) };
  }
  if (method === "GET" && p === "/api/slots") {
    return availability((q.get("services") ?? "").split(",").filter(Boolean), q.get("from") ?? undefined, Number(q.get("days") || 42));
  }
  if (method === "POST" && p === "/api/book") {
    if (body.website) return { ok: true };
    const svcs = pickServices(body.services, true);
    const customer = readCustomer(body);
    const details = readDetails(body, svcs);
    const start = Number(body.start);
    if (!Number.isFinite(start)) throw new HttpError(400, "Pick a time");
    const avail = availability(svcs.map(s => s.id), localDate(start), 1);
    if (!avail.days[0]?.slots.includes(start)) throw new HttpError(409, "That time was just taken. Pick another one.");
    const b = row(st, { services: svcs.map(s => ({ id: s.id, name: s.name })), details, start_ms: start, end_ms: start + avail.durationMin * 60000, status: "pending", ...customer, source: "web" });
    st.bookings.push(b); save();
    return [201, { booking: publicBooking(b) }];
  }

  if (!p.startsWith("/api/app/")) throw new HttpError(404, "Not found");
  const a = p.slice("/api/app".length);

  if (method === "POST" && a === "/login") {
    if (String(body.code ?? "") !== PASSCODE) throw new HttpError(401, `Wrong passcode. The preview passcode is ${PASSCODE}.`);
    ls.set(AUTH, "1"); return { ok: true };
  }
  if (method === "POST" && a === "/logout") { ls.del(AUTH); return { ok: true }; }
  if (ls.get(AUTH) !== "1") throw new HttpError(401, "Sign in");

  if (method === "GET" && a === "/me") {
    return { business: business(), services: services(), hours: hours(), rules: rules(), tz: TZ, apple: appleStatus(), feedUrl: feedUrl() };
  }
  if (method === "GET" && a === "/bookings") {
    const n = k => (q.has(k) ? Number(q.get(k)) : undefined);
    return { bookings: listBookings({ from: n("from"), to: n("to"), status: q.get("status")?.split(",").filter(Boolean), search: q.get("q") ?? undefined, limit: n("limit") }) };
  }
  if (method === "GET" && a === "/agenda") {
    const from = Number(q.get("from")), to = Number(q.get("to"));
    if (!(to > from) || to - from > 62 * DAY) throw new HttpError(400, "Bad range");
    return { bookings: listBookings({ from, to }), blocks: listBlocks(from, to), apple: appleBusy(from, to) };
  }
  if (method === "POST" && a === "/bookings") {
    const svcs = pickServices(body.services, false);
    const start = Number(body.start);
    if (!Number.isFinite(start)) throw new HttpError(400, "Pick a date and time");
    const dur = Number(body.durationMin) > 0 ? Number(body.durationMin) : totalMinutes(svcs);
    const end = start + dur * 60000;
    const name = String(body.name ?? "").trim().slice(0, 80);
    if (!name) throw new HttpError(400, "Enter the customer's name");
    const phone = String(body.phone ?? "").trim() ? normalizePhone(String(body.phone)) : "";
    if (!body.force && overlaps(start, end, busyBetween(start - DAY, end + DAY))) throw new HttpError(409, "That overlaps something on your calendar.");
    const b = row(st, {
      services: svcs.map(s => ({ id: s.id, name: s.name })), details: readDetails({ ...body, source: "shop" }, svcs),
      start_ms: start, end_ms: end, status: body.depositPaid ? "confirmed" : "pending", deposit_paid: !!body.depositPaid,
      name, phone, email: String(body.email ?? "").trim(), instagram: String(body.instagram ?? "").trim().replace(/^@/, ""), notes: String(body.notes ?? "").trim(), source: "shop",
    });
    st.bookings.push(b); save();
    return [201, { booking: b }];
  }
  let m = /^\/bookings\/(\d+)$/.exec(a);
  if (m && method === "PATCH") {
    const cur = st.bookings.find(b => b.id === Number(m[1]));
    if (!cur) throw new HttpError(404, "Not found");
    const patch = {};
    for (const k of ["name", "email", "instagram", "notes", "shop_notes"]) if (typeof body[k] === "string") patch[k] = body[k].trim();
    if (typeof body.phone === "string") patch.phone = body.phone.trim() ? normalizePhone(body.phone) : "";
    if (body.details && typeof body.details === "object") patch.details = { ...cur.details, ...body.details };
    if ("depositPaid" in body) { patch.deposit_paid = !!body.depositPaid; if (body.depositPaid && cur.status === "pending") patch.status = "confirmed"; }
    if (typeof body.status === "string") {
      if (!["pending", "confirmed", "completed", "cancelled", "no_show"].includes(body.status)) throw new HttpError(400, "Bad status");
      patch.status = body.status;
    }
    if (body.start != null || body.durationMin != null) {
      const start = body.start != null ? Number(body.start) : cur.start_ms;
      const dur = body.durationMin != null ? Number(body.durationMin) : (cur.end_ms - cur.start_ms) / 60000;
      if (!Number.isFinite(start) || !(dur > 0)) throw new HttpError(400, "Bad time");
      const end = start + dur * 60000;
      if (!body.force && overlaps(start, end, busyBetween(start - DAY, end + DAY, cur.id))) throw new HttpError(409, "That overlaps something on your calendar.");
      patch.start_ms = start; patch.end_ms = end;
    }
    Object.assign(cur, patch, { updated_at: Date.now(), cal_sync: calState(st) });
    if (st.apple?.bookingCal) cur.cal_seq++;
    save();
    return { booking: cur };
  }

  if (method === "POST" && a === "/blocks") {
    if (!(Number(body.end) > Number(body.start))) throw new HttpError(400, "End must be after start");
    const id = st.nextBlock++;
    st.blocks.push({ id, start_ms: Number(body.start), end_ms: Number(body.end), label: String(body.label ?? "").slice(0, 80) || null }); save();
    return [201, { id }];
  }
  m = /^\/blocks\/(\d+)$/.exec(a);
  if (m && method === "DELETE") { st.blocks = st.blocks.filter(b => b.id !== Number(m[1])); save(); return { ok: true }; }

  if (method === "PUT" && a === "/hours") {
    const okWin = w => Array.isArray(w) && w.every(x => x && /^\d{2}:\d{2}$/.test(x.start) && /^\d{2}:\d{2}$/.test(x.end) && x.end > x.start);
    if (!Array.isArray(body.weekly) || body.weekly.length !== 7 || !body.weekly.every(okWin)) throw new HttpError(400, "Bad hours");
    st.settings.hours = { weekly: body.weekly, overrides: body.overrides ?? {} }; save();
    return { hours: hours() };
  }
  if (method === "PUT" && a === "/rules") {
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
    st.settings.rules = { stepMin: clamp(body.stepMin, 15, 120), bufferMin: clamp(body.bufferMin, 0, 120), minNoticeMin: clamp(body.minNoticeMin, 0, 7 * 1440), maxDaysOut: clamp(body.maxDaysOut, 7, 365) }; save();
    return { rules: rules() };
  }
  if (method === "PUT" && a === "/services") {
    const cur = new Map(services().map(s => [s.id, s]));
    if (!Array.isArray(body.services)) throw new HttpError(400, "Bad services");
    st.settings.services = body.services.filter(s => cur.has(s.id)).map(s => ({
      ...cur.get(s.id), name: String(s.name || cur.get(s.id).name).slice(0, 60), blurb: String(s.blurb ?? cur.get(s.id).blurb).slice(0, 240),
      durationMin: Math.min(720, Math.max(15, Math.round(Number(s.durationMin) || 60))), online: !!s.online,
    }));
    save();
    return { services: services() };
  }
  if (method === "PUT" && a === "/business") {
    const s = (v, n = 120) => String(v ?? "").trim().slice(0, n);
    const b = business();
    st.settings.business = {
      ...b, name: s(body.name, 60) || b.name, phone: s(body.phone, 30), instagram: s(body.instagram, 40).replace(/^@/, ""), city: s(body.city, 60),
      locations: (Array.isArray(body.locations) ? body.locations : []).slice(0, 4).map(l => ({ label: s(l.label, 40), address: s(l.address, 160) })).filter(l => l.address),
      depositAmount: Math.max(0, Math.round(Number(body.depositAmount) || 0)), depositNote: s(body.depositNote, 240),
      depositMethods: (Array.isArray(body.depositMethods) ? body.depositMethods : []).slice(0, 4).map(d => ({ label: s(d.label, 30), value: s(d.value, 60) })).filter(d => d.label && d.value),
    };
    save();
    return { business: business() };
  }
  if (method === "POST" && a === "/passcode") throw new HttpError(400, "The preview passcode stays 2477. Chris sets his own on the live app.");

  if (method === "POST" && a === "/calendar/connect") {
    if (typeof body.appleId !== "string" || !body.appleId.includes("@")) throw new HttpError(400, "Enter your Apple ID email and app-specific password");
    st.apple = { appleId: body.appleId.trim(), bookingCal: null, busyCals: DEMO_CALS.map(c => c.url), connectedAt: Date.now() }; save();
    return { calendars: DEMO_CALS, apple: appleStatus() };
  }
  if (method === "GET" && a === "/calendar/list") {
    if (!st.apple) throw new HttpError(409, "Apple Calendar is not connected");
    return { calendars: [...DEMO_CALS, ...(st.apple.extra ?? [])] };
  }
  if (method === "POST" && a === "/calendar/create") {
    const cal = { url: "demo://bookings", name: String(body.name || "C-Lux Customs Bookings").slice(0, 60), color: "#e11d2a" };
    st.apple.extra = [cal]; save();
    return [201, { calendar: cal }];
  }
  if (method === "POST" && a === "/calendar/select") {
    st.apple.bookingCal = body.bookingCal; st.apple.busyCals = body.busyCals ?? []; st.apple.lastSyncAt = Date.now();
    st.bookings.forEach(b => (b.cal_sync = "ok")); save();
    return { apple: appleStatus() };
  }
  if (method === "POST" && a === "/calendar/disconnect") { st.apple = null; st.bookings.forEach(b => (b.cal_sync = "none")); save(); return { apple: appleStatus() }; }
  if (method === "POST" && a === "/calendar/resync") { if (st.apple) st.apple.lastSyncAt = Date.now(); save(); return { apple: appleStatus() }; }
  if (method === "POST" && a === "/calendar/feed-rotate") return { feedUrl: feedUrl() };

  throw new HttpError(404, "Not found");
}

// ---------- fetch shim ----------
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url, location.href);
  if (url.origin !== location.origin || !url.pathname.includes("/api/")) return realFetch(input, init);
  let body = {};
  try { body = init.body ? JSON.parse(init.body) : {}; } catch {}
  await new Promise(r => setTimeout(r, 120)); // feel like a network
  try {
    const out = route((init.method || "GET").toUpperCase(), url, body);
    const [status, json] = Array.isArray(out) ? out : [200, out];
    return new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (!(e instanceof HttpError)) console.error(e);
    return new Response(JSON.stringify({ error: e instanceof HttpError ? e.message : "Something went wrong" }), { status, headers: { "Content-Type": "application/json" } });
  }
};

// "Add to my calendar" on the confirmation: build the .ics here instead of from the server.
document.addEventListener("click", e => {
  const link = e.target.closest?.('a[href*="/api/booking/"]');
  if (!link) return;
  e.preventDefault();
  const token = /\/api\/booking\/([\w-]+)\.ics/.exec(link.getAttribute("href"))?.[1];
  const b = load().bookings.find(x => x.token === token);
  if (!b) return;
  const biz = business();
  const svc = b.services.map(s => s.name).join(" + ");
  const ics = buildCalendar([{
    uid: `clux-${b.ref}@cluxcustoms`, start: b.start_ms, end: b.end_ms, summary: `${svc} at ${biz.name}`,
    description: `Ref ${b.ref}\nQuestions? Call or text ${biz.owner} at ${biz.phone}.`,
    location: b.details.address || biz.locations[0]?.address || biz.city, alarmMin: 120, status: "CONFIRMED", sequence: 0,
  }]);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = `${b.ref}.ics`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}, true);

// ---------- preview ribbon ----------
function ribbon() {
  const inApp = location.pathname.includes("/app/");
  const el = document.createElement("div");
  el.className = "demo-ribbon";
  el.innerHTML = inApp
    ? `<span><b>Preview</b> · sample data · passcode <b>${PASSCODE}</b></span><button type="button" data-reset>Reset</button>`
    : `<span><b>Preview</b> · bookings here are test-only</span><a href="app/">Shop app →</a>`;
  document.body.appendChild(el);
  el.querySelector("[data-reset]")?.addEventListener("click", () => {
    if (!confirm("Reset the preview back to the sample bookings?")) return;
    ls.del(KEY); location.reload();
  });
  if (inApp) { const c = document.getElementById("code"); if (c) c.placeholder = PASSCODE; }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ribbon); else ribbon();
