// C-Lux Customs site: content from /api/config, effects, shade picker, booking wizard.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(pointer: fine)").matches;

let CFG = null;
const digits = p => (p || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

// ---------- effects ----------
const io = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
}, { threshold: .18, rootMargin: "0px 0px -6% 0px" });
const observe = root => $$(".reveal, .film", root).forEach(el => io.observe(el));
observe(document);

const nav = $("#nav");
const onScroll = () => nav.classList.toggle("scrolled", scrollY > 20);
addEventListener("scroll", onScroll, { passive: true }); onScroll();

// mobile "Book now" bar hides while the booking section is on screen
const mb = $("#mobileBook");
let bookVisible = false;
const syncMb = () => mb.classList.toggle("hide", bookVisible || scrollY < innerHeight * .7);
new IntersectionObserver(([e]) => { bookVisible = e.isIntersecting; syncMb(); }, { threshold: .05 }).observe($("#book"));
addEventListener("scroll", syncMb, { passive: true }); syncMb();

if (finePointer && !reduced) {
  // hero cards drift with the cursor at different depths
  const hero = $(".hero"), cards = $$("#heroStack .card");
  const depth = [1, -.7, .5];
  hero.addEventListener("pointermove", e => {
    const r = hero.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    cards.forEach((c, i) => {
      const d = depth[i];
      c.style.transform = `translate3d(${x * 30 * d}px, ${y * 24 * d}px, 0) rotateY(${x * 8 * d}deg) rotateX(${-y * 6 * d}deg)`;
    });
  });
  hero.addEventListener("pointerleave", () => cards.forEach(c => (c.style.transform = "")));

  // gallery tilt
  $$(".tilt").forEach(el => {
    el.addEventListener("pointermove", e => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      el.style.transform = `perspective(900px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg)`;
    });
    el.addEventListener("pointerleave", () => (el.style.transform = ""));
  });

  // magnetic buttons
  document.addEventListener("pointermove", e => {
    const b = e.target.closest?.(".magnetic");
    $$(".magnetic").forEach(m => { if (m !== b) m.style.transform = ""; });
    if (!b) return;
    const r = b.getBoundingClientRect();
    b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .18}px, ${(e.clientY - r.top - r.height / 2) * .28}px)`;
  });
}

// spotlight on service cards (event delegation, cards render later)
document.addEventListener("pointermove", e => {
  const c = e.target.closest?.(".svc");
  if (!c) return;
  const r = c.getBoundingClientRect();
  c.style.setProperty("--mx", `${e.clientX - r.left}px`);
  c.style.setProperty("--my", `${e.clientY - r.top}px`);
});

$("#year").textContent = new Date().getFullYear();

// ---------- shade picker ----------
const SHADES = [
  { v: 70, name: "Barely there", desc: "Cuts heat and UV without changing the look.", o: .25 },
  { v: 50, name: "Light smoke", desc: "The darkest you can run on Ohio front doors.", o: .46 },
  { v: 35, name: "Medium", desc: "Privacy in daylight, easy to see out at night.", o: .63 },
  { v: 20, name: "Dark", desc: "You see out, they don't see in.", o: .8 },
  { v: 15, name: "Very dark", desc: "Serious privacy with a sharp, mean look.", o: .88 },
  { v: 5, name: "Limo", desc: "Blacked out. Nobody's seeing in.", o: .965 },
];
const range = $("#shadeRange"), car = $("#car");
const ticks = $("#shadeTicks");
ticks.innerHTML = SHADES.map((s, i) => `<button data-i="${i}">${s.v}%</button>`).join("");
let shadeIdx = 3;
function setShade(i, animate = true) {
  shadeIdx = i;
  const s = SHADES[i];
  range.value = i;
  $("#tint").style.opacity = s.o;
  $("#shadeNum").textContent = s.v;
  $("#bookShadeNum").textContent = s.v;
  $("#shadeName").textContent = s.name;
  $("#shadeDesc").textContent = s.desc;
  const legal = $("#shadeLegal");
  if (s.v >= 50) { legal.textContent = "Street-legal on Ohio front doors"; legal.style.setProperty("--c", "#14894a"); }
  else { legal.textContent = "Ohio: back windows only. Front doors need 50% or lighter."; legal.style.setProperty("--c", "#d98a00"); }
  $$("button", ticks).forEach((b, j) => b.classList.toggle("on", j === i));
  if (animate && !reduced) { car.classList.remove("drive"); void car.getBoundingClientRect(); car.classList.add("drive"); }
}
range.addEventListener("input", () => setShade(+range.value));
ticks.addEventListener("click", e => { const b = e.target.closest("button"); if (b) setShade(+b.dataset.i); });
$$(".swatch").forEach(sw => sw.addEventListener("click", () => {
  $$(".swatch").forEach(x => x.classList.toggle("active", x === sw));
  car.dataset.paint = sw.dataset.paint;
}));
setShade(3, false);

$("#bookShade").addEventListener("click", () => {
  W.services.add("auto-tint");
  W.shade = `${SHADES[shadeIdx].v}%`;
  renderPicks();
});

// ---------- config-driven content ----------
const fmtDur = m => m < 60 ? `${m} min` : `${+(m / 60).toFixed(1).replace(/\.0$/, "")} hr${m >= 120 ? "s" : ""}`;
const fmtHm = hm => {
  const [h, m] = hm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM", h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${ap}` : `${h12} ${ap}`;
};
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function applyBusiness(b) {
  const ph = digits(b.phone);
  $$("[data-biz=phone]").forEach(el => (el.textContent = b.phone));
  $$("[data-biz=city]").forEach(el => (el.textContent = b.city));
  $$("[data-biz=deposit]").forEach(el => (el.textContent = b.depositAmount));
  $$("[data-biz=ig]").forEach(el => (el.textContent = "@" + b.instagram));
  $$("[data-biz-href=sms]").forEach(el => (el.href = `sms:+1${ph}`));
  $$("[data-biz-href=tel]").forEach(el => (el.href = `tel:+1${ph}`));
  $$("[data-biz-href=ig], #igLink").forEach(el => (el.href = `https://www.instagram.com/${b.instagram}/`));
  $("#agreeText").textContent = b.depositAmount > 0
    ? `I understand the $${b.depositAmount} deposit is non-refundable and holds my spot.`
    : "I'll show up on time or let Chris know ahead.";

  const locs = $("#locations");
  locs.innerHTML = b.locations.length
    ? b.locations.map(l => `<div class="loc"><div><b>${esc(l.label || b.name)}</b><span>${esc(l.address)}</span></div>
        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.address)}" target="_blank" rel="noopener">Directions ↗</a></div>`).join("")
    : `<div class="loc"><div><b>${esc(b.city)}</b><span>The exact shop address comes with your booking confirmation.</span></div></div>`;
}

function renderHours(weekly) {
  const order = [1, 2, 3, 4, 5, 6, 0], names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: CFG.tz })).getDay();
  $("#hoursList").innerHTML = order.map(d => {
    const w = weekly[d] || [];
    const t = w.length ? w.map(x => `${fmtHm(x.start)} – ${fmtHm(x.end)}`).join(", ") : "Closed";
    return `<li class="${d === today ? "today" : ""}"><span>${names[d]}</span><span>${t}</span></li>`;
  }).join("");
}

function renderServices(services) {
  $("#serviceGrid").innerHTML = services.map((s, i) => `
    <article class="svc reveal" style="transition-delay:${(i % 4) * 70}ms">
      <span class="svc-num">${String(i + 1).padStart(2, "0")}</span>
      <h3>${esc(s.name)}</h3>
      <p>${esc(s.blurb)}</p>
      <div class="svc-foot"><span>${s.kind === "property" ? "Free estimate" : "About " + fmtDur(s.durationMin)}</span>
      <a href="#book" class="svc-book" data-svc="${s.id}">Book <span>→</span></a></div>
    </article>`).join("");
  observe($("#serviceGrid"));
  $("#serviceGrid").addEventListener("click", e => {
    const a = e.target.closest("[data-svc]");
    if (a) { W.services.add(a.dataset.svc); renderPicks(); }
  });
}

// ---------- booking wizard ----------
const W = { step: 1, services: new Set(), shade: "", film: "", slots: null, month: null, date: "", start: null, durationMin: 0, booking: null };
const FILMS = ["Standard", "Carbon", "Ceramic", "Hybrid", "Not sure"];
const shadeChips = [...SHADES.map(s => `${s.v}%`), "Not sure"];
const svcById = id => CFG.services.find(s => s.id === id);
const chosen = () => [...W.services].map(svcById).filter(Boolean);
const needsVehicle = () => chosen().some(s => s.kind === "vehicle");
const needsAddress = () => chosen().some(s => s.kind === "property");
const needsTint = () => chosen().some(s => s.options === "tint");
const tz = () => CFG.tz;
const timeFmt = ms => new Date(ms).toLocaleTimeString("en-US", { timeZone: tz(), hour: "numeric", minute: "2-digit" });
const dayFmt = ms => new Date(ms).toLocaleDateString("en-US", { timeZone: tz(), weekday: "short", month: "short", day: "numeric" });

function renderPicks() {
  $("#svcPicks").innerHTML = CFG.services.map(s => `
    <button type="button" class="pick ${W.services.has(s.id) ? "on" : ""}" data-id="${s.id}" aria-pressed="${W.services.has(s.id)}">
      <span class="pick-l"><span class="tick"></span>${esc(s.short || s.name)}</span>
      <small>${s.kind === "property" ? "Estimate" : fmtDur(s.durationMin)}</small>
    </button>`).join("");
  $("#tintOpts").hidden = !needsTint();
  $("#vehicleOpts").hidden = !needsVehicle();
  $("#propertyOpts").hidden = !needsAddress();
  $("#shadeChips").innerHTML = shadeChips.map(v => `<button type="button" class="chip ${W.shade === v ? "on" : ""}" data-v="${v}">${v}</button>`).join("");
  $("#filmChips").innerHTML = FILMS.map(v => `<button type="button" class="chip ${W.film === v ? "on" : ""}" data-v="${v}">${v}</button>`).join("");
  W.slots = null; W.start = null; W.date = "";
  summary(); validate();
}

$("#svcPicks").addEventListener("click", e => {
  const b = e.target.closest(".pick"); if (!b) return;
  W.services.has(b.dataset.id) ? W.services.delete(b.dataset.id) : W.services.add(b.dataset.id);
  renderPicks();
});
$("#shadeChips").addEventListener("click", e => { const b = e.target.closest(".chip"); if (b) { W.shade = W.shade === b.dataset.v ? "" : b.dataset.v; renderChipState("#shadeChips", W.shade); summary(); } });
$("#filmChips").addEventListener("click", e => { const b = e.target.closest(".chip"); if (b) { W.film = W.film === b.dataset.v ? "" : b.dataset.v; renderChipState("#filmChips", W.film); summary(); } });
const renderChipState = (sel, v) => $$(".chip", $(sel)).forEach(c => c.classList.toggle("on", c.dataset.v === v));
["#vehicle", "#propAddr", "#fName", "#fPhone", "#fEmail", "#fIg", "#fNotes"].forEach(s => $(s).addEventListener("input", () => { $(s).classList.remove("bad"); validate(); summary(); }));
$("#fAgree").addEventListener("change", validate);

function validate() {
  let ok = false;
  if (W.step === 1) ok = W.services.size > 0 && (!needsVehicle() || $("#vehicle").value.trim().length >= 2) && (!needsAddress() || $("#propAddr").value.trim().length >= 5);
  if (W.step === 2) ok = W.start != null;
  if (W.step === 3) ok = $("#fName").value.trim().length >= 2 && digits($("#fPhone").value).length === 10 && $("#fAgree").checked;
  $("#wizNext").disabled = !ok;
  return ok;
}

function summary() {
  const svcs = chosen();
  $("#sumList").innerHTML = svcs.length
    ? svcs.map(s => `<li>${esc(s.name)}${s.options === "tint" && (W.shade || W.film) ? `<small>${esc([W.shade, W.film].filter(x => x && x !== "Not sure").join(" · "))}</small>` : ""}</li>`).join("")
    : `<li class="muted">Nothing picked yet</li>`;
  const dur = svcs.reduce((n, s) => n + s.durationMin, 0);
  $("#sumDur").textContent = dur ? (svcs.every(s => s.kind === "property") ? "Estimate visit" : "About " + fmtDur(dur)) : "–";
  $("#sumWhen").textContent = W.start ? `${dayFmt(W.start)}, ${timeFmt(W.start)}` : "–";
}

function go(step) {
  W.step = step;
  $$(".pane").forEach(p => (p.hidden = +p.dataset.pane !== step));
  $("#wizBar").style.width = `${Math.min(step, 3) / 3 * 100}%`;
  $("#wizStep").textContent = step <= 3 ? `Step ${step} of 3` : "Booked";
  $("#wizBack").hidden = step === 1 || step === 4;
  $("#wizNav").hidden = step === 4;
  $("#wizNext").innerHTML = step === 3 ? `Book it <span class="arrow">→</span>` : `Next <span class="arrow">→</span>`;
  $("#wizErr").textContent = "";
  if (step === 2) loadSlots();
  validate();
  const top = $("#wizard").getBoundingClientRect().top;
  if (top < 0) $("#wizard").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

$("#wizBack").addEventListener("click", () => go(W.step - 1));
$("#wizNext").addEventListener("click", async () => {
  if (!validate()) return;
  if (W.step < 3) return go(W.step + 1);
  await submit();
});

async function api(path, opts) {
  const r = await fetch(path, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || "Something went wrong. Try again or text Chris."), { status: r.status });
  return j;
}

async function loadSlots() {
  if (W.slots) return renderCal();
  $("#calGrid").innerHTML = ""; $("#times").innerHTML = `<div class="skeleton" style="height:60px;width:100%"></div>`;
  try {
    const ids = [...W.services].join(",");
    const r = await api(`/api/slots?services=${encodeURIComponent(ids)}&days=${CFG.maxDaysOut + 1}`);
    W.durationMin = r.durationMin;
    W.slots = new Map(r.days.filter(d => d.slots.length).map(d => [d.date, d.slots]));
    $("#durHint").textContent = chosen().every(s => s.kind === "property")
      ? "Chris comes out, measures and quotes. Dots mark days with open times."
      : `Your car will be in the bay about ${fmtDur(W.durationMin)}. Dots mark days with open times.`;
    const first = [...W.slots.keys()][0];
    W.month = first ? first.slice(0, 7) : todayStr().slice(0, 7);
    if (!W.date && first) W.date = first;
    renderCal();
  } catch (e) {
    $("#times").innerHTML = `<p class="times-empty">${esc(e.message)}</p>`;
  }
}

const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: tz() });
const monthAdd = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };

function renderCal() {
  const [y, m] = W.month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  $("#calTitle").textContent = first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const keys = [...W.slots.keys()];
  $("#calPrev").disabled = !keys.some(k => k < `${W.month}-01`);
  $("#calNext").disabled = !keys.some(k => k > `${W.month}-31`);
  const today = todayStr();
  let html = "";
  for (let i = 0; i < first.getUTCDay(); i++) html += "<span></span>";
  for (let d = 1; d <= daysIn; d++) {
    const ds = `${W.month}-${String(d).padStart(2, "0")}`;
    const open = W.slots.has(ds);
    html += `<button type="button" class="day ${open ? "open" : ""} ${ds === W.date ? "sel" : ""} ${ds === today ? "today" : ""}" ${open ? `data-d="${ds}"` : "disabled"} aria-label="${ds}${open ? ", open" : ", unavailable"}">${d}</button>`;
  }
  $("#calGrid").innerHTML = html;
  renderTimes();
}

function renderTimes() {
  const slots = W.slots.get(W.date);
  if (!W.slots.size) {
    $("#times").innerHTML = `<p class="times-empty">No open times online right now. Text Chris at ${esc(CFG.business.phone)} and he'll fit you in.</p>`;
    return;
  }
  if (!slots) { $("#times").innerHTML = `<p class="times-empty">Pick a day with a red dot.</p>`; return; }
  $("#times").innerHTML = slots.map((s, i) => `<button type="button" class="chip ${s === W.start ? "on" : ""}" data-s="${s}" style="animation-delay:${i * 25}ms">${timeFmt(s)}</button>`).join("");
}

$("#calGrid").addEventListener("click", e => {
  const b = e.target.closest("[data-d]"); if (!b) return;
  W.date = b.dataset.d; W.start = null; renderCal(); summary(); validate();
});
$("#times").addEventListener("click", e => {
  const b = e.target.closest("[data-s]"); if (!b) return;
  W.start = +b.dataset.s; renderTimes(); summary(); validate();
});
$("#calPrev").addEventListener("click", () => { W.month = monthAdd(W.month, -1); renderCal(); });
$("#calNext").addEventListener("click", () => { W.month = monthAdd(W.month, 1); renderCal(); });

async function submit() {
  const btn = $("#wizNext");
  btn.disabled = true; btn.textContent = "Booking…";
  try {
    const r = await api("/api/book", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        services: [...W.services], start: W.start,
        details: { vehicle: $("#vehicle").value, address: $("#propAddr").value, shade: W.shade, film: W.film },
        name: $("#fName").value, phone: $("#fPhone").value, email: $("#fEmail").value,
        instagram: $("#fIg").value, notes: $("#fNotes").value, website: $("#fWebsite").value,
      }),
    });
    done(r.booking);
  } catch (e) {
    $("#wizErr").textContent = e.message;
    if (e.status === 409) { W.slots = null; W.start = null; setTimeout(() => { go(2); $("#wizErr").textContent = e.message; }, 50); }
    btn.disabled = false; btn.innerHTML = `Book it <span class="arrow">→</span>`;
  }
}

function done(b) {
  W.booking = b;
  const biz = CFG.business;
  const svc = b.services.map(s => s.name).join(" + ");
  const when = `${new Date(b.start).toLocaleDateString("en-US", { timeZone: tz(), weekday: "long", month: "long", day: "numeric" })} at ${timeFmt(b.start)}`;
  $("#doneTitle").textContent = `You're booked, ${b.name.split(" ")[0]}.`;
  $("#doneWhen").textContent = `${svc} · ${when}`;
  $("#doneRef").textContent = b.ref;
  const loc = biz.locations[0];
  const methods = biz.depositMethods.length
    ? `<div class="methods">${biz.depositMethods.map(m => `<div><span>${esc(m.label)}</span><b>${esc(m.value)}</b></div>`).join("")}</div><p style="margin-top:10px">Put <b>${esc(b.ref)}</b> in the note.</p>`
    : `<p>Chris will text you how to send it.</p>`;
  $("#depositBox").innerHTML = (biz.depositAmount > 0
    ? `<h4>Lock it in with $${biz.depositAmount}</h4><p>${esc(biz.depositNote)}</p>${methods}`
    : `<h4>All set</h4>`) + (loc ? `<p style="margin-top:12px"><b>Where:</b> ${esc(loc.address)}</p>` : "");
  const msg = `Hi ${biz.owner}, I just booked ${svc} for ${when} (${b.ref}).`;
  $("#textChris").href = `sms:+1${digits(biz.phone)}?&body=${encodeURIComponent(msg)}`;
  $("#addCal").href = `/api/booking/${b.token}.ics`;
  go(4);
}

// ---------- boot ----------
(async () => {
  try {
    CFG = await api("/api/config");
    applyBusiness(CFG.business);
    renderServices(CFG.services);
    renderHours(CFG.hours);
    renderPicks();
    go(1);
  } catch {
    $("#serviceGrid").innerHTML = `<p class="muted">Couldn't load services. Refresh, or text (216) 612-0141.</p>`;
  }
})();
