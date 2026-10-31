"use strict";

/* ============================================================
   Entreno — app de pauta de entrenamiento (sin dependencias)
   ============================================================ */

const LS = {
  plan: "entreno.plan",
  history: "entreno.history",
  session: "entreno.session",
  prefs: "entreno.prefs",
  kg: "entreno.kg",
};

const STANDALONE = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
document.documentElement.classList.toggle("standalone", STANDALONE);

const $app = document.getElementById("app");
const $title = document.getElementById("title");
const $back = document.getElementById("backBtn");
const $clock = document.getElementById("sessionClock");

// ---------- almacenamiento ----------
function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  if (value === null || value === undefined) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
}

// Si la pauta del archivo es más nueva que la guardada en el teléfono, usa la del archivo.
let plan = load(LS.plan, null);
if (!plan || (plan.version || 0) < (window.DEFAULT_PLAN.version || 0)) {
  plan = structuredClone(window.DEFAULT_PLAN);
  save(LS.plan, null);
}
let history = load(LS.history, []);
let session = load(LS.session, null);
let lastKg = load(LS.kg, {});
let prefs = Object.assign(
  { sound: true, voice: true, autoRest: true, week: "auto", prep: 10, autoStart: true, metroEvery: false },
  load(LS.prefs, {})
);
let lastTempo = load("entreno.tempo", {});

// ---------- utilidades ----------
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fmt(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
}
function parseDay(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function fmtShort(s) {
  return parseDay(s).toLocaleDateString("es", { day: "numeric", month: "short" });
}

// ---------- semanas / progresión ----------
function autoWeekIndex() {
  const weeks = plan.weeks || [];
  if (!weeks.length) return -1;
  const now = new Date();
  let idx = 0;
  weeks.forEach((w, i) => {
    if (parseDay(w.start) <= now) idx = i;
  });
  return idx;
}
function weekIndex() {
  const weeks = plan.weeks || [];
  if (prefs.week !== "auto" && weeks[+prefs.week]) return +prefs.week;
  return autoWeekIndex();
}
function weekSets() {
  const w = (plan.weeks || [])[weekIndex()];
  return w ? +w.sets || 1 : 3;
}
function setsOf(ex, wk = weekSets()) {
  if (ex.sets === "auto" || ex.sets === undefined || ex.sets === "") return wk;
  return Math.max(1, +ex.sets || 1);
}
function sessionsThisWeek() {
  const wi = weekIndex();
  const w = (plan.weeks || [])[wi];
  if (!w) return null;
  const start = parseDay(w.start).getTime();
  const end = start + 7 * 864e5;
  return history.filter((h) => h.date >= start && h.date < end).length;
}

function exTarget(ex, wk) {
  const parts = [];
  parts.push(`${setsOf(ex, wk)} ${setsOf(ex, wk) === 1 ? "serie" : "series"}`);
  if (ex.time) parts.push(`${ex.time} s${ex.perSide ? " c/lado" : ""}`);
  else if (ex.reps) parts.push(`${ex.reps} reps${ex.perSide ? " c/lado" : ""}`);
  if (ex.rpe) parts.push(`RPE ${ex.rpe}`);
  if (ex.weight) parts.push(ex.weight);
  return parts.join(" · ");
}

// Dentro de un marco (página de Claude) los videos incrustados se bloquean: se abren en YouTube.
const EMBED_OK = (() => { try { return window.self === window.top; } catch { return false; } })();

function youtubeId(url) {
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// "start" del ejercicio: segundos (95) o texto "1:35" / "1:02:10"
function startSec(v) {
  if (v === undefined || v === null || v === "") return 0;
  if (typeof v === "number") return Math.max(0, Math.floor(v));
  return String(v).split(":").reduce((acc, n) => acc * 60 + (+n || 0), 0);
}

function videoHtml(ex) {
  const url = ex.video;
  if (url) {
    const id = youtubeId(url);
    const st = startSec(ex.start);
    const from = st ? ` · desde ${fmt(st)}` : "";
    const ytLink = id ? `https://www.youtube.com/watch?v=${id}${st ? `&t=${st}s` : ""}` : url;
    if (id && EMBED_OK) {
      return `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&modestbranding=1${st ? `&start=${st}` : ""}"
        title="${esc(ex.name)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>
        <a class="small link" href="${esc(ytLink)}" target="_blank" rel="noopener">Abrir en YouTube${from} ↗</a>`;
    }
    if (id) {
      return `<a class="btn ghost full" href="${esc(ytLink)}" target="_blank" rel="noopener">▶ Ver video en YouTube${from}</a>`;
    }
    if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) {
      return `<div class="video"><video src="${esc(url)}" controls playsinline loop muted></video></div>`;
    }
    return `<a class="btn ghost full" href="${esc(url)}" target="_blank" rel="noopener">▶ Ver video${id ? " en YouTube" : ""}</a>`;
  }
  const q = encodeURIComponent(`${ex.name} ejercicio técnica`);
  return `<a class="btn ghost full" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener">Buscar video en YouTube</a>`;
}

// ---------- diálogos propios (confirm/alert no funcionan en todas partes) ----------
function ask(msg, okText = "Sí") {
  return new Promise((resolve) => {
    const d = document.createElement("div");
    d.className = "modal";
    d.innerHTML = `<div class="modal-box"><p>${esc(msg)}</p>
      <div class="row gap"><button class="btn ghost grow" data-r="0">Cancelar</button>
      <button class="btn primary grow" data-r="1">${esc(okText)}</button></div></div>`;
    d.addEventListener("click", (e) => {
      const r = e.target.closest("[data-r]");
      if (!r && e.target !== d) return;
      d.remove();
      resolve(r ? r.dataset.r === "1" : false);
    });
    document.body.appendChild(d);
  });
}
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// ---------- grupos (circuitos / superseries) ----------
// Devuelve [{start, end, name}] para ejercicios consecutivos con el mismo group+block.
function groupsOf(day) {
  const out = [];
  const exs = day.exercises;
  let i = 0;
  while (i < exs.length) {
    let j = i + 1;
    if (exs[i].group) {
      while (j < exs.length && exs[j].group === exs[i].group && exs[j].block === exs[i].block) j++;
    }
    out.push({ start: i, end: j, name: j - i > 1 ? exs[i].group : null });
    i = j;
  }
  return out;
}
function groupLabel(g) {
  if (!g.name) return null;
  const n = g.end - g.start;
  if (/^[A-Z]$/.test(g.name)) return n === 2 ? `Superserie ${g.name}` : `Circuito ${g.name}`;
  return g.name;
}

/*
  Construye la secuencia de pasos de la sesión.
  En un grupo: ronda 1 de cada ejercicio, descanso, ronda 2…
  Ejercicios por tiempo y por lado generan un paso por lado.
*/
function buildSteps(day, wk) {
  const steps = [];
  for (const g of groupsOf(day)) {
    const members = day.exercises.slice(g.start, g.end).map((ex, k) => ({ ex, idx: g.start + k }));
    const rounds = Math.max(...members.map((m) => setsOf(m.ex, wk)));
    for (let r = 0; r < rounds; r++) {
      const active = members.filter((m) => r < setsOf(m.ex, wk));
      active.forEach((m, k) => {
        const sides = m.ex.perSide && m.ex.time ? 2 : 1;
        for (let s = 1; s <= sides; s++) {
          const lastInRound = k === active.length - 1 && s === sides;
          let rest;
          if (s < sides) rest = 5; // cambio de lado
          else if (g.name && !lastInRound) rest = +m.ex.rest || 0; // entre ejercicios del circuito
          else if (g.name) rest = +active[active.length - 1].ex.rest || 0; // entre rondas
          else rest = +m.ex.rest || 0;
          steps.push({
            ex: m.idx,
            set: r,
            nSets: setsOf(m.ex, wk),
            round: r,
            rounds,
            group: groupLabel(g),
            pos: g.name ? `${g.name.length === 1 ? g.name : ""}${k + 1}` : null,
            side: sides > 1 ? s : 0,
            rest,
          });
        }
      });
    }
  }
  return steps;
}

// ---------- sonido, voz, vibración, pantalla encendida ----------
let audioCtx = null;
let keepAlive = null;

// WAV de silencio: al reproducirlo en un <audio>, iOS usa la sesión "playback"
// y los pitidos suenan aunque el interruptor de silencio esté activado.
function silentWavUrl() {
  const rate = 8000, n = rate / 2, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, str) => [...str].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

function ensurePlayback() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = "playback";
  } catch {}
  try {
    if (!keepAlive) {
      keepAlive = new Audio(silentWavUrl());
      keepAlive.loop = true;
      keepAlive.setAttribute("playsinline", "");
      keepAlive.setAttribute("x-webkit-airplay", "deny");
    }
    keepAlive.play().catch(() => {});
  } catch {}
}
function stopPlayback() {
  try {
    keepAlive?.pause();
  } catch {}
}

function unlockAudio() {
  try {
    if (session) ensurePlayback();
    else if (navigator.audioSession) navigator.audioSession.type = "playback";
  } catch {}
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state !== "running") audioCtx.resume();
  } catch {}
}
document.addEventListener("touchend", unlockAudio, { passive: true });
document.addEventListener("click", unlockAudio);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && audioCtx && audioCtx.state !== "running") audioCtx.resume().catch(() => {});
});

function ctxReady() {
  if (!prefs.sound || !audioCtx) return false;
  if (audioCtx.state !== "running") audioCtx.resume().catch(() => {});
  return true;
}

function beep(freq = 880, dur = 0.15, times = 1, vol = 0.5) {
  if (!ctxReady()) return;
  for (let i = 0; i < times; i++) {
    const t = audioCtx.currentTime + 0.01 + i * (dur + 0.08);
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    o.type = "sine";
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}

// Golpe tipo "bloque de madera": suave pero se escucha bien en el parlante del teléfono
function click(accent = true, vol = 0.7) {
  if (!ctxReady()) return;
  const t = audioCtx.currentTime + 0.01;
  const out = audioCtx.createGain();
  out.gain.value = vol;
  out.connect(audioCtx.destination);
  [[accent ? 1800 : 1400, "triangle", 0.05], [accent ? 900 : 700, "sine", 0.09]].forEach(([f, type, d]) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.7, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + d + 0.02);
  });
}

function say(text) {
  if (!prefs.voice || !("speechSynthesis" in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-ES";
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch {}
}

function buzz(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => (wakeLock = null));
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {}
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && session) keepAwake(true);
});

// ---------- navegación ----------
let route = { view: "home" };
let ticker = null;

function go(view, params = {}) {
  route = { view, ...params };
  document.body.classList.remove("nav-compact");
  render();
  window.scrollTo(0, 0);
}

$back.addEventListener("click", () => {
  if (route.view === "workout") return go("day", { dayIndex: session ? session.dayIndex : 0 });
  if (route.view === "rpe" && route.from === "workout") return go("workout");
  if (route.view === "edit") return go("settings");
  if (route.view === "share") return go("history");
  go("home");
});

function setHeader(title, showBack) {
  $title.textContent = title;
  const tabView = ["history", "settings"].includes(route.view) || (route.view === "rpe" && route.from !== "workout");
  $back.hidden = !showBack || tabView;
}

function render() {
  clearInterval(ticker);
  ticker = null;
  updateClock();
  if (session) ticker = setInterval(tick, 100);

  const views = {
    home: renderHome,
    day: renderDay,
    workout: renderWorkout,
    summary: renderSummary,
    history: renderHistory,
    edit: renderEdit,
    settings: renderSettings,
    rpe: renderRpe,
    share: renderShare,
  };
  (views[route.view] || renderHome)();
  renderTabbar();
}

function bindActs(map) {
  $app.querySelectorAll("[data-act]").forEach((el) => {
    const fn = map[el.dataset.act];
    if (fn) el.addEventListener("click", (e) => fn(e, el));
  });
}

function updateClock() {
  if (session) {
    $clock.hidden = false;
    $clock.textContent = fmt((Date.now() - session.startedAt) / 1000);
  } else {
    $clock.hidden = true;
  }
}

// ============================================================
//  INICIO
// ============================================================
function lastDoneFor(dayName) {
  for (let i = history.length - 1; i >= 0; i--) if (history[i].dayName === dayName) return history[i].date;
  return null;
}

function suggestedDayIndex() {
  if (!history.length) return 0;
  const last = history[history.length - 1];
  const idx = plan.days.findIndex((d) => d.name === last.dayName);
  return idx === -1 ? 0 : (idx + 1) % plan.days.length;
}

// ---------- íconos (trazo simple) ----------
const ICON = {
  home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
  history: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  gauge: '<path d="M12 14l4-4"/><path d="M3.3 17a9 9 0 1 1 17.4 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  play: '<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
};
const icon = (n, cls = "") =>
  `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

// Minutos aproximados de un día (trabajo + descansos + transiciones)
function estimateMin(day, wk) {
  let sec = 0;
  for (const st of buildSteps(day, wk)) {
    const ex = day.exercises[st.ex];
    sec += ex.time ? +ex.time : (+ex.reps || 10) * 3 * (ex.perSide ? 2 : 1);
    sec += st.rest + 15;
  }
  return Math.max(5, Math.round(sec / 60 / 5) * 5);
}

function weekStripHtml() {
  const weeks = plan.weeks || [];
  if (!weeks.length) return "";
  const wi = weekIndex();
  const auto = autoWeekIndex();
  const freq = plan.frequency || 0;
  const cells = weeks
    .map((w, i) => {
      const start = parseDay(w.start).getTime();
      const n = history.filter((h) => h.date >= start && h.date < start + 7 * 864e5).length;
      const state = i === wi ? "on" : i < auto ? "past" : "";
      const pips = freq
        ? `<span class="pips">${Array.from({ length: freq }, (_, k) => `<i class="${k < n ? "done" : ""}"></i>`).join("")}</span>`
        : "";
      return `<button class="wk ${state}" data-week="${i}" aria-pressed="${i === wi}">
        <span class="wk-label">Sem ${i + 1}</span>
        <span class="wk-num">${w.sets}</span>
        <span class="wk-unit">series</span>
        ${pips}
        <span class="wk-date">${fmtShort(w.start)}</span>
      </button>`;
    })
    .join("");
  const manual = prefs.week !== "auto" && +prefs.week !== auto;
  return `<section class="section">
    <div class="section-head">
      <h2>Progresión</h2>
      ${manual ? `<button class="text-btn" data-act="weekAuto">Volver a la semana actual</button>` : `<span class="muted small">Toca una semana para cambiarla</span>`}
    </div>
    <div class="weeks">${cells}</div>
  </section>`;
}

function renderHome() {
  setHeader(plan.name || "Entreno", false);
  const di = session ? session.dayIndex : suggestedDayIndex();
  const day = plan.days[di];
  const weeks = plan.weeks || [];
  const wi = weekIndex();
  const wk = weekSets();
  const done = sessionsThisWeek();
  const freq = plan.frequency || 0;
  const today = new Date().toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });

  let hero = "";
  if (day) {
    const blocks = [];
    day.exercises.forEach((e) => {
      const b = e.block || "Ejercicios";
      const last = blocks[blocks.length - 1];
      if (last && last.name === b) last.n++;
      else blocks.push({ name: b, n: 1 });
    });
    const eyebrow = session
      ? "Entrenamiento en curso"
      : weeks.length
      ? `Semana ${wi + 1} de ${weeks.length}${freq ? ` · sesión ${Math.min((done || 0) + 1, freq)} de ${freq}` : ""}`
      : "Siguiente entrenamiento";
    const pct = session ? Math.round((session.i / session.steps.length) * 100) : 0;
    hero = `<section class="hero ${session ? "is-live" : ""}">
      <div class="eyebrow">${esc(eyebrow)}</div>
      <h1 class="hero-title">${esc(day.name)}</h1>
      <div class="hero-meta">
        <span><b>${wk}</b> series</span>
        <span><b>${day.exercises.length}</b> ejercicios</span>
        <span>${icon("clock")} <b>~${estimateMin(day, wk)}</b> min</span>
      </div>
      <ol class="blocks">${blocks
        .map((b) => `<li><span>${esc(b.name)}</span><small>${b.n}</small></li>`)
        .join("")}</ol>
      ${
        session
          ? `<div class="live-progress"><div style="width:${pct}%"></div></div>
             <div class="hero-sub">Paso ${session.i + 1} de ${session.steps.length} · ${fmt((Date.now() - session.startedAt) / 1000)} transcurrido</div>
             <button class="btn primary xl" data-act="resume">${icon("play")} Continuar</button>
             <button class="text-btn danger" data-act="discard">Descartar entrenamiento</button>`
          : `<button class="btn primary xl" data-act="start">${icon("play")} Empezar</button>
             <button class="text-btn" data-act="preview">${icon("list")} Ver ejercicios del día</button>`
      }
    </section>`;
  }

  const otherDays =
    plan.days.length > 1
      ? `<section class="section"><div class="section-head"><h2>Otros días</h2></div><div class="list">${plan.days
          .map((d, i) =>
            i === di
              ? ""
              : `<button class="row-link" data-day="${i}"><span><b>${esc(d.name)}</b><small>${d.exercises.length} ejercicios</small></span>${icon("chevron")}</button>`
          )
          .join("")}</div></section>`
      : "";

  const lastEntry = history[history.length - 1];
  const last = lastEntry
    ? `<section class="section"><div class="section-head"><h2>Último entrenamiento</h2><button class="text-btn" data-act="history">Ver historial</button></div>
        <div class="last"><span><b>${esc(lastEntry.dayName)}</b><small>${fmtDate(lastEntry.date)}</small></span><span class="last-dur">${fmt(lastEntry.duration)}</span></div></section>`
    : "";

  $app.innerHTML = `
    <header class="home-head">
      <div class="eyebrow">${esc(today)}</div>
      <div class="home-title">${esc(plan.name || "Entreno")}</div>
    </header>
    ${
      !STANDALONE && !prefs.hideInstall && /iPhone|iPad|iPod/.test(navigator.userAgent)
        ? `<div class="install-tip">
             <div><b>Úsala a pantalla completa</b><span>En Safari toca <i class="share-glyph" aria-label="Compartir"></i> y luego <b>Agregar a pantalla de inicio</b>. Ábrela desde ese ícono y desaparece la barra del navegador.</span></div>
             <button class="text-btn" data-act="hideInstall" aria-label="Cerrar aviso">Cerrar</button>
           </div>`
        : ""
    }
    ${hero || `<p class="muted">Tu pauta no tiene días. Edítala en Ajustes.</p>`}
    ${weekStripHtml()}
    ${otherDays}
    ${last}`;

  $app.querySelectorAll("[data-week]").forEach((b) =>
    b.addEventListener("click", () => {
      const i = +b.dataset.week;
      prefs.week = i === autoWeekIndex() ? "auto" : String(i);
      save(LS.prefs, prefs);
      render();
    })
  );
  $app.querySelectorAll("[data-day]").forEach((b) =>
    b.addEventListener("click", () => go("day", { dayIndex: +b.dataset.day }))
  );
  bindActs({
    start: () => startSession(di),
    preview: () => go("day", { dayIndex: di }),
    resume: () => {
      ensurePlayback();
      go("workout");
    },
    weekAuto: () => {
      prefs.week = "auto";
      save(LS.prefs, prefs);
      render();
    },
    discard: async () => {
      if (await ask("¿Descartar el entrenamiento en curso?", "Descartar")) {
        session = null;
        save(LS.session, null);
        keepAwake(false);
        stopPlayback();
        render();
      }
    },
    history: () => go("history"),
    hideInstall: () => {
      prefs.hideInstall = true;
      save(LS.prefs, prefs);
      render();
    },
  });
}

// ---------- barra inferior ----------
const TABS = [
  ["home", "home", "Inicio"],
  ["history", "history", "Historial"],
  ["rpe", "gauge", "RPE"],
  ["settings", "settings", "Ajustes"],
];
const $tabbar = document.createElement("nav");
$tabbar.className = "tabbar";
$tabbar.setAttribute("aria-label", "Secciones");
document.body.appendChild($tabbar);
function renderTabbar() {
  const v = route.view;
  const show = ["home", "history", "rpe", "settings"].includes(v) && !(v === "rpe" && route.from === "workout");
  document.body.classList.toggle("has-tabbar", show);
  document.body.classList.toggle("is-home", v === "home");
  $tabbar.hidden = !show;
  if (!show) return;
  $tabbar.innerHTML = TABS.map(
    ([view, ic, label]) =>
      `<button data-tab="${view}" class="${v === view ? "on" : ""}" ${v === view ? 'aria-current="page"' : ""}>${icon(ic)}<span>${label}</span></button>`
  ).join("");
  $tabbar.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => go(b.dataset.tab, { from: "tab" })));
}

// ============================================================
//  DÍA
// ============================================================
function renderDay() {
  const day = plan.days[route.dayIndex];
  if (!day) return go("home");
  setHeader(day.name, true);
  const wk = weekSets();

  let html = "";
  let lastBlock = null;
  for (const g of groupsOf(day)) {
    const first = day.exercises[g.start];
    if (first.block && first.block !== lastBlock) {
      html += `<h3 class="block-title">${esc(first.block)}</h3>`;
      lastBlock = first.block;
    }
    const label = groupLabel(g);
    const members = day.exercises.slice(g.start, g.end);
    const rounds = Math.max(...members.map((e) => setsOf(e, wk)));
    const items = members
      .map((ex, k) => {
        const i = g.start + k;
        const tag = g.name ? (g.name.length === 1 ? `${g.name}${k + 1}` : k + 1) : i + 1;
        return `
        <details class="ex-card ${g.name ? "in-group" : "card"}">
          <summary>
            <span class="num">${esc(tag)}</span>
            <span class="grow">
              <span class="card-title">${esc(ex.name)}</span>
              <span class="muted block small">${esc(exTarget(ex, wk))}</span>
            </span>
          </summary>
          <div class="ex-body" data-video="${i}"></div>
          ${ex.notes ? `<p class="notes">${esc(ex.notes)}</p>` : ""}
        </details>`;
      })
      .join("");
    if (label) {
      const restR = +members[members.length - 1].rest || 0;
      html += `<div class="card group-card">
        <div class="group-head row between"><b>${esc(label)}</b><span class="muted small">${rounds} ${rounds === 1 ? "ronda" : "rondas"}${restR ? ` · descanso ${restR} s` : ""}</span></div>
        ${items}
      </div>`;
    } else {
      html += items;
    }
  }

  const otherSession = session && session.dayIndex !== route.dayIndex;
  $app.innerHTML = `
    <div class="list">${html}</div>
    <div class="sticky-bottom">
      ${
        session && !otherSession
          ? `<button class="btn primary full big" data-act="resume">Continuar entrenamiento</button>`
          : `<button class="btn primary full big" data-act="start">▶ Comenzar</button>`
      }
    </div>`;

  // Carga el video solo al abrir el ejercicio (más liviano)
  $app.querySelectorAll("details.ex-card").forEach((d) => {
    d.addEventListener("toggle", () => {
      const box = d.querySelector("[data-video]");
      if (d.open && !box.innerHTML) box.innerHTML = videoHtml(day.exercises[+box.dataset.video]);
    });
  });

  bindActs({
    resume: () => go("workout"),
    start: async () => {
      if (otherSession && !(await ask("Hay otro entrenamiento en curso. ¿Descartarlo y empezar este?"))) return;
      startSession(route.dayIndex);
    },
  });
}

// ============================================================
//  SESIÓN DE ENTRENAMIENTO
// ============================================================
/*
  session = {
    dayIndex, steps, i, startedAt, week,
    phase: "work" | "rest",
    reps, timer, setStartedAt,
    log: { [exIndex]: [ {set, side, reps, time, kg, at} ] }
  }
*/
function startSession(dayIndex) {
  unlockAudio();
  ensurePlayback();
  const day = plan.days[dayIndex];
  const steps = buildSteps(day, weekSets());
  if (!steps.length) return toast("Este día no tiene ejercicios.");
  session = {
    dayIndex,
    steps,
    i: 0,
    week: weekIndex(),
    startedAt: Date.now(),
    phase: "work",
    reps: 0,
    timer: null,
    metro: null,
    setStartedAt: Date.now(),
    log: {},
  };
  const first = day.exercises[steps[0].ex];
  if (prefs.prep > 0) {
    session.phase = "rest";
    session.restKind = "prep";
    timerStart(+prefs.prep);
    say(`Empezamos. Prepárate: ${first.name}`);
  } else {
    say(`Empezamos. ${first.name}`);
  }
  persist();
  keepAwake(true);
  go("workout");
}

function persist() {
  save(LS.session, session);
}
const curDay = () => plan.days[session.dayIndex];
const curStep = () => session.steps[session.i];
const curEx = () => curDay().exercises[curStep().ex];

// --- temporizador basado en hora real (sigue funcionando si se bloquea la pantalla)
function timerStart(seconds) {
  session.timer = { running: true, total: seconds, endsAt: Date.now() + seconds * 1000, remaining: seconds, lastBeep: null };
  persist();
}
function timerPause() {
  const t = session.timer;
  if (!t || !t.running) return;
  t.remaining = Math.max(0, (t.endsAt - Date.now()) / 1000);
  t.running = false;
  persist();
}
function timerResume() {
  const t = session.timer;
  if (!t || t.running) return;
  t.endsAt = Date.now() + t.remaining * 1000;
  t.running = true;
  persist();
}
function timerLeft() {
  const t = session.timer;
  if (!t) return 0;
  return t.running ? Math.max(0, (t.endsAt - Date.now()) / 1000) : t.remaining;
}

function tick() {
  updateClock();
  if (!session) return;
  if (session.metro && session.phase === "work") metroTick();
  if (!session) return;
  const t = session.timer;
  if (t && t.running) {
    const left = timerLeft();
    const whole = Math.ceil(left);
    if (whole <= 3 && whole > 0 && t.lastBeep !== whole) {
      t.lastBeep = whole;
      beep(660, 0.1);
    }
    if (left <= 0) {
      t.running = false;
      t.remaining = 0;
      onTimerDone();
      return;
    }
  }
  if (route.view === "workout") paintLive();
}

function onTimerDone() {
  if (session.phase === "work") {
    beep(990, 0.25, 2);
    buzz([200, 100, 200]);
    logSet({ time: curEx().time });
  } else {
    beep(990, 0.3, 2);
    buzz([300, 100, 300]);
    if (!(prefs.autoStart && (curEx().time || hasMetro(curEx())))) say(curStep().side === 2 ? "Otro lado" : "¡Vamos!");
    beginWork(true);
  }
}

// ---------- metrónomo (repeticiones guiadas por pitido) ----------
const hasMetro = (ex) => !ex.time && +ex.reps > 0 && +ex.tempo > 0;
const tempoOf = (ex) => +(lastTempo[ex.name] ?? ex.tempo) || 3;
const metroBeats = (ex) => +ex.reps * (ex.alternate ? 2 : 1);
const metroSides = (ex) => (ex.perSide && !ex.alternate ? 2 : 1);

function bumpRep() {
  const el = document.getElementById("repNum");
  if (!el) return;
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
}

function metroStart() {
  session.metro = { running: true, t0: Date.now() + 500, elapsed: 0, side: 1, switchUntil: null, switchLeft: 0, lastBeat: -1, lastHalf: -1, lastCount: null };
  session.reps = 0;
  session.setStartedAt = Date.now();
  say(prefs.metroEvery ? "Sigue el pitido" : "Sigue el conteo");
  persist();
}
function metroPause() {
  const m = session.metro;
  if (!m || !m.running) return;
  if (m.switchUntil) m.switchLeft = Math.max(0, m.switchUntil - Date.now());
  else m.elapsed = Date.now() - m.t0;
  m.running = false;
  persist();
}
function metroResume() {
  const m = session.metro;
  if (!m || m.running) return;
  if (m.switchUntil) m.switchUntil = Date.now() + m.switchLeft;
  else m.t0 = Date.now() - m.elapsed;
  m.running = true;
  persist();
}
function metroSetTempo(ex, delta) {
  const old = tempoOf(ex);
  const nw = Math.min(8, Math.max(1, Math.round((old + delta) * 2) / 2));
  lastTempo[ex.name] = nw;
  save("entreno.tempo", lastTempo);
  const m = session.metro;
  if (m && !m.switchUntil) {
    const el = m.running ? Date.now() - m.t0 : m.elapsed;
    const nel = (el / old) * nw;
    if (m.running) m.t0 = Date.now() - nel;
    else m.elapsed = nel;
    persist();
  }
}
function metroTick() {
  const m = session.metro;
  if (!m || !m.running) return;
  const ex = curEx();
  const now = Date.now();
  if (m.switchUntil) {
    const left = Math.ceil((m.switchUntil - now) / 1000);
    if (left <= 3 && left > 0 && m.lastCount !== left) {
      m.lastCount = left;
      beep(660, 0.08, 1, 0.3);
    }
    if (now >= m.switchUntil) {
      m.switchUntil = null;
      m.side++;
      m.t0 = now;
      m.lastBeat = -1;
      m.lastHalf = -1;
      session.reps = 0;
      persist();
    }
    paintLive();
    return;
  }
  const tempo = tempoOf(ex) * 1000;
  const el = now - m.t0;
  if (el < 0) return;
  const total = metroBeats(ex);
  const beat = Math.floor(el / tempo);
  if (beat >= total) {
    if (m.side < metroSides(ex)) {
      m.switchUntil = now + 5000;
      m.lastCount = null;
      session.reps = +ex.reps;
      beep(990, 0.15, 2, 0.4);
      say("Cambia de lado");
      persist();
      paintLive();
      return;
    }
    session.reps = +ex.reps;
    session.metro = null;
    beep(1200, 0.15, 2, 0.45);
    buzz([150, 80, 150]);
    logSet({ reps: +ex.reps, time: Math.round((now - session.setStartedAt) / 1000) });
    return;
  }
  if (beat !== m.lastBeat) {
    m.lastBeat = beat;
    session.reps = ex.alternate ? Math.floor(beat / 2) + 1 : beat + 1;
    const accent = ex.alternate ? beat % 2 === 0 : true;
    // Por defecto suena solo al inicio (y al final, más abajo); el conteo se ve en pantalla.
    if (beat === 0) beep(990, 0.18, 1, 0.5);
    else if (prefs.metroEvery) click(accent, 0.75);
    bumpRep();
    persist();
  }
  if (prefs.metroEvery) {
    const half = Math.floor((el - tempo / 2) / tempo);
    if (half >= 0 && half < total && half !== m.lastHalf) {
      m.lastHalf = half;
      click(false, 0.18);
    }
  }
}

function logSet(entry) {
  const st = curStep();
  (session.log[st.ex] = session.log[st.ex] || []).push({ ...entry, set: st.set, side: st.side, at: Date.now() });

  if (session.i + 1 >= session.steps.length) {
    persist();
    return finishSession();
  }

  session.metro = null;
  session.i++;
  const next = curStep();
  const nextEx = curEx();
  const changing = next.ex !== st.ex;

  let rest = prefs.autoRest ? st.rest : 0;
  let kind = next.side === 2 ? "side" : "rest";
  if (next.side === 2 && !prefs.autoRest) rest = st.rest; // cambio de lado siempre
  if (changing && +prefs.prep > rest) {
    rest = +prefs.prep;
    kind = "prep";
  }
  session.restKind = kind;

  if (rest > 0) {
    session.phase = "rest";
    session.reps = 0;
    timerStart(rest);
    if (kind === "side") say("Cambia de lado");
    else if (kind === "prep") say(`Prepárate: ${nextEx.name}`);
    else if (changing) say(`Descanso. Luego, ${nextEx.name}`);
    else say("Descanso");
    persist();
    render();
  } else {
    if (changing) say(nextEx.name);
    else if (next.side === 2) say("Otro lado");
    beginWork(true);
  }
}

function beginWork(auto = false) {
  session.phase = "work";
  session.timer = null;
  session.metro = null;
  session.reps = 0;
  session.setStartedAt = Date.now();
  if (auto && prefs.autoStart) {
    const ex = curEx();
    if (ex.time) {
      timerStart(+ex.time);
      beep(990, 0.15);
      say("Ya");
    } else if (hasMetro(ex)) {
      metroStart();
    }
  }
  persist();
  render();
}

function jumpStep(delta) {
  // salta al primer paso de otro ejercicio en la dirección indicada
  let j = session.i;
  const cur = curStep().ex;
  if (delta > 0) {
    while (j < session.steps.length - 1 && session.steps[j].ex === cur) j++;
    if (session.steps[j].ex === cur) return;
  } else {
    j--;
    if (j < 0) return;
  }
  session.i = j;
  beginWork();
}

function finishSession() {
  const day = curDay();
  const entry = {
    date: Date.now(),
    dayName: day.name,
    week: session.week,
    duration: Math.round((Date.now() - session.startedAt) / 1000),
    exercises: day.exercises.map((ex, i) => ({ name: ex.name, sets: session.log[i] || [] })),
  };
  history.push(entry);
  save(LS.history, history);
  session = null;
  save(LS.session, null);
  keepAwake(false);
  setTimeout(stopPlayback, 4000);
  beep(1200, 0.2, 3);
  say("¡Entrenamiento terminado! Buen trabajo.");
  go("summary", { entry: history.length - 1 });
}

function sideLabel(st) {
  return st.side === 1 ? " · lado 1" : st.side === 2 ? " · lado 2" : "";
}

function renderWorkout() {
  if (!session || !session.steps) return go("home");
  const day = curDay();
  const st = curStep();
  const ex = curEx();
  if (!ex) return go("home");
  setHeader(day.name, true);
  keepAwake(true);

  const isRest = session.phase === "rest";
  const isTimed = !!ex.time;
  const total = session.steps.length;

  // puntos de series del ejercicio actual
  const doneSets = new Set((session.log[st.ex] || []).filter((l) => l.side !== 1).map((l) => l.set));
  const setDots = Array.from({ length: st.nSets }, (_, i) => {
    const cur = i === st.set && !isRest;
    return `<span class="dot ${doneSets.has(i) ? "done" : ""} ${cur ? "cur" : ""}"></span>`;
  }).join("");

  // otros ejercicios del circuito/superserie
  let groupBar = "";
  if (st.group) {
    const members = [...new Set(session.steps.filter((s) => s.group === st.group && s.rounds === st.rounds).map((s) => s.ex))];
    groupBar = `<div class="group-bar">
      <div class="small muted">${esc(st.group)} · ronda ${st.round + 1} de ${st.rounds}</div>
      <div class="chips">${members
        .map((m) => `<span class="chip ${m === st.ex ? "on" : ""}">${esc(day.exercises[m].name)}</span>`)
        .join("")}</div>
    </div>`;
  }

  const setLabel = st.group
    ? `${st.pos ? st.pos + " · " : ""}RONDA ${st.round + 1} DE ${st.rounds}`
    : `SERIE ${st.set + 1} DE ${st.nSets}`;

  let main;
  if (isRest) {
    const kind = session.restKind || (st.side === 2 ? "side" : "rest");
    const label = kind === "prep" ? "PREPÁRATE" : kind === "side" ? "CAMBIA DE LADO" : "DESCANSO";
    main = `
      <div class="phase rest ${kind === "prep" ? "prep" : ""}">
        <div class="phase-label">${label}</div>
        <div class="ring" id="ring"><div class="ring-num" id="bigTime">${fmt(timerLeft())}</div></div>
        <div class="muted center">A continuación: <b>${esc(ex.name)}</b>${sideLabel(st)}<br>${setLabel.toLowerCase()}</div>
        <div class="row gap mt">
          <button class="btn ghost grow" data-act="minus15">−15 s</button>
          <button class="btn ghost grow" data-act="pause">${session.timer?.running ? "⏸ Pausa" : "▶ Seguir"}</button>
          <button class="btn ghost grow" data-act="plus15">+15 s</button>
        </div>
        <button class="btn primary full big mt" data-act="skipRest">${kind === "prep" ? "Estoy listo" : "Saltar descanso"}</button>
      </div>`;
  } else if (isTimed) {
    const t = session.timer;
    const started = !!t;
    main = `
      <div class="phase work">
        <div class="phase-label">${setLabel} · ${ex.time} s${sideLabel(st).toUpperCase()}</div>
        <div class="ring" id="ring"><div class="ring-num" id="bigTime">${fmt(started ? timerLeft() : ex.time)}</div></div>
        ${
          !started
            ? `<button class="btn primary full big" data-act="startTimed">▶ Iniciar</button>`
            : `<div class="row gap">
                 <button class="btn ghost grow" data-act="pause">${t.running ? "⏸ Pausa" : "▶ Seguir"}</button>
                 <button class="btn ghost grow" data-act="plus15">+15 s</button>
                 <button class="btn ghost grow" data-act="resetTimed">↺</button>
               </div>
               <button class="btn primary full big mt" data-act="doneTimed">✓ Listo</button>`
        }
      </div>`;
  } else if (hasMetro(ex)) {
    const target = +ex.reps;
    const m = session.metro;
    main = `
      <div class="phase work">
        <div class="phase-label">${setLabel} · ${target} REPS${ex.perSide ? " C/LADO" : ""}</div>
        <button class="rep-counter ${m ? "metro-on" : ""}" id="repBtn" data-act="${m ? "metroToggle" : "repPlus"}" aria-label="${m ? "Pausar metrónomo" : "Sumar repetición"}">
          <span id="repNum">${session.reps}</span>
          <small>/ ${target}</small>
          <em id="metroStatus">${m ? metroStatusText(ex) : "toca para contar"}</em>
        </button>
        <div class="tempo-row">
          <button class="btn ghost" data-act="tempoMinus" aria-label="Más rápido">−</button>
          <div class="tempo-val"><b>${tempoOf(ex).toFixed(1).replace(".0", "")} s</b><small>por repetición</small></div>
          <button class="btn ghost" data-act="tempoPlus" aria-label="Más lento">+</button>
        </div>
        ${
          !m
            ? `<button class="btn primary full big mt" data-act="metroStart">${icon("play")} Iniciar conteo</button>
               <button class="text-btn full-w" data-act="doneReps">Marcar serie lista</button>`
            : `<div class="row gap mt">
                 <button class="btn ghost grow" data-act="metroToggle" id="metroPauseBtn">${m.running ? "Pausa" : "Seguir"}</button>
                 <button class="btn ghost grow" data-act="metroReset">Reiniciar</button>
               </div>
               <button class="btn primary full big mt" data-act="doneReps">Serie lista</button>`
        }
      </div>`;
  } else {
    const target = +ex.reps || 0;
    const kg = lastKg[ex.name] ?? "";
    main = `
      <div class="phase work">
        <div class="phase-label">${setLabel}${target ? ` · ${target} REPS${ex.perSide ? " C/LADO" : ""}` : ""}</div>
        <button class="rep-counter" data-act="repPlus" aria-label="Sumar repetición">
          <span id="repNum">${session.reps}</span>
          <small>${target ? `/ ${target}` : "reps"}</small>
          <em>toca para contar</em>
        </button>
        <div class="row gap">
          <button class="btn ghost grow" data-act="repMinus">−1</button>
          <div class="set-clock grow center" id="setClock">⏱ ${fmt((Date.now() - session.setStartedAt) / 1000)}</div>
          <button class="btn ghost grow" data-act="repPlus">+1</button>
        </div>
        ${
          ex.rpe
            ? `<label class="kg-row mt"><span>Peso usado</span>
                 <input id="kgInput" type="number" inputmode="decimal" step="0.5" min="0" placeholder="—" value="${esc(kg)}"><span>kg</span></label>`
            : ""
        }
        <button class="btn primary full big mt" data-act="doneReps">✓ Serie lista</button>
      </div>`;
  }

  $app.innerHTML = `
    <div class="progress"><div style="width:${(session.i / total) * 100}%"></div></div>
    <div class="row between muted small mt">
      <span>${ex.block ? esc(ex.block) + " · " : ""}paso ${session.i + 1} de ${total}</span>
      <span class="dots">${setDots}</span>
    </div>
    ${groupBar}
    <h2 class="ex-name">${esc(ex.name)}</h2>
    <div class="row gap wrap">
      <span class="muted">${esc(exTarget(ex, weekSets()).replace(/ · RPE.*$/, ""))}</span>
      ${ex.rpe ? `<button class="rpe-chip" data-act="rpe">RPE ${esc(ex.rpe)} ⓘ</button>` : ""}
    </div>
    ${main}
    ${ex.notes ? `<p class="notes">${esc(ex.notes)}</p>` : ""}
    <details class="video-box" ${isRest || session.metro || session.timer ? "" : "open"}>
      <summary>Video</summary>
      <div class="video-slot"></div>
    </details>
    <div class="row gap mt">
      <button class="btn ghost grow" data-act="prevEx" ${session.i === 0 ? "disabled" : ""}>‹ Anterior</button>
      <button class="btn ghost grow" data-act="nextEx" ${session.i >= total - 1 ? "disabled" : ""}>Saltar ›</button>
    </div>
    <button class="btn danger-ghost full mt" data-act="finish">Terminar entrenamiento</button>
  `;

  $app.querySelector(".chip.on")?.scrollIntoView({ inline: "center", block: "nearest" });
  window.scrollTo(0, 0);
  const vb = $app.querySelector(".video-box");
  const loadVideo = () => {
    const slot = vb.querySelector(".video-slot");
    if (vb.open && !slot.innerHTML) slot.innerHTML = videoHtml(ex);
  };
  vb.addEventListener("toggle", loadVideo);
  loadVideo();

  bindActs({
    repPlus: () => {
      if (+ex.reps && session.reps >= +ex.reps) {
        buzz(60);
        beep(300, 0.08, 1, 0.2);
        return toast(`Máximo ${ex.reps} repeticiones`);
      }
      session.reps++;
      persist();
      beep(1000, 0.04, 1, 0.3);
      if (+ex.reps && session.reps === +ex.reps) {
        buzz(150);
        beep(1300, 0.12, 2);
      }
      paintLive();
    },
    metroStart: () => {
      unlockAudio();
      ensurePlayback();
      metroStart();
      render();
    },
    metroToggle: () => {
      session.metro?.running ? metroPause() : metroResume();
      render();
    },
    metroReset: () => {
      session.metro = null;
      session.reps = 0;
      persist();
      render();
    },
    tempoMinus: () => {
      metroSetTempo(ex, -0.5);
      render();
    },
    tempoPlus: () => {
      metroSetTempo(ex, 0.5);
      render();
    },
    repMinus: () => {
      session.reps = Math.max(0, session.reps - 1);
      persist();
      paintLive();
    },
    doneReps: () => {
      session.metro = null;
      const entry = { reps: Math.min(session.reps || +ex.reps || 0, +ex.reps || Infinity), time: Math.round((Date.now() - session.setStartedAt) / 1000) };
      const kgIn = document.getElementById("kgInput");
      if (kgIn && kgIn.value !== "") {
        entry.kg = +kgIn.value;
        lastKg[ex.name] = entry.kg;
        save(LS.kg, lastKg);
      }
      logSet(entry);
    },
    startTimed: () => {
      unlockAudio();
      beep(990, 0.15);
      say("Ya");
      timerStart(+ex.time);
      render();
    },
    pause: () => {
      session.timer?.running ? timerPause() : timerResume();
      render();
    },
    resetTimed: () => {
      session.timer = null;
      persist();
      render();
    },
    doneTimed: () => {
      const t = session.timer;
      logSet({ time: t ? Math.round(t.total - timerLeft()) : +ex.time });
    },
    minus15: () => adjustTimer(-15),
    plus15: () => adjustTimer(15),
    skipRest: () => beginWork(true),
    prevEx: () => jumpStep(-1),
    nextEx: () => jumpStep(1),
    rpe: () => go("rpe", { from: "workout" }),
    finish: async () => {
      if (await ask("¿Terminar y guardar el entrenamiento?")) finishSession();
    },
  });
}

function metroStatusText(ex) {
  const m = session.metro;
  if (!m) return "";
  if (m.switchUntil) {
    const left = Math.max(0, Math.ceil(((m.running ? m.switchUntil - Date.now() : m.switchLeft)) / 1000));
    return `cambia de lado · ${left}`;
  }
  if (!m.running) return "en pausa · toca para seguir";
  const sides = metroSides(ex);
  if (ex.alternate) return m.lastBeat % 2 === 0 ? "lado 1" : "lado 2";
  if (Date.now() < m.t0) return "prepárate…";
  return sides > 1 ? `lado ${m.side} de ${sides}` : prefs.metroEvery ? "sigue el pitido" : "sigue el conteo";
}

function adjustTimer(delta) {
  const t = session.timer;
  if (!t) return;
  if (t.running) t.endsAt = Math.max(Date.now(), t.endsAt + delta * 1000);
  else t.remaining = Math.max(0, t.remaining + delta);
  t.total = Math.max(t.total + delta, 1);
  t.lastBeep = null;
  persist();
  paintLive();
}

// Actualiza solo los números (no recrea el video)
function paintLive() {
  const big = document.getElementById("bigTime");
  const ring = document.getElementById("ring");
  if (big && session.timer) {
    const left = timerLeft();
    big.textContent = fmt(left);
    if (ring) {
      const pct = session.timer.total ? (1 - left / session.timer.total) * 100 : 0;
      ring.style.setProperty("--p", pct.toFixed(1));
    }
  }
  const rn = document.getElementById("repNum");
  if (rn) rn.textContent = session.reps;
  const ms = document.getElementById("metroStatus");
  if (ms && session.metro) ms.textContent = metroStatusText(curEx());
  const sc = document.getElementById("setClock");
  if (sc) sc.textContent = "⏱ " + fmt((Date.now() - session.setStartedAt) / 1000);
}

// ============================================================
//  RPE
// ============================================================
function renderRpe() {
  setHeader("Tabla RPE", true);
  const rows = (plan.rpe || [])
    .map(([r, d]) => `<div class="row between hist-row"><b class="rpe-n">${esc(r)}</b><span class="grow">${esc(d)}</span></div>`)
    .join("");
  $app.innerHTML = `
    <div class="card">
      <div class="card-title">Percepción de esfuerzo</div>
      <p class="muted small">RIR = repeticiones en reserva (cuántas más podrías haber hecho).</p>
      ${rows}
    </div>
    ${route.from === "workout" ? `<button class="btn primary full big mt" data-act="back">Volver al ejercicio</button>` : ""}`;
  bindActs({ back: () => go("workout") });
}


// ============================================================
//  COMPARTIR (imagen PNG estilo historia, con o sin fondo)
// ============================================================
function entryStats(e) {
  let ex = 0, sets = 0, reps = 0, vol = 0;
  const mags = [];
  for (const x of e.exercises) {
    if (!x.sets.length) continue;
    ex++;
    let m = 0;
    for (const st of x.sets) {
      if (st.side !== 2) sets++;
      if (st.reps) {
        reps += st.reps;
        m += st.reps;
        if (st.kg) vol += st.reps * st.kg;
      } else if (st.time) m += st.time / 3;
    }
    mags.push(m);
  }
  // agrupa en ~7 latidos para que el pulso se lea limpio
  const beats = [];
  const per = Math.max(1, Math.ceil(mags.length / 7));
  for (let i = 0; i < mags.length; i += per) beats.push(mags.slice(i, i + per).reduce((x, y) => x + y, 0));
  return { ex, sets, reps, vol: Math.round(vol), mags: beats, dur: e.duration };
}

function fmtDur(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}h ${m}m` : `${m}m ${String(s).padStart(2, "0")}s`;
}

const SHARE_W = 1080, SHARE_H = 1920;
const F_DISPLAY = '"Barlow Condensed", "Arial Narrow", sans-serif';
const F_BODY = 'Manrope, -apple-system, "Helvetica Neue", sans-serif';

function spaced(ctx, text, x, y, spacing) {
  // texto con espaciado entre letras, centrado en x
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = x - total / 2;
  const align = ctx.textAlign;
  ctx.textAlign = "left";
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y);
    cx += widths[i] + spacing;
  });
  ctx.textAlign = align;
}

function drawPulse(ctx, mags, cx, cy, w, h, lw) {
  const n = Math.max(1, mags.length);
  const max = Math.max(1, ...mags);
  const seg = w / n;
  const x0 = cx - w / 2;
  const pts = [[x0 - seg * 0.4, cy]];
  mags.forEach((m, i) => {
    const k = 0.35 + 0.65 * Math.sqrt(m / max);
    const x = x0 + i * seg;
    pts.push(
      [x + seg * 0.22, cy],
      [x + seg * 0.3, cy + h * 0.06 * k],
      [x + seg * 0.42, cy - h * 0.5 * k],
      [x + seg * 0.56, cy + h * 0.26 * k],
      [x + seg * 0.66, cy],
      [x + seg * 0.78, cy - h * 0.05 * k],
      [x + seg * 0.88, cy]
    );
  });
  pts.push([x0 + w + seg * 0.4, cy]);
  const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
  g.addColorStop(0, "#ff4f2a");
  g.addColorStop(1, "#ffb648");
  ctx.save();
  ctx.lineWidth = lw;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = g;
  ctx.shadowColor = "rgba(255, 107, 53, 0.55)";
  ctx.shadowBlur = lw * 1.6;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  const [ex, ey] = pts[pts.length - 1];
  ctx.shadowColor = "rgba(94, 200, 242, 0.9)";
  ctx.shadowBlur = lw * 2;
  ctx.fillStyle = "#eafaff";
  ctx.beginPath();
  ctx.arc(ex, ey, lw * 0.95, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMark(ctx, cx, cy, r) {
  // mini versión del ícono: anillo + pulso
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = r * 0.26;
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, "#ff4f2a");
  g.addColorStop(1, "#ffc24a");
  ctx.strokeStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.8);
  ctx.stroke();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = r * 0.14;
  ctx.lineJoin = "round";
  const u = r / 2.6;
  ctx.beginPath();
  [[-1.5, 0], [-0.7, 0], [-0.4, -0.7], [0, 0.95], [0.38, -1.2], [0.72, 0], [1.5, 0]].forEach(([x, y], i) =>
    i ? ctx.lineTo(cx + x * u, cy + y * u) : ctx.moveTo(cx + x * u, cy + y * u)
  );
  ctx.stroke();
  ctx.restore();
}

function drawWordmark(ctx, cx, y, size) {
  ctx.save();
  ctx.font = `800 ${size}px ${F_DISPLAY}`;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const markR = size * 0.36;
  const text = "ENTRENO";
  const sp = size * 0.08;
  const tw = [...text].reduce((a, c) => a + ctx.measureText(c).width, 0) + sp * (text.length - 1);
  const gap = size * 0.3;
  const totalW = markR * 2 + gap + tw;
  const left = cx - totalW / 2;
  drawMark(ctx, left + markR, y, markR);
  spaced(ctx, text, left + markR * 2 + gap + tw / 2, y + size * 0.04, sp);
  ctx.restore();
}

function statBlock(ctx, x, y, label, value, lSize, vSize) {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = `700 ${lSize}px ${F_BODY}`;
  ctx.fillText(label, x, y);
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${vSize}px ${F_DISPLAY}`;
  ctx.fillText(value, x, y + vSize * 0.98);
}

function subtitle(e) {
  const d = new Date(e.date).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
  const wk = e.week != null && plan.weeks?.[e.week] ? ` · SEMANA ${e.week + 1}` : "";
  return `${e.dayName} · ${d}${wk}`.toUpperCase();
}

const SHARE_TEMPLATES = [
  { id: "pulso", name: "Pulso", transparent: true },
  { id: "datos", name: "Datos", transparent: true },
  { id: "tarjeta", name: "Tarjeta", transparent: false },
];

function drawShare(canvas, tpl, e) {
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;
  const ctx = canvas.getContext("2d");
  const st = entryStats(e);
  const W = SHARE_W, H = SHARE_H, cx = W / 2;
  ctx.clearRect(0, 0, W, H);

  if (!tpl.transparent) {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#1c1426");
    bg.addColorStop(1, "#08090d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    [[180, 260, 620, "rgba(255,107,53,0.55)"], [930, 1650, 600, "rgba(47,184,240,0.35)"], [980, 200, 420, "rgba(255,45,111,0.3)"]].forEach(([x, y, r, c]) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, c);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
    // panel de vidrio
    ctx.save();
    const px = 90, py = 470, pw = W - 180, ph = 1060, pr = 64;
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, pr);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fill();
    ctx.lineWidth = 3;
    const rim = ctx.createLinearGradient(0, py, 0, py + ph);
    rim.addColorStop(0, "rgba(255,255,255,0.35)");
    rim.addColorStop(1, "rgba(255,255,255,0.05)");
    ctx.strokeStyle = rim;
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  if (tpl.transparent) {
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 2;
  }

  const three = [
    ["Tiempo", fmtDur(st.dur)],
    ["Ejercicios", String(st.ex)],
    ["Series", String(st.sets)],
  ];

  if (tpl.id === "datos") {
    const rows = [...three, st.vol ? ["Volumen", `${st.vol.toLocaleString("es")} kg`] : ["Repeticiones", String(st.reps)]];
    let y = 560;
    rows.forEach(([l, v]) => {
      statBlock(ctx, cx, y, l, v, 44, 128);
      y += 230;
    });
    ctx.shadowBlur = 0;
    drawPulse(ctx, st.mags, cx, y + 40, 560, 170, 11);
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = tpl.transparent ? 18 : 0;
    drawWordmark(ctx, cx, y + 230, 76);
  } else {
    const top = tpl.transparent ? 640 : 780;
    ctx.save();
    ctx.shadowColor = "transparent";
    drawPulse(ctx, st.mags, cx, top, tpl.transparent ? 820 : 720, 440, 15);
    ctx.restore();
    drawWordmark(ctx, cx, top + 330, 84);
    const colW = tpl.transparent ? 300 : 270;
    three.forEach(([l, v], i) => statBlock(ctx, cx + (i - 1) * colW, top + 470, l, v, 38, 92));
    ctx.font = `700 34px ${F_BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.textAlign = "center";
    spaced(ctx, subtitle(e), cx, top + 680, 3);
  }
  ctx.restore();
}

async function ensureShareFonts() {
  try {
    await Promise.all([
      document.fonts.load(`800 80px ${F_DISPLAY}`),
      document.fonts.load(`700 80px ${F_DISPLAY}`),
      document.fonts.load(`700 40px ${F_BODY}`),
    ]);
  } catch {}
}

function renderShare() {
  const e = history[route.entry];
  if (!e) return go("history");
  setHeader("Compartir", true);
  $app.innerHTML = `
    <div class="share-carousel" id="shareCar">
      ${SHARE_TEMPLATES.map(
        (t, i) => `<figure class="share-slide">
          <div class="share-frame ${t.transparent ? "checker" : ""}"><canvas data-tpl="${i}" aria-label="Vista previa ${esc(t.name)}"></canvas></div>
          <figcaption>${esc(t.name)}${t.transparent ? " · sin fondo" : ""}</figcaption>
        </figure>`
      ).join("")}
    </div>
    <div class="share-dots" id="shareDots">${SHARE_TEMPLATES.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div>
    <div class="share-actions">
      <button class="btn primary big" data-act="shareNow">Compartir o guardar</button>
      <button class="btn ghost big" data-act="copyImg">Copiar para Instagram</button>
    </div>
    <p class="muted small share-help">Para ponerlo sobre una foto: toca <b>Copiar para Instagram</b>, abre tu historia con la foto, mantén presionado y elige <b>Pegar</b>. Con <b>Compartir o guardar</b> puedes elegir <b>Guardar imagen</b> y queda en Fotos sin fondo.</p>`;

  const canvases = [...$app.querySelectorAll("canvas[data-tpl]")];
  const paint = () => canvases.forEach((c) => drawShare(c, SHARE_TEMPLATES[+c.dataset.tpl], e));
  paint();
  ensureShareFonts().then(paint);

  const car = document.getElementById("shareCar");
  const current = () => Math.round(car.scrollLeft / (car.firstElementChild.getBoundingClientRect().width + 14));
  car.addEventListener("scroll", () => {
    const k = current();
    document.querySelectorAll("#shareDots i").forEach((d, i) => d.classList.toggle("on", i === k));
  }, { passive: true });

  const blobOf = () =>
    new Promise((res) => canvases[Math.min(current(), canvases.length - 1)].toBlob((b) => res(b), "image/png"));
  const fileName = () => `entreno-${new Date(e.date).toISOString().slice(0, 10)}-${SHARE_TEMPLATES[current()].id}.png`;

  bindActs({
    shareNow: async () => {
      const blob = await blobOf();
      const file = new File([blob], fileName(), { type: "image/png" });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          return;
        }
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast("Imagen descargada");
    },
    copyImg: async () => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blobOf() })]);
        toast("Copiada ✓ Ahora pégala en tu historia");
      } catch {
        toast("No se pudo copiar; usa Compartir o guardar");
      }
    },
  });
}

// ============================================================
//  RESUMEN E HISTORIAL
// ============================================================
function fmtSet(s) {
  let out = s.reps ? `${s.reps}` : `${s.time}s`;
  if (s.kg) out += `×${s.kg}kg`;
  return out;
}

function statsTiles(e) {
  const st = entryStats(e);
  return `<div class="tiles">
    <div><small>Tiempo</small><b>${fmtDur(st.dur)}</b></div>
    <div><small>Ejercicios</small><b>${st.ex}</b></div>
    <div><small>Series</small><b>${st.sets}</b></div>
  </div>`;
}

function entryHtml(e, idx = null) {
  const rows = e.exercises
    .filter((x) => x.sets.length)
    .map((x) => {
      // une lados de un mismo set
      const bySet = [];
      x.sets.forEach((s) => {
        if (s.side === 2 && bySet.length) bySet[bySet.length - 1] += "/" + fmtSet(s);
        else bySet.push(fmtSet(s));
      });
      return `<div class="row between hist-row"><span>${esc(x.name)}</span><span>${bySet.join(" · ")}</span></div>`;
    })
    .join("");
  const wk = e.week != null && plan.weeks?.[e.week] ? ` · semana ${e.week + 1}` : "";
  return `<div class="card">
    <div class="row between"><div class="card-title">${esc(e.dayName)}</div><span class="muted">${fmtDate(e.date)}</span></div>
    <div class="muted small">Duración ${fmt(e.duration)}${wk}</div>
    <div class="mt">${rows || `<span class="muted small">Sin series registradas</span>`}</div>
    ${idx !== null ? `<button class="text-btn" data-share="${idx}">Compartir</button>` : ""}
  </div>`;
}

function renderSummary() {
  const e = history[route.entry];
  setHeader("Resumen", true);
  $app.innerHTML = `
    <div class="done-hero"><div class="eyebrow">Entrenamiento completado</div><div class="done-title">Buen trabajo</div></div>
    ${e ? statsTiles(e) : ""}
    <button class="btn primary full big mt" data-act="share">Compartir entrenamiento</button>
    ${e ? `<div class="mt">${entryHtml(e)}</div>` : ""}
    <button class="btn ghost full big mt" data-act="home">Volver al inicio</button>`;
  bindActs({ home: () => go("home"), share: () => go("share", { entry: route.entry }) });
}

function renderHistory() {
  setHeader("Historial", true);
  const total = history.length;
  const week = history.filter((h) => Date.now() - h.date < 7 * 864e5).length;
  $app.innerHTML = `
    <div class="grid2">
      <div class="card stat"><b>${total}</b><span class="muted">entrenamientos</span></div>
      <div class="card stat"><b>${week}</b><span class="muted">últimos 7 días</span></div>
    </div>
    <div class="list mt">${history.map((h, i) => entryHtml(h, i)).reverse().join("") || `<p class="muted center">Aún no hay entrenamientos guardados.</p>`}</div>
    ${total ? `<button class="btn danger-ghost full mt" data-act="clear">Borrar historial</button>` : ""}`;
  $app.querySelectorAll("[data-share]").forEach((b) => b.addEventListener("click", () => go("share", { entry: +b.dataset.share })));
  bindActs({
    clear: async () => {
      if (await ask("¿Borrar todo el historial?")) {
        history = [];
        save(LS.history, history);
        render();
      }
    },
  });
}

// ============================================================
//  EDITOR DE PAUTA
// ============================================================
function renderEdit() {
  setHeader("Editar pauta", true);
  $app.innerHTML = `
    <p class="muted small">Edita tu pauta en formato JSON. Campos por ejercicio:
      <code>name</code>, <code>block</code>, <code>group</code>, <code>sets</code> (número o <code>"auto"</code>),
      <code>reps</code> o <code>time</code>, <code>perSide</code>, <code>rest</code>, <code>rpe</code>,
      <code>video</code>, <code>start</code> (minuto del video, ej. <code>"1:35"</code>) y <code>notes</code>. Ver detalles en <code>plan.js</code>.</p>
    <textarea id="planText" spellcheck="false" autocapitalize="off" autocorrect="off">${esc(JSON.stringify(plan, null, 2))}</textarea>
    <div id="planErr" class="error" hidden></div>
    <button class="btn primary full big mt" data-act="savePlan">Guardar</button>
    <div class="grid2 mt">
      <button class="btn ghost" data-act="copyPlan">📋 Copiar</button>
      <button class="btn ghost" data-act="resetPlan">↺ Pauta original</button>
    </div>`;

  const ta = document.getElementById("planText");
  const err = document.getElementById("planErr");
  bindActs({
    savePlan: () => {
      try {
        const p = JSON.parse(ta.value);
        validatePlan(p);
        plan = p;
        save(LS.plan, plan);
        go("home");
      } catch (e) {
        err.hidden = false;
        err.textContent = "Error: " + e.message;
      }
    },
    copyPlan: async () => {
      try {
        await navigator.clipboard.writeText(ta.value);
        toast("Pauta copiada ✓");
      } catch {
        ta.select();
      }
    },
    resetPlan: async () => {
      if (!(await ask("¿Volver a la pauta original del archivo plan.js? Se pierden tus cambios hechos en la app."))) return;
      plan = structuredClone(window.DEFAULT_PLAN);
      save(LS.plan, null);
      render();
    },
  });
}

function validatePlan(p) {
  if (!p || !Array.isArray(p.days)) throw new Error('falta la lista "days"');
  p.days.forEach((d, i) => {
    if (!d.name) throw new Error(`el día ${i + 1} no tiene "name"`);
    if (!Array.isArray(d.exercises)) throw new Error(`el día "${d.name}" no tiene "exercises"`);
    d.exercises.forEach((ex, j) => {
      if (!ex.name) throw new Error(`ejercicio ${j + 1} de "${d.name}" sin "name"`);
    });
  });
  (p.weeks || []).forEach((w, i) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w.start || "")) throw new Error(`semana ${i + 1}: "start" debe ser AAAA-MM-DD`);
  });
}

// ============================================================
//  AJUSTES
// ============================================================
function renderSettings() {
  setHeader("Ajustes", true);
  const opt = (key, label) => `
    <label class="toggle" for="pref-${key}">
      <span>${label}</span>
      <input type="checkbox" id="pref-${key}" data-pref="${key}" ${prefs[key] ? "checked" : ""}>
    </label>`;
  $app.innerHTML = `
    <section class="section first">
      <div class="section-head"><h2>Avisos</h2></div>
      <div class="group">
        ${opt("sound", "Sonidos (pitidos)")}
        ${opt("voice", "Avisos por voz")}
        ${opt("autoRest", "Iniciar descanso automáticamente")}
        ${opt("autoStart", "Arrancar solo el ejercicio tras prepararse")}
        ${opt("metroEvery", "Metrónomo: sonar en cada repetición (si no, solo al inicio y al final)")}
      </div>
    </section>
    <section class="section">
      <div class="section-head"><h2>Preparación entre ejercicios</h2></div>
      <div class="seg" role="radiogroup" aria-label="Segundos de preparación">
        ${[0, 5, 10, 15, 20]
          .map((n) => `<button role="radio" aria-checked="${+prefs.prep === n}" class="${+prefs.prep === n ? "on" : ""}" data-prep="${n}">${n ? n + " s" : "No"}</button>`)
          .join("")}
      </div>
      <p class="muted small">Cuenta regresiva para acomodarte antes de cada ejercicio nuevo. Si el descanso de la pauta es más largo, se usa ese.</p>
      <button class="btn ghost full mt" data-act="test">Probar sonido</button>
      <p class="muted small">Los pitidos suenan aunque el iPhone esté en silencio; súbele el volumen con los botones laterales.</p>
    </section>
    <section class="section">
      <div class="section-head"><h2>Pauta</h2></div>
      <button class="row-link" data-act="edit"><span><b>Editar pauta</b><small>${esc(plan.name || "")} · ${plan.days.length} ${plan.days.length === 1 ? "día" : "días"}</small></span>${icon("chevron")}</button>
    </section>`;
  $app.querySelectorAll("[data-prep]").forEach((b) =>
    b.addEventListener("click", () => {
      prefs.prep = +b.dataset.prep;
      save(LS.prefs, prefs);
      render();
    })
  );
  $app.querySelectorAll("[data-pref]").forEach((c) =>
    c.addEventListener("change", () => {
      prefs[c.dataset.pref] = c.checked;
      save(LS.prefs, prefs);
    })
  );
  bindActs({
    edit: () => go("edit"),
    test: () => {
      unlockAudio();
      ensurePlayback();
      if (!session) setTimeout(stopPlayback, 5000);
      beep(880, 0.15, 2);
      if (prefs.metroEvery) setTimeout(() => [0, 1, 2, 3].forEach((k) => setTimeout(() => click(k === 0, 0.75), k * 500)), 600);
      say("Sonido de prueba");
    },
  });
}

// ---------- ocultar barras al hacer scroll ----------
// Bajando: se esconden el menú inferior y la barra superior. Subiendo o cerca del borde: vuelven.
(() => {
  let lastY = window.scrollY;
  let ticking = false;
  const update = () => {
    ticking = false;
    const y = Math.max(0, window.scrollY);
    const nearBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 8;
    const dy = y - lastY;
    if (y < 40 || nearBottom) document.body.classList.remove("nav-compact");
    else if (dy > 6) document.body.classList.add("nav-compact");
    else if (dy < -6) document.body.classList.remove("nav-compact");
    if (Math.abs(dy) > 6 || y < 40) lastY = y;
  };
  window.addEventListener("scroll", () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
})();

// ---------- inicio ----------
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
if (session && (!session.steps || !plan.days[session.dayIndex])) {
  session = null;
  save(LS.session, null);
}
render();
