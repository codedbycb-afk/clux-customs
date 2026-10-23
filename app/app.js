// C-Lux Shop — Chris's booking manager. Talks to /api/app/*.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const digits = p => (p || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
const DAY = 86400000;

let ME = null;          // /api/app/me
const BK = new Map();   // id -> booking, for tap handlers
const S = { tab: "today", calMonth: "", calSel: "", seg: "upcoming", q: "" };

// ---------- time (shop timezone) ----------
const tz = () => ME?.tz || "America/New_York";
function offsetMin(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz(), hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / 60000);
}
function toUtc(date, hm) {
  const [y, m, d] = date.split("-").map(Number), [h, mi] = hm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const o1 = offsetMin(guess); let t = guess - o1 * 60000;
  const o2 = offsetMin(t); if (o2 !== o1) t = guess - o2 * 60000;
  return t;
}
const localDate = ms => new Date(ms).toLocaleDateString("en-CA", { timeZone: tz() });
const localHm = ms => new Date(ms).toLocaleTimeString("en-GB", { timeZone: tz(), hour: "2-digit", minute: "2-digit" });
const today = () => localDate(Date.now());
const addDays = (date, n) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10); };
const tm = ms => new Date(ms).toLocaleTimeString("en-US", { timeZone: tz(), hour: "numeric", minute: "2-digit" });
const dlong = ms => new Date(ms).toLocaleDateString("en-US", { timeZone: tz(), weekday: "long", month: "long", day: "numeric" });
const dshort = date => new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const dur = m => m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
const weekdayOf = date => new Date(date + "T12:00:00Z").getUTCDay();

// ---------- api / ui helpers ----------
async function api(path, opts = {}) {
  const r = await fetch("/api/app" + path, {
    ...opts, headers: opts.body ? { "Content-Type": "application/json" } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: "same-origin",
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== "/login" && path !== "/passcode") { showLogin(); throw new Error("Signed out"); }
  if (!r.ok) throw Object.assign(new Error(j.error || "Something went wrong"), { status: r.status });
  return j;
}
let toastT;
function toast(msg, bad = false) {
  const t = $("#toast"); t.textContent = msg; t.className = "toast show" + (bad ? " bad" : "");
  clearTimeout(toastT); toastT = setTimeout(() => (t.className = "toast"), 2600);
}
function sheet(html, onMount) {
  const s = $("#sheet");
  s.innerHTML = `<div class="grab"></div>${html}`;
  $("#sheetWrap").hidden = false;
  s.scrollTop = 0;
  onMount?.(s);
}
const closeSheet = () => { $("#sheetWrap").hidden = true; $("#sheet").innerHTML = ""; };
$("#sheetWrap").addEventListener("click", e => { if (e.target.closest("[data-close]")) closeSheet(); });
const head = (title, sub = "") => `<div class="sheet-head"><div><h3>${title}</h3>${sub ? `<p class="muted" style="margin:6px 0 0">${sub}</p>` : ""}</div><button class="x" data-close aria-label="Close">✕</button></div>`;
async function busy(btn, fn) {
  const label = btn.innerHTML; btn.disabled = true;
  try { await fn(); } catch (e) { if (e.message !== "Signed out") toast(e.message, true); } finally { btn.disabled = false; btn.innerHTML = label; }
}

const STATUS = { pending: "Deposit due", confirmed: "Confirmed", completed: "Done", cancelled: "Cancelled", no_show: "No-show" };
const statusChip = b => {
  const s = b.status === "pending" && b.deposit_paid ? "confirmed" : b.status;
  return `<span class="chip ${s}">${STATUS[s]}</span>`;
};
const svcNames = b => b.services.map(s => s.name).join(" + ");

function bkRow(b, showDate = false) {
  BK.set(b.id, b);
  return `<button class="bk ${b.status}" data-bk="${b.id}">
    <span class="t">${tm(b.start_ms).replace(/:00(?= )/, "")}<small>${showDate ? dshort(localDate(b.start_ms)) : dur((b.end_ms - b.start_ms) / 60000)}</small></span>
    <span class="who"><b>${esc(b.name)}</b><span>${esc(svcNames(b))}${b.details.vehicle ? " · " + esc(b.details.vehicle) : ""}</span></span>
    ${statusChip(b)}
  </button>`;
}
const appleRow = e => `<div class="bk apple"><span class="t">${e.allDay ? "All day" : tm(e.start).replace(/:00(?= )/, "")}<small>${e.allDay ? "" : dur(Math.round((e.end - e.start) / 60000))}</small></span>
  <span class="who"><b>${esc(e.summary || "Busy")}</b><span>${esc(e.calendar || "Apple Calendar")} · blocks booking</span></span><span class="chip">Apple</span></div>`;
const blockRow = b => `<div class="bk block"><span class="t">${tm(b.start_ms).replace(/:00(?= )/, "")}<small>${dur(Math.round((b.end_ms - b.start_ms) / 60000))}</small></span>
  <span class="who"><b>${esc(b.label || "Blocked")}</b><span>No online bookings</span></span><button class="chip" data-unblock="${b.id}">Remove</button></div>`;

document.addEventListener("click", e => {
  const r = e.target.closest("[data-bk]");
  if (r && BK.has(+r.dataset.bk)) openBooking(BK.get(+r.dataset.bk));
});

// ---------- auth ----------
function showLogin() {
  $("#shell").hidden = true; $("#login").hidden = false; closeSheet();
  setTimeout(() => $("#code").focus(), 50);
}
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("#loginErr").textContent = "";
  try {
    await api("/login", { method: "POST", body: { code: $("#code").value } });
    $("#code").value = "";
    await boot();
  } catch (err) { $("#loginErr").textContent = err.message; }
});

// ---------- tabs ----------
$("#tabs").addEventListener("click", e => {
  const b = e.target.closest("[data-tab]"); if (!b) return;
  S.tab = b.dataset.tab; render();
});
$("#newBtn").addEventListener("click", () => openNew({ date: S.tab === "calendar" ? S.calSel : today() }));

async function render() {
  $$("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === S.tab));
  const v = $("#view");
  v.style.animation = "none"; void v.offsetWidth; v.style.animation = "";
  try {
    if (S.tab === "today") await renderToday(v);
    if (S.tab === "calendar") await renderCalendar(v);
    if (S.tab === "bookings") await renderBookings(v);
    if (S.tab === "settings") renderSettings(v);
  } catch (e) { if (e.message !== "Signed out") v.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
const refresh = () => render();

// ---------- today ----------
async function renderToday(v) {
  const t = today(), from = toUtc(t, "00:00"), to = toUtc(addDays(t, 8), "00:00");
  const [ag, pend] = await Promise.all([
    api(`/agenda?from=${from}&to=${to}`),
    api(`/bookings?status=pending&from=${Date.now()}`),
  ]);
  const live = ag.bookings.filter(b => !["cancelled", "no_show"].includes(b.status));
  const todays = live.filter(b => localDate(b.start_ms) === t);
  const next = live.find(b => b.end_ms > Date.now());
  const due = pend.bookings.filter(b => !b.deposit_paid);
  const apple = ME.apple;
  const calOk = apple.connected && apple.bookingCal;
  const appleToday = ag.apple.filter(e => localDate(e.start) === t || (e.start < from && e.end > from));

  const todayItems = [...todays.map(b => ({ at: b.start_ms, html: bkRow(b) })), ...appleToday.map(e => ({ at: e.start, html: appleRow(e) }))]
    .sort((a, b) => a.at - b.at).map(x => x.html).join("");

  let upcoming = "";
  for (let i = 1; i < 8; i++) {
    const d = addDays(t, i);
    const list = live.filter(b => localDate(b.start_ms) === d);
    if (list.length) upcoming += `<p class="daylabel">${dshort(d)}</p><div class="list">${list.map(b => bkRow(b)).join("")}</div>`;
  }

  v.innerHTML = `
    <div class="hello"><div><h1>${greeting()}, ${esc(ME.business.owner)}.</h1><p>${dlong(Date.now())}</p></div></div>
    <div class="stats">
      <div class="stat"><b>${todays.length}</b><span>Today</span></div>
      <button class="stat ${due.length ? "alert" : ""}" id="dueStat"><b>${due.length}</b><span>Deposits due</span></button>
      <div class="stat"><b>${live.length}</b><span>Next 7 days</span></div>
    </div>
    ${!calOk ? `<button class="banner" id="calBanner"><span class="ic">!</span><span><b>Connect Apple Calendar</b><span>Two-way sync: bookings land on your iPhone, and changes you make there come back here.</span></span></button>` : ""}
    ${apple.connected && apple.lastError ? `<button class="banner" id="calBanner"><span class="ic">!</span><span><b>Calendar sync problem</b><span>${esc(apple.lastError)}</span></span></button>` : ""}
    ${next ? `<button class="next" data-bk="${next.id}"><span class="k">${next.start_ms <= Date.now() ? "In the bay now" : "Up next"}</span><h3>${esc(next.name)}</h3><p>${esc(svcNames(next))} · ${localDate(next.start_ms) === t ? tm(next.start_ms) : dshort(localDate(next.start_ms)) + ", " + tm(next.start_ms)}</p></button>` : ""}
    <h2>Today</h2>
    ${todayItems ? `<div class="list">${todayItems}</div>` : `<div class="empty">Nothing booked today.</div>`}
    ${upcoming ? `<h2>Coming up</h2>${upcoming}` : ""}`;
  if (next) BK.set(next.id, next);
  $("#dueStat").onclick = () => { S.tab = "bookings"; S.seg = "deposit"; render(); };
  $$("#calBanner").forEach(b => (b.onclick = openApple));
}
const greeting = () => { const h = +localHm(Date.now()).slice(0, 2); return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening"; };

// ---------- calendar ----------
async function renderCalendar(v) {
  if (!S.calMonth) { S.calMonth = today().slice(0, 7); S.calSel = today(); }
  const [y, m] = S.calMonth.split("-").map(Number);
  const first = `${S.calMonth}-01`;
  const startPad = weekdayOf(first);
  const gridStart = addDays(first, -startPad);
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Math.ceil((startPad + daysIn) / 7) * 7;
  const from = toUtc(gridStart, "00:00"), to = toUtc(addDays(gridStart, cells), "00:00");
  const ag = await api(`/agenda?from=${from}&to=${to}`);
  const byDay = {};
  for (const b of ag.bookings) if (b.status !== "cancelled") (byDay[localDate(b.start_ms)] ??= { b: 0, a: 0 }).b++;
  for (const e of ag.apple) (byDay[localDate(e.start)] ??= { b: 0, a: 0 }).a++;
  const t = today();
  let grid = "";
  for (let i = 0; i < cells; i++) {
    const d = addDays(gridStart, i);
    const c = byDay[d];
    const closed = !(ME.hours.overrides[d] ?? ME.hours.weekly[weekdayOf(d)])?.length;
    const dots = c ? `${"<i></i>".repeat(Math.min(c.b, 3))}${c.a ? '<i class="a"></i>' : ""}` : "";
    grid += `<button class="d ${d.slice(0, 7) !== S.calMonth ? "other" : ""} ${d === t ? "today" : ""} ${d === S.calSel ? "sel" : ""} ${closed ? "closed" : ""}" data-d="${d}">${+d.slice(8)}<span class="dots">${dots}</span></button>`;
  }
  const sel = S.calSel;
  const sFrom = toUtc(sel, "00:00"), sTo = toUtc(addDays(sel, 1), "00:00");
  const items = [
    ...ag.bookings.filter(b => b.start_ms < sTo && b.end_ms > sFrom).map(b => ({ at: b.start_ms, html: bkRow(b) })),
    ...ag.blocks.filter(b => b.start_ms < sTo && b.end_ms > sFrom).map(b => ({ at: b.start_ms, html: blockRow(b) })),
    ...ag.apple.filter(e => e.start < sTo && e.end > sFrom).map(e => ({ at: e.start, html: appleRow(e) })),
  ].sort((a, b) => a.at - b.at).map(x => x.html).join("");
  const w = ME.hours.overrides[sel] ?? ME.hours.weekly[weekdayOf(sel)] ?? [];
  const hoursTxt = w.length ? w.map(x => `${tm(toUtc(sel, x.start))} – ${tm(toUtc(sel, x.end))}`).join(", ") : "Closed";

  v.innerHTML = `
    <div class="cal-head"><button class="icon" id="pm" aria-label="Previous month">‹</button>
      <h1>${new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</h1>
      <button class="icon" id="nm" aria-label="Next month">›</button></div>
    <div class="dow"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
    <div class="grid" id="grid">${grid}</div>
    <h2>${dshort(sel)} · <span style="font-weight:600">${hoursTxt}</span></h2>
    <div class="day-actions"><button class="btn sm" id="addHere">+ Booking</button><button class="btn sm" id="blockHere">Block time</button></div>
    ${items ? `<div class="list">${items}</div>` : `<div class="empty">Nothing on this day.</div>`}`;
  const shift = n => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); S.calMonth = d.toISOString().slice(0, 7); S.calSel = S.calMonth === t.slice(0, 7) ? t : `${S.calMonth}-01`; render(); };
  $("#pm").onclick = () => shift(-1); $("#nm").onclick = () => shift(1);
  $("#grid").onclick = e => { const b = e.target.closest("[data-d]"); if (!b) return; S.calSel = b.dataset.d; if (S.calSel.slice(0, 7) !== S.calMonth) S.calMonth = S.calSel.slice(0, 7); render(); };
  $("#addHere").onclick = () => openNew({ date: sel });
  $("#blockHere").onclick = () => openBlock(sel);
  v.onclick = async e => {
    const u = e.target.closest("[data-unblock]"); if (!u) return;
    await api(`/blocks/${u.dataset.unblock}`, { method: "DELETE" }); toast("Block removed"); render();
  };
}

// ---------- bookings ----------
async function renderBookings(v) {
  const now = Date.now();
  const q = encodeURIComponent(S.q);
  const queries = {
    upcoming: `/bookings?from=${now}&status=pending,confirmed&q=${q}`,
    deposit: `/bookings?from=${now - DAY}&status=pending&q=${q}`,
    past: `/bookings?to=${now}&status=confirmed,completed,no_show,pending&q=${q}`,
    cancelled: `/bookings?status=cancelled&q=${q}`,
  };
  const r = await api(queries[S.seg]);
  let list = r.bookings;
  if (S.seg === "deposit") list = list.filter(b => !b.deposit_paid);
  if (S.seg === "past" || S.seg === "cancelled") list = list.reverse();
  let html = "", last = "";
  for (const b of list) {
    const d = localDate(b.start_ms);
    if (d !== last) { html += `${last ? "</div>" : ""}<p class="daylabel">${dshort(d)}</p><div class="list">`; last = d; }
    html += bkRow(b);
  }
  if (last) html += "</div>";
  v.innerHTML = `
    <h1>Bookings</h1>
    <input class="input" id="q" placeholder="Search name, phone, car, ref" value="${esc(S.q)}" style="margin-top:14px" autocomplete="off">
    <div class="seg" id="seg">${[["upcoming", "Upcoming"], ["deposit", "Deposit due"], ["past", "Past"], ["cancelled", "Cancelled"]]
      .map(([k, l]) => `<button data-s="${k}" class="${S.seg === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div id="bkList">${html || `<div class="empty">No bookings here.</div>`}</div>`;
  $("#seg").onclick = e => { const b = e.target.closest("[data-s]"); if (b) { S.seg = b.dataset.s; render(); } };
  let deb;
  $("#q").oninput = e => { clearTimeout(deb); deb = setTimeout(async () => { S.q = e.target.value; const pos = e.target.selectionStart; await render(); const qi = $("#q"); qi.focus(); qi.setSelectionRange(pos, pos); }, 250); };
}

// ---------- booking detail ----------
const ICON = {
  call: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
  text: '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  ig: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/></svg>',
};

function openBooking(b) {
  const ph = digits(b.phone);
  const syncTxt = { ok: ['ok', "On your Apple Calendar (move or delete it there and it updates here)"], pending: ['warn', "Sending to Apple Calendar…"], error: ['bad', "Calendar sync failed: " + (b.cal_error || "")], none: ['', "Apple Calendar not connected"] }[b.cal_sync] ?? ['', ""];
  const first = b.name.split(" ")[0];
  const when = `${dlong(b.start_ms)}, ${tm(b.start_ms)}`;
  const depText = encodeURIComponent(`Hey ${first}, it's ${ME.business.owner} from ${ME.business.name}. You're booked for ${svcNames(b)} on ${when}. ${ME.business.depositAmount ? `To lock it in, send the $${ME.business.depositAmount} deposit${ME.business.depositMethods.length ? " to " + ME.business.depositMethods.map(m => `${m.label} ${m.value}`).join(" or ") : ""} with ${b.ref} in the note.` : ""}`);
  const remindText = encodeURIComponent(`Hey ${first}, reminder from ${ME.business.name}: ${svcNames(b)} on ${when}. See you then!`);
  const live = !["cancelled", "no_show", "completed"].includes(b.status);
  sheet(`
    ${head(esc(b.name), `${statusChip(b)} <span style="margin-left:6px">${esc(b.ref)}</span>`)}
    <div class="kv">
      <div><span>When</span><b>${when}</b></div>
      <div><span>Length</span><b>${dur((b.end_ms - b.start_ms) / 60000)} · until ${tm(b.end_ms)}</b></div>
      <div><span>Work</span><b>${esc(svcNames(b))}</b></div>
      ${b.details.vehicle ? `<div><span>Vehicle</span><b>${esc(b.details.vehicle)}</b></div>` : ""}
      ${b.details.shade || b.details.film ? `<div><span>Tint</span><b>${esc([b.details.shade, b.details.film].filter(Boolean).join(" · "))}</b></div>` : ""}
      ${b.details.address ? `<div><span>Property</span><b>${esc(b.details.address)}</b></div>` : ""}
      <div><span>Phone</span><b>${esc(b.phone || "–")}</b></div>
      ${b.email ? `<div><span>Email</span><b>${esc(b.email)}</b></div>` : ""}
      ${b.notes ? `<div><span>Their note</span><b>${esc(b.notes)}</b></div>` : ""}
      <div><span>Booked</span><b>${b.source === "web" ? "Online" : "By you"} · ${dshort(localDate(b.created_at))}</b></div>
    </div>
    <div class="contact">
      <a class="btn" href="tel:+1${ph}" ${ph ? "" : "hidden"}>${ICON.call}Call</a>
      <a class="btn" href="sms:+1${ph}?&body=${b.deposit_paid ? remindText : depText}" ${ph ? "" : "hidden"}>${ICON.text}${b.deposit_paid ? "Remind" : "Text deposit"}</a>
      ${b.instagram ? `<a class="btn" href="https://ig.me/m/${encodeURIComponent(b.instagram)}" target="_blank" rel="noopener">${ICON.ig}DM</a>` : `<span></span>`}
    </div>
    <label class="toggle">Deposit paid<span class="switch"><input type="checkbox" id="dep" ${b.deposit_paid ? "checked" : ""}><span></span></span></label>
    <label class="f" for="sn">Your notes (private)</label>
    <textarea class="input" id="sn" rows="2" placeholder="Price quoted, film used, follow-up…">${esc(b.shop_notes || "")}</textarea>
    <div class="actions">
      ${live ? `<button class="btn" id="done">✓ Mark done</button><button class="btn" id="move">Reschedule</button>` : `<button class="btn wide" id="reopen">Reopen booking</button>`}
      <div class="wide" id="moveBox" hidden>
        <div class="row"><div><label class="f">Date</label><input class="input" type="date" id="mvD" value="${localDate(b.start_ms)}"></div>
        <div><label class="f">Time</label><input class="input" type="time" id="mvT" step="900" value="${localHm(b.start_ms)}"></div></div>
        <label class="f">Length (minutes)</label><input class="input" type="number" id="mvL" min="15" step="15" value="${(b.end_ms - b.start_ms) / 60000}">
        <button class="btn red block" id="mvSave" style="margin-top:10px">Save new time</button>
      </div>
      ${live ? `<button class="btn" id="noshow">No-show</button><button class="btn danger" id="cancel">Cancel</button>` : ""}
    </div>
    <p class="note" style="margin-top:14px"><span class="dot ${syncTxt[0]}"></span>${esc(syncTxt[1])}</p>`, s => {
    const patch = async (body, msg) => {
      const r = await api(`/bookings/${b.id}`, { method: "PATCH", body });
      toast(msg); BK.set(r.booking.id, r.booking); openBooking(r.booking); refresh();
    };
    $("#dep", s).onchange = e => patch({ depositPaid: e.target.checked }, e.target.checked ? "Deposit marked paid" : "Deposit marked unpaid").catch(err => toast(err.message, true));
    let snT; $("#sn", s).oninput = e => { clearTimeout(snT); snT = setTimeout(() => api(`/bookings/${b.id}`, { method: "PATCH", body: { shop_notes: e.target.value } }).then(r => { BK.set(b.id, r.booking); b.shop_notes = r.booking.shop_notes; toast("Note saved"); }), 700); };
    $("#done", s) && ($("#done", s).onclick = e => busy(e.currentTarget, () => patch({ status: "completed" }, "Marked done")));
    $("#reopen", s) && ($("#reopen", s).onclick = e => busy(e.currentTarget, () => patch({ status: b.deposit_paid ? "confirmed" : "pending" }, "Reopened")));
    $("#noshow", s) && ($("#noshow", s).onclick = e => confirm("Mark as no-show? The slot opens back up.") && busy(e.currentTarget, () => patch({ status: "no_show" }, "Marked no-show")));
    $("#cancel", s) && ($("#cancel", s).onclick = e => confirm(`Cancel ${first}'s booking? It comes off your calendar and the time opens back up.`) && busy(e.currentTarget, () => patch({ status: "cancelled" }, "Booking cancelled")));
    $("#move", s) && ($("#move", s).onclick = () => { $("#moveBox", s).hidden = !$("#moveBox", s).hidden; });
    $("#mvSave", s).onclick = e => busy(e.currentTarget, async () => {
      const body = { start: toUtc($("#mvD", s).value, $("#mvT", s).value), durationMin: +$("#mvL", s).value };
      try { await patch(body, "Rescheduled"); }
      catch (err) {
        if (err.status === 409 && confirm(`${err.message} Move it anyway?`)) await patch({ ...body, force: true }, "Rescheduled");
        else throw err;
      }
    });
  });
}

// ---------- new booking ----------
function openNew({ date }) {
  const chosen = new Set();
  const svcs = ME.services;
  const nextHalf = () => { const hm = localHm(Date.now() + 30 * 60000); const [h, m] = hm.split(":").map(Number); return `${String(h).padStart(2, "0")}:${m < 30 ? "30" : "00"}`; };
  const w = ME.hours.weekly[weekdayOf(date || today())]?.[0];
  sheet(`${head("New booking", "For walk-ins, calls and DMs.")}
    <label class="f">Work</label>
    <div class="picks" id="np">${svcs.map(s => `<button class="pk" data-id="${s.id}">${esc(s.short || s.name)}</button>`).join("")}</div>
    <div class="row"><div><label class="f">Date</label><input class="input" type="date" id="nD" value="${date || today()}"></div>
      <div><label class="f">Time</label><input class="input" type="time" id="nT" step="900" value="${date === today() ? nextHalf() : (w?.start || "10:00")}"></div></div>
    <label class="f">Length (minutes)</label><input class="input" type="number" id="nL" min="15" step="15" placeholder="Auto from the work you pick">
    <div class="row"><div><label class="f">Name</label><input class="input" id="nN" autocomplete="off"></div>
      <div><label class="f">Phone</label><input class="input" id="nP" type="tel" inputmode="tel"></div></div>
    <label class="f">Vehicle / address</label><input class="input" id="nV" placeholder="2020 Charger, or the property address">
    <label class="f">Instagram</label><input class="input" id="nI" placeholder="@handle" autocomplete="off">
    <label class="f">Notes</label><textarea class="input" id="nNotes" rows="2"></textarea>
    <label class="toggle">Deposit already paid<span class="switch"><input type="checkbox" id="nDep"><span></span></span></label>
    <p class="err" id="nErr"></p>
    <button class="btn red block" id="nSave">Add booking</button>`, s => {
    $("#np", s).onclick = e => {
      const b = e.target.closest(".pk"); if (!b) return;
      chosen.has(b.dataset.id) ? chosen.delete(b.dataset.id) : chosen.add(b.dataset.id);
      b.classList.toggle("on");
      $("#nL", s).placeholder = chosen.size ? `${[...chosen].reduce((n, id) => n + svcs.find(x => x.id === id).durationMin, 0)} (auto)` : "Auto from the work you pick";
    };
    $("#nSave", s).onclick = e => busy(e.currentTarget, async () => {
      $("#nErr", s).textContent = "";
      if (!chosen.size) { $("#nErr", s).textContent = "Pick the work."; return; }
      const isProp = [...chosen].every(id => svcs.find(x => x.id === id).kind === "property");
      const body = {
        services: [...chosen], start: toUtc($("#nD", s).value, $("#nT", s).value),
        durationMin: +$("#nL", s).value || undefined, name: $("#nN", s).value, phone: $("#nP", s).value,
        instagram: $("#nI", s).value, notes: $("#nNotes", s).value, depositPaid: $("#nDep", s).checked,
        details: isProp ? { address: $("#nV", s).value } : { vehicle: $("#nV", s).value },
      };
      try { await api("/bookings", { method: "POST", body }); }
      catch (err) {
        if (err.status === 409 && confirm(`${err.message} Book it anyway?`)) await api("/bookings", { method: "POST", body: { ...body, force: true } });
        else { $("#nErr", s).textContent = err.message; return; }
      }
      closeSheet(); toast("Booking added"); refresh();
    });
  });
}

// ---------- block time ----------
function openBlock(date) {
  sheet(`${head("Block time", "Online booking won't offer these hours.")}
    <label class="f">Date</label><input class="input" type="date" id="bD" value="${date}">
    <label class="toggle">All day<span class="switch"><input type="checkbox" id="bAll" checked><span></span></span></label>
    <div class="row" id="bTimes" hidden><div><label class="f">From</label><input class="input" type="time" id="bS" value="12:00" step="900"></div>
      <div><label class="f">To</label><input class="input" type="time" id="bE" value="14:00" step="900"></div></div>
    <label class="f">Days</label><input class="input" type="number" id="bN" min="1" max="30" value="1">
    <label class="f">Label</label><input class="input" id="bL" placeholder="Day off, lunch, out of town…">
    <button class="btn red block" id="bSave" style="margin-top:16px">Block it</button>`, s => {
    $("#bAll", s).onchange = e => { $("#bTimes", s).hidden = e.target.checked; };
    $("#bSave", s).onclick = e => busy(e.currentTarget, async () => {
      const d = $("#bD", s).value, n = Math.max(1, +$("#bN", s).value || 1), all = $("#bAll", s).checked;
      for (let i = 0; i < n; i++) {
        const day = addDays(d, i);
        const start = all ? toUtc(day, "00:00") : toUtc(day, $("#bS", s).value);
        const end = all ? toUtc(addDays(day, 1), "00:00") : toUtc(day, $("#bE", s).value);
        await api("/blocks", { method: "POST", body: { start, end, label: $("#bL", s).value } });
      }
      closeSheet(); toast(n > 1 ? `${n} days blocked` : "Time blocked"); refresh();
    });
  });
}

// ---------- settings ----------
function renderSettings(v) {
  const a = ME.apple;
  const calLine = !a.connected ? '<span class="dot bad"></span>Not connected'
    : !a.bookingCal ? '<span class="dot warn"></span>Pick a calendar'
    : a.lastError ? `<span class="dot bad"></span>${esc(a.lastError)}` : `<span class="dot ok"></span>Two-way sync with “${esc(a.bookingCal.name)}”`;
  const openDays = ME.hours.weekly.filter(w => w.length).length;
  v.innerHTML = `<h1>Settings</h1>
    <h2>Calendar</h2>
    <div class="set"><button class="set-item" id="sApple"><div><b>Apple Calendar</b><span>${calLine}</span></div></button></div>
    <h2>Booking</h2>
    <div class="set">
      <button class="set-item" id="sHours"><div><b>Hours</b><span>Open ${openDays} days a week</span></div></button>
      <button class="set-item" id="sRules"><div><b>Booking rules</b><span>${Math.round(ME.rules.minNoticeMin / 60)}h notice · ${ME.rules.bufferMin} min between jobs · ${ME.rules.maxDaysOut} days out</span></div></button>
      <button class="set-item" id="sSvc"><div><b>Services</b><span>${ME.services.filter(s => s.online).length} bookable online</span></div></button>
    </div>
    <h2>Website</h2>
    <div class="set"><button class="set-item" id="sRev"><div><b>Website changes</b><span>Tell us what to change. It goes live on its own.</span></div></button></div>
    <h2>Shop</h2>
    <div class="set">
      <button class="set-item" id="sShop"><div><b>Shop info &amp; deposit</b><span>${ME.business.locations.length ? esc(ME.business.locations[0].address) : "Add your shop address"}</span></div></button>
      <button class="set-item" id="sSite"><div><b>View booking site</b><span>${location.host}</span></div></button>
      <button class="set-item" id="sPass"><div><b>Change passcode</b><span>Signs out every other device</span></div></button>
    </div>
    <button class="btn block ghost" id="sOut" style="margin-top:22px">Sign out</button>
    <p class="note" style="text-align:center;margin-top:18px">Built by Twenty47 Marketing</p>`;
  $("#sApple").onclick = openApple; $("#sHours").onclick = openHours; $("#sRules").onclick = openRules;
  $("#sSvc").onclick = openServices; $("#sShop").onclick = openShop; $("#sPass").onclick = openPass;
  $("#sSite").onclick = () => window.open("../", "_blank");
  $("#sRev").onclick = openRevisions;
  $("#sOut").onclick = async () => { await api("/logout", { method: "POST" }); showLogin(); };
}
async function reloadMe() { ME = await api("/me"); }

function openHours() {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const order = [1, 2, 3, 4, 5, 6, 0];
  sheet(`${head("Hours", "When customers can book online.")}
    ${order.map(d => { const w = ME.hours.weekly[d][0]; return `<div class="hours-row ${w ? "" : "off"}" data-d="${d}">
      <b>${names[d]}</b><span class="switch"><input type="checkbox" ${w ? "checked" : ""}><span></span></span>
      <input class="input" type="time" step="900" value="${w?.start || "10:00"}" aria-label="${names[d]} open">
      <input class="input" type="time" step="900" value="${w?.end || "18:00"}" aria-label="${names[d]} close"></div>`; }).join("")}
    <p class="note">Need a day off? Use <b>Block time</b> on the Calendar tab. Anything on your Apple Calendar also blocks bookings once it's connected.</p>
    <button class="btn red block" id="hSave">Save hours</button>`, s => {
    $$(".hours-row input[type=checkbox]", s).forEach(c => (c.onchange = () => c.closest(".hours-row").classList.toggle("off", !c.checked)));
    $("#hSave", s).onclick = e => busy(e.currentTarget, async () => {
      const weekly = [[], [], [], [], [], [], []];
      for (const r of $$(".hours-row", s)) {
        const [on, st, en] = $$("input", r);
        if (on.checked) { if (en.value <= st.value) throw new Error(`${names[r.dataset.d]}: closing time must be after opening`); weekly[r.dataset.d] = [{ start: st.value, end: en.value }]; }
      }
      await api("/hours", { method: "PUT", body: { weekly, overrides: ME.hours.overrides } });
      await reloadMe(); closeSheet(); toast("Hours saved"); refresh();
    });
  });
}

function openRules() {
  const r = ME.rules;
  sheet(`${head("Booking rules")}
    <label class="f">Minimum notice (hours)</label><input class="input" type="number" id="rN" min="0" step="1" value="${r.minNoticeMin / 60}">
    <p class="note">Set to 0 to allow same-day bookings right up to the minute.</p>
    <label class="f">Gap between jobs (minutes)</label><input class="input" type="number" id="rB" min="0" step="5" value="${r.bufferMin}">
    <label class="f">Start times every</label><select class="input" id="rS">${[15, 30, 60].map(n => `<option value="${n}" ${n === r.stepMin ? "selected" : ""}>${n} minutes</option>`).join("")}</select>
    <label class="f">How far ahead people can book (days)</label><input class="input" type="number" id="rM" min="7" max="365" value="${r.maxDaysOut}">
    <button class="btn red block" id="rSave" style="margin-top:16px">Save</button>`, s => {
    $("#rSave", s).onclick = e => busy(e.currentTarget, async () => {
      await api("/rules", { method: "PUT", body: { minNoticeMin: +$("#rN", s).value * 60, bufferMin: +$("#rB", s).value, stepMin: +$("#rS", s).value, maxDaysOut: +$("#rM", s).value } });
      await reloadMe(); closeSheet(); toast("Rules saved"); refresh();
    });
  });
}

function openServices() {
  sheet(`${head("Services", "Length decides how much of the calendar each job takes.")}
    ${ME.services.map(x => `<div class="svc-row" data-id="${x.id}">
      <input class="input" value="${esc(x.name)}" data-k="name" aria-label="Name">
      <div class="row"><div><label class="f">Minutes</label><input class="input" type="number" min="15" step="15" value="${x.durationMin}" data-k="durationMin"></div>
      <label class="toggle" style="margin-top:34px">Online<span class="switch"><input type="checkbox" data-k="online" ${x.online ? "checked" : ""}><span></span></span></label></div>
      <label class="f">Description on the site</label><textarea class="input" rows="2" data-k="blurb">${esc(x.blurb)}</textarea>
    </div>`).join("")}
    <button class="btn red block" id="svSave" style="margin-top:16px">Save services</button>`, s => {
    $("#svSave", s).onclick = e => busy(e.currentTarget, async () => {
      const services = $$(".svc-row", s).map(r => ({
        id: r.dataset.id, name: $("[data-k=name]", r).value, durationMin: +$("[data-k=durationMin]", r).value,
        online: $("[data-k=online]", r).checked, blurb: $("[data-k=blurb]", r).value,
      }));
      await api("/services", { method: "PUT", body: { services } });
      await reloadMe(); closeSheet(); toast("Services saved"); refresh();
    });
  });
}

function openShop() {
  const b = ME.business;
  const loc = i => b.locations[i] || { label: "", address: "" };
  const dm = i => b.depositMethods[i] || { label: "", value: "" };
  sheet(`${head("Shop info & deposit", "Shows on your booking site.")}
    <div class="row"><div><label class="f">Shop name</label><input class="input" id="bName" value="${esc(b.name)}"></div>
      <div><label class="f">Phone</label><input class="input" id="bPhone" value="${esc(b.phone)}"></div></div>
    <div class="row"><div><label class="f">Instagram</label><input class="input" id="bIg" value="${esc(b.instagram)}"></div>
      <div><label class="f">City</label><input class="input" id="bCity" value="${esc(b.city)}"></div></div>
    ${[0, 1].map(i => `<label class="f">Location ${i + 1}${i ? " (optional)" : ""}</label>
      <input class="input" data-loc="${i}" data-k="label" placeholder="Label, e.g. Main shop" value="${esc(loc(i).label)}" style="margin-bottom:6px">
      <input class="input" data-loc="${i}" data-k="address" placeholder="Street, city, ZIP" value="${esc(loc(i).address)}">`).join("")}
    <label class="f">Deposit amount ($)</label><input class="input" type="number" id="bDep" min="0" value="${b.depositAmount}">
    <label class="f">Deposit message</label><textarea class="input" id="bNote" rows="2">${esc(b.depositNote)}</textarea>
    <label class="f">How people pay the deposit</label>
    ${[0, 1, 2].map(i => `<div class="row" style="margin-bottom:6px"><input class="input" data-dm="${i}" data-k="label" placeholder="Cash App" value="${esc(dm(i).label)}"><input class="input" data-dm="${i}" data-k="value" placeholder="$yourtag" value="${esc(dm(i).value)}"></div>`).join("")}
    <button class="btn red block" id="bSave" style="margin-top:14px">Save</button>`, s => {
    $("#bSave", s).onclick = e => busy(e.currentTarget, async () => {
      const grab = (attr, n) => Array.from({ length: n }, (_, i) => ({ label: $(`[data-${attr}="${i}"][data-k=label]`, s).value, [attr === "loc" ? "address" : "value"]: $(`[data-${attr}="${i}"][data-k=${attr === "loc" ? "address" : "value"}]`, s).value }));
      await api("/business", { method: "PUT", body: {
        name: $("#bName", s).value, phone: $("#bPhone", s).value, instagram: $("#bIg", s).value, city: $("#bCity", s).value,
        locations: grab("loc", 2), depositAmount: +$("#bDep", s).value, depositNote: $("#bNote", s).value, depositMethods: grab("dm", 3),
      } });
      await reloadMe(); closeSheet(); toast("Saved. It's live on the site."); refresh();
    });
  });
}

function openPass() {
  sheet(`${head("Change passcode")}
    <label class="f">Current passcode</label><input class="input" type="password" inputmode="numeric" id="pC">
    <label class="f">New passcode</label><input class="input" type="password" inputmode="numeric" id="pN">
    <button class="btn red block" id="pSave" style="margin-top:16px">Change it</button>`, s => {
    $("#pSave", s).onclick = e => busy(e.currentTarget, async () => {
      await api("/passcode", { method: "POST", body: { current: $("#pC", s).value, next: $("#pN", s).value } });
      closeSheet(); toast("Passcode changed");
    });
  });
}

// ---------- website changes ----------
const REV = {
  queued: ["pending", "Waiting"], working: ["pending", "Working on it"], done: ["confirmed", "Live"],
  needs_review: ["", "Not changed"], failed: ["cancelled", "Didn't go through"], cancelled: ["", "Cancelled"],
  undo_requested: ["pending", "Undoing"], undone: ["", "Undone"],
};
let revTimer;

/** Shrink a photo to 1600px JPEG before upload (phone photos are 4–12 MB). */
function shrinkPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Couldn't read that photo"));
    img.src = URL.createObjectURL(file);
  });
}

async function openRevisions() {
  clearTimeout(revTimer);
  const { revisions } = await api("/revisions");
  if ($("#sheetWrap").hidden === false && !$("#revForm")) return; // another sheet opened meanwhile
  const draft = $("#revText")?.value ?? "";
  const row = r => {
    const [cls, label] = REV[r.status] ?? ["", r.status];
    const when = new Date(r.finished_at || r.created_at).toLocaleDateString("en-US", { timeZone: tz(), month: "short", day: "numeric" });
    return `<div class="rev">
      <div class="rev-top"><span class="chip ${cls}">${label}</span><span class="muted">${when}</span></div>
      <p>${esc(r.text)}</p>
      ${r.photos ? `<div class="rev-photos">${Array.from({ length: r.photos }, (_, i) => `<img src="/api/app/revisions/${r.id}/photo/${i + 1}" alt="" loading="lazy">`).join("")}</div>` : ""}
      ${r.result ? `<p class="rev-result">${esc(r.result)}</p>` : ""}
      ${r.status === "queued" ? `<button class="btn sm" data-rev-cancel="${r.id}">Cancel</button>` : ""}
      ${r.status === "done" && r.commit_sha ? `<button class="btn sm" data-rev-undo="${r.id}">Undo this change</button>` : ""}
    </div>`;
  };
  sheet(`${head("Website changes", "Say what you want changed on the site, in your own words. It's done for you and goes live in a few minutes. Every change can be undone.")}
    <form id="revForm">
      <textarea class="input" id="revText" rows="4" maxlength="2000" placeholder="e.g. Add these two photos of the black Charger to the gallery. Change the top line to say “Cleveland's cleanest tint.”">${esc(draft)}</textarea>
      <label class="btn sm block rev-add"><input type="file" id="revPics" accept="image/*" multiple hidden>+ Add photos (up to 6)</label>
      <div class="rev-photos" id="revPrev"></div>
      <button class="btn red block" id="revGo" type="submit">Send change</button>
      <p class="note">Hours, services, address and deposit are in Settings and change instantly there.</p>
    </form>
    <h2>Your changes</h2>
    ${revisions.length ? revisions.map(row).join("") : `<div class="empty">Nothing yet.</div>`}`, s => {
    let pics = [];
    $("#revPics", s).onchange = async e => {
      try {
        const add = await Promise.all([...e.target.files].slice(0, 6 - pics.length).map(shrinkPhoto));
        pics = [...pics, ...add].slice(0, 6);
        $("#revPrev", s).innerHTML = pics.map(d => `<img src="${d}" alt="">`).join("");
      } catch (err) { toast(err.message, true); }
      e.target.value = "";
    };
    $("#revForm", s).onsubmit = e => {
      e.preventDefault();
      busy($("#revGo", s), async () => {
        const text = $("#revText", s).value.trim();
        if (text.length < 3) throw new Error("Tell us what to change");
        await api("/revisions", { method: "POST", body: { text, photos: pics } });
        $("#revText", s).value = "";
        toast("Sent. It'll be live in a few minutes.");
        openRevisions();
      });
    };
    $$("[data-rev-cancel]", s).forEach(b => (b.onclick = () => busy(b, async () => { await api(`/revisions/${b.dataset.revCancel}`, { method: "DELETE" }); openRevisions(); })));
    $$("[data-rev-undo]", s).forEach(b => (b.onclick = () => {
      if (!confirm("Undo this change on the site?")) return;
      busy(b, async () => { await api(`/revisions/${b.dataset.revUndo}/undo`, { method: "POST" }); toast("Undoing…"); openRevisions(); });
    }));
  });
  // Keep the list fresh while something is in progress.
  if (revisions.some(r => ["queued", "working", "undo_requested"].includes(r.status))) {
    revTimer = setTimeout(function tick() {
      if (!$("#revForm")) return;
      // Don't wipe something he's in the middle of typing or picking.
      if ($("#revText").value || $("#revPrev").children.length) { revTimer = setTimeout(tick, 8000); return; }
      openRevisions().catch(() => {});
    }, 8000);
  }
}

// ---------- Apple Calendar ----------
async function openApple() {
  const a = ME.apple;
  const feed = ME.feedUrl.replace(/^https?:/, "webcal:");
  if (!a.connected) {
    sheet(`${head("Connect Apple Calendar", "Two-way sync. New bookings land on your iPhone the second they're made. Drag one to a new time or delete it in Calendar and it changes here too. Anything else on your calendar blocks those times on the site.")}
      <ol class="steps">
        <li>Open <b>account.apple.com</b> and sign in.</li>
        <li>Go to <b>Sign-In and Security → App-Specific Passwords</b>.</li>
        <li>Tap <b>+</b>, name it <b>C-Lux</b>, and copy the password it shows (looks like <b>abcd-efgh-ijkl-mnop</b>).</li>
        <li>Paste it below with your Apple ID email.</li>
      </ol>
      <label class="f">Apple ID email</label><input class="input" id="aId" type="email" autocomplete="username" placeholder="you@icloud.com">
      <label class="f">App-specific password</label><input class="input" id="aPw" autocomplete="off" placeholder="abcd-efgh-ijkl-mnop">
      <p class="err" id="aErr"></p>
      <button class="btn red block" id="aGo">Connect</button>
      <p class="note" style="margin-top:12px">This isn't your real Apple password. It only opens your calendar, and you can revoke it any time from the same page.</p>
      <h2>Or: subscribe only</h2>
      <p class="note">One-way and slower (Apple refreshes it every 15 min or so), and it can't block times. On iPhone: Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar, then paste:</p>
      <div class="copy"><input class="input" readonly value="${esc(feed)}" id="feedUrl"><button class="btn sm" id="cp">Copy</button></div>`, s => {
      $("#cp", s).onclick = () => { navigator.clipboard?.writeText(feed); toast("Copied"); };
      $("#aGo", s).onclick = e => busy(e.currentTarget, async () => {
        $("#aErr", s).textContent = "";
        try {
          const r = await api("/calendar/connect", { method: "POST", body: { appleId: $("#aId", s).value, appPassword: $("#aPw", s).value } });
          await reloadMe(); pickCalendars(r.calendars);
        } catch (err) { $("#aErr", s).textContent = err.message; }
      });
    });
    return;
  }
  sheet(`${head("Apple Calendar", esc(a.appleId))}<div class="empty">Loading your calendars…</div>`);
  try { const r = await api("/calendar/list"); pickCalendars(r.calendars); }
  catch (e) {
    sheet(`${head("Apple Calendar", esc(a.appleId))}<p class="err">${esc(e.message)}</p>
      <button class="btn block" id="aRe">Reconnect</button>`, s => { $("#aRe", s).onclick = async () => { await api("/calendar/disconnect", { method: "POST" }); await reloadMe(); openApple(); }; });
  }
}

function pickCalendars(cals) {
  const a = ME.apple;
  const cur = a.bookingCal?.url;
  const busySet = new Set(a.busyCals ?? cals.map(c => c.url));
  sheet(`${head("Apple Calendar", `<span class="dot ${a.lastError ? "bad" : "ok"}"></span>${esc(a.appleId)}`)}
    ${a.lastError ? `<p class="err">${esc(a.lastError)}</p>` : ""}
    <label class="f">Put new bookings on</label>
    ${cals.map(c => `<label class="cal-opt"><input type="radio" name="bc" value="${esc(c.url)}" ${c.url === cur ? "checked" : ""}><span class="swatch" style="background:${esc(c.color || "#888")}"></span>${esc(c.name)}</label>`).join("")}
    <button class="btn sm block" id="mk" style="margin:4px 0 6px">+ Make a “${esc(ME.business.name)} Bookings” calendar</button>
    <label class="f" style="margin-top:18px">Block open times when these are busy</label>
    ${cals.map(c => `<label class="cal-opt"><input type="checkbox" name="busy" value="${esc(c.url)}" ${busySet.has(c.url) ? "checked" : ""}><span class="swatch" style="background:${esc(c.color || "#888")}"></span>${esc(c.name)}</label>`).join("")}
    <p class="note">Turn off calendars that shouldn't stop people booking (holidays, birthdays, shared family stuff). The bookings calendar always blocks.</p>
    <p class="note">${a.lastPullAt ? `Checked your calendar for changes ${esc(tm(a.lastPullAt))}. ` : ""}Moves and deletes you make in Apple Calendar show up here within 2 minutes.</p>
    <button class="btn red block" id="cSave" style="margin-top:12px">Save</button>
    <div class="actions"><button class="btn" id="cSync">Sync now</button><button class="btn danger" id="cOff">Disconnect</button></div>`, s => {
    $("#mk", s).onclick = e => busy(e.currentTarget, async () => {
      const r = await api("/calendar/create", { method: "POST", body: { name: `${ME.business.name} Bookings` } });
      const list = (await api("/calendar/list")).calendars;
      ME.apple = { ...ME.apple, bookingCal: r.calendar, busyCals: [...(ME.apple.busyCals ?? []), r.calendar.url] };
      pickCalendars(list.some(c => c.url === r.calendar.url) ? list : [...list, r.calendar]);
      toast("Calendar created. Hit Save.");
    });
    $("#cSave", s).onclick = e => busy(e.currentTarget, async () => {
      const bc = $("input[name=bc]:checked", s);
      if (!bc) throw new Error("Pick a calendar for new bookings");
      const chosen = cals.find(c => c.url === bc.value) || ME.apple.bookingCal;
      await api("/calendar/select", { method: "POST", body: { bookingCal: chosen, busyCals: $$("input[name=busy]:checked", s).map(x => x.value) } });
      await reloadMe(); closeSheet(); toast("Apple Calendar is set"); refresh();
    });
    $("#cSync", s).onclick = e => busy(e.currentTarget, async () => { await api("/calendar/resync", { method: "POST" }); await reloadMe(); toast(ME.apple.lastError ? ME.apple.lastError : "Synced", !!ME.apple.lastError); });
    $("#cOff", s).onclick = async () => {
      if (!confirm("Disconnect Apple Calendar? Existing events stay, new bookings won't be added.")) return;
      await api("/calendar/disconnect", { method: "POST" }); await reloadMe(); closeSheet(); toast("Disconnected"); refresh();
    };
  });
}

// ---------- boot ----------
async function boot() {
  try { ME = await api("/me"); } catch { return; }
  $("#login").hidden = true; $("#shell").hidden = false;
  render();
}
boot().catch(() => {});
// Keep "today" fresh when he reopens the app from the home screen.
document.addEventListener("visibilitychange", () => { if (!document.hidden && ME && $("#sheetWrap").hidden) render(); });
// (no service worker in the preview)
