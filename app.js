"use strict";

/* ============================================================
   Entreno — app de pauta de entrenamiento (sin dependencias)
   ============================================================ */

// Lo reemplaza la publicación en GitHub por el identificador de la versión.
const APP_VERSION = "__BUILD__";
const DEV_BUILD = APP_VERSION.startsWith("__");

const LS = {
  plan: "entreno.plan",
  history: "entreno.history",
  session: "entreno.session",
  prefs: "entreno.prefs",
  kg: "entreno.kg",
};

// ¿Se abrió desde el ícono de inicio? Varias señales, porque iOS no siempre las informa todas.
// El acceso directo abre "?app=1" (start_url del manifest) y lo recordamos: en iOS la app de
// inicio tiene su propio almacenamiento, separado de Safari.
const STANDALONE = (() => {
  let flag = false;
  try {
    if (new URLSearchParams(location.search).get("app") === "1") localStorage.setItem("entreno.homeapp", "1");
    flag = localStorage.getItem("entreno.homeapp") === "1";
  } catch {}
  return (
    flag ||
    window.navigator.standalone === true ||
    ["standalone", "fullscreen", "minimal-ui"].some((m) => window.matchMedia(`(display-mode: ${m})`).matches)
  );
})();
document.documentElement.classList.toggle("standalone", STANDALONE);

// ---------- marco de la app ----------
// La página no hace scroll: solo el contenido (#app). El marco (#shell) mide
// exactamente la pantalla, así el menú y todo lo "fijo abajo" queda anclado al borde
// aunque iOS calcule mal el alto (app en inicio, rebote, teclado).
const $shell = document.getElementById("shell");
const safeTopProbe = document.createElement("div");
safeTopProbe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;height:env(safe-area-inset-top)";
document.documentElement.appendChild(safeTopProbe);
// 100lvh = alto de la pantalla sin barras del navegador (lo que corresponde en la app de inicio)
const lvhProbe = document.createElement("div");
lvhProbe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;height:100lvh;width:1px;top:0";
document.documentElement.appendChild(lvhProbe);
let viewportInfo = "";
function setAppHeight() {
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  const ih = window.innerHeight;
  const sh = screen.height;
  const safeTop = safeTopProbe.offsetHeight || 0;
  // iOS (app abierta desde el ícono, barra de estado translúcida) a veces informa un alto
  // más corto que la pantalla: justo le falta la barra de estado. Si eso es lo que falta
  // (o sabemos que es la app de inicio), usamos el alto real de la pantalla.
  const lvh = lvhProbe.offsetHeight || 0;
  const missingStatusBar = portrait && ih < sh && ih + safeTop >= sh - 16;
  // En la app de inicio no hay barra de Safari: usamos la medida más grande que no supere la pantalla.
  const appMode = STANDALONE || missingStatusBar;
  const full = portrait ? Math.max(ih, Math.min(sh, Math.max(lvh, sh))) : Math.max(ih, lvh);
  const h = appMode ? full : ih;
  document.documentElement.style.setProperty("--app-h", h + "px");
  viewportInfo = `${sh}/${ih}/${lvh}+${safeTop}→${h}${STANDALONE ? " app" : ""}`;
}
setAppHeight();
window.addEventListener("pageshow", setAppHeight);
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && setAppHeight());
window.addEventListener("resize", setAppHeight);
window.addEventListener("orientationchange", () => setTimeout(setAppHeight, 300));
// si iOS desplaza la ventana (p. ej. al cerrar el teclado), la devolvemos a su lugar
const resetWindowScroll = () => {
  if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
};
document.addEventListener("focusout", () => setTimeout(resetWindowScroll, 50));
window.addEventListener("scroll", resetWindowScroll, { passive: true });

// ---------- panel inferior (bottom sheet) ----------
let closeSheet = null;
let sheetCtl = null; // { wrap, sheet, setContent }
/*
  Patrón de interacción: todo detalle secundario se abre en este panel inferior.
  Si ya hay uno abierto, se reemplaza su contenido (con "‹ volver" opcional) en vez de apilar.
  opts: { title, subtitle, body, footer, back, onMount(el, close), onClose }
*/
function openSheet(opts) {
  if (sheetCtl && sheetCtl.wrap.isConnected) {
    sheetCtl.setContent(opts, true);
    return closeSheet;
  }
  const wrap = document.createElement("div");
  wrap.className = "sheet-wrap";
  wrap.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <section class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-grab" aria-hidden="true"></div>
      <header class="sheet-head"></header>
      <div class="sheet-body"></div>
      <footer class="sheet-foot"></footer>
    </section>`;
  $shell.appendChild(wrap);
  document.body.classList.add("sheet-open");
  const sheet = wrap.querySelector(".sheet");
  const shead = wrap.querySelector(".sheet-head");
  const sbody = wrap.querySelector(".sheet-body");
  const sfoot = wrap.querySelector(".sheet-foot");
  let current = opts;

  const close = (instant = false) => {
    if (!wrap.isConnected) return;
    closeSheet = null;
    sheetCtl = null;
    document.body.classList.remove("sheet-open");
    current.onClose?.();
    if (instant === true) return wrap.remove();
    wrap.classList.remove("open");
    sheet.style.transform = "";
    setTimeout(() => wrap.remove(), 300);
  };

  const setContent = (o, animate) => {
    const prev = current;
    current = o;
    if (animate && prev !== o) prev.onClose?.();
    sheet.setAttribute("aria-label", o.title || "");
    shead.innerHTML = `
      ${o.back ? `<button class="sheet-back" data-back aria-label="Volver">${icon("back")}</button>` : ""}
      <div class="sheet-title"><h3>${esc(o.title || "")}</h3>${o.subtitle ? `<small>${o.subtitle}</small>` : ""}</div>
      <button class="sheet-x" data-close aria-label="Cerrar">${icon("close")}</button>`;
    sbody.innerHTML = o.body || "";
    sbody.hidden = !o.body;
    sfoot.innerHTML = o.footer || "";
    sfoot.hidden = !o.footer;
    sbody.scrollTop = 0;
    shead.querySelector("[data-close]").addEventListener("click", () => close());
    shead.querySelector("[data-back]")?.addEventListener("click", () => o.back());
    if (animate) {
      [shead, sbody, sfoot].forEach((el) => {
        el.classList.remove("swap");
        void el.offsetWidth;
        el.classList.add("swap");
      });
    }
    o.onMount?.(sheet, close);
  };

  // Cerrar tocando afuera, solo si es un toque intencional:
  // - el toque empieza y termina en el fondo (no un arrastre desde el panel)
  // - no hubo toques dentro del panel en el último ~0,6 s (toques rápidos que se escapan)
  // - la pantalla no está agrandada con zoom
  const backdrop = wrap.querySelector(".sheet-backdrop");
  let lastInside = 0, downOnBackdrop = false;
  sheet.addEventListener("pointerdown", () => (lastInside = Date.now()));
  sheet.addEventListener("click", () => (lastInside = Date.now()));
  backdrop.addEventListener("pointerdown", () => (downOnBackdrop = true));
  backdrop.addEventListener("click", () => {
    const zoomed = window.visualViewport && window.visualViewport.scale > 1.02;
    const recent = Date.now() - lastInside < 600;
    const ok = downOnBackdrop && !zoomed && !recent;
    downOnBackdrop = false;
    if (ok) close();
  });
  setContent(opts, false);
  sheetCtl = { wrap, sheet, setContent };
  closeSheet = close;
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add("open")));

  // arrastrar hacia abajo para cerrar
  let y0 = null, dy = 0;
  sheet.addEventListener("touchstart", (e) => {
    if (e.target.closest("button, input, label, a, iframe, video, .kg-stepper")) return;
    if (sbody.scrollTop > 0 && !e.target.closest(".sheet-head, .sheet-grab")) return;
    y0 = e.touches[0].clientY;
    dy = 0;
    sheet.style.transition = "none";
  }, { passive: true });
  sheet.addEventListener("touchmove", (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener("touchend", () => {
    if (y0 === null) return;
    y0 = null;
    sheet.style.transition = "";
    if (dy > 110) close();
    else sheet.style.transform = "";
  });
  return close;
}

// Última vez que registraste peso en este ejercicio (desde el historial)
function lastWeightLog(name) {
  for (let i = history.length - 1; i >= 0; i--) {
    const x = history[i].exercises.find((e) => e.name === name);
    const sets = x ? x.sets.filter((st) => st.kg) : [];
    if (sets.length) {
      const top = sets.reduce((a, b) => (b.kg > a.kg ? b : a));
      return { kg: top.kg, reps: top.reps, time: top.time, date: history[i].date };
    }
  }
  return null;
}

function fmtKg(v) {
  return String(Math.round(v * 10) / 10).replace(".", ",");
}

// Bloque de esfuerzo + peso dentro del detalle del ejercicio
function effortBlockHtml(ex) {
  if (!ex.rpe) return "";
  const plain = rpePlain(ex.rpe, !!ex.time);
  const last = lastWeightLog(ex.name);
  const kg = lastKg[ex.name] ?? last?.kg;
  const lastTxt = last
    ? `Última sesión: <b>${fmtKg(last.kg)} kg</b>${last.reps ? ` × ${last.reps}` : last.time ? ` · ${last.time} s` : ""} · ${fmtDate(last.date)}`
    : "Aún sin registros: anota con qué peso partes.";
  return `<section class="effort">
    <div class="effort-head"><span class="rpe-badge">RPE ${esc(ex.rpe)}</span><b>${esc(plain.short)}</b></div>
    <p class="effort-text">${esc(plain.long)}</p>
    <div class="kg-stepper" role="group" aria-label="Peso para ${esc(ex.name)}">
      <button class="kg-btn" data-kg="-1" aria-label="Restar 1 kg">−1</button>
      <button class="kg-btn small" data-kg="-0.5" aria-label="Restar medio kilo">−½</button>
      <label class="kg-val" for="sheetKg"><input id="sheetKg" type="number" inputmode="decimal" step="0.5" min="0" placeholder="—" value="${kg ?? ""}"><span>kg</span></label>
      <button class="kg-btn small" data-kg="0.5" aria-label="Sumar medio kilo">+½</button>
      <button class="kg-btn" data-kg="1" aria-label="Sumar 1 kg">+1</button>
    </div>
    <p class="effort-last">${lastTxt}<span class="kg-saved" id="kgSaved" aria-live="polite"></span></p>
  </section>`;
}

function bindEffort(el, ex) {
  const input = el.querySelector("#sheetKg");
  if (!input) return;
  const saved = el.querySelector("#kgSaved");
  let t = null;
  const store = () => {
    const v = input.value === "" ? null : Math.max(0, Math.round(parseFloat(input.value.replace(",", ".")) * 2) / 2);
    if (v === null || isNaN(v)) delete lastKg[ex.name];
    else lastKg[ex.name] = v;
    save(LS.kg, lastKg);
    // si el ejercicio está en pantalla, actualiza su campo de kg
    const wkIn = document.getElementById("kgInput");
    if (wkIn && session && curEx()?.name === ex.name) wkIn.value = v ?? "";
    saved.textContent = " · Guardado ✓";
    clearTimeout(t);
    t = setTimeout(() => (saved.textContent = ""), 1400);
  };
  el.querySelectorAll("[data-kg]").forEach((b) =>
    b.addEventListener("click", () => {
      const cur = parseFloat((input.value || "0").replace(",", ".")) || 0;
      input.value = Math.max(0, Math.round((cur + parseFloat(b.dataset.kg)) * 2) / 2);
      store();
    })
  );
  input.addEventListener("change", store);
  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(store, 500);
  });
}

function techSheet(ex, wk, { back } = {}) {
  const chips = [exTarget(ex, wk)].filter(Boolean).map((t) => `<span class="sheet-chip">${esc(t)}</span>`).join("");
  openSheet({
    title: ex.name,
    subtitle: [...new Set([ex.block, ex.group && ex.group.length > 1 ? ex.group : ex.group ? "Superserie " + ex.group : ""].filter(Boolean))].map(esc).join(" · "),
    back,
    body: `
      <div class="sheet-chips">${chips}</div>
      ${effortBlockHtml(ex)}
      ${ex.notes ? `<p class="sheet-notes">${esc(ex.notes)}</p>` : ""}
      <div class="sheet-video">${videoHtml(ex)}</div>`,
    onMount: (el) => bindEffort(el, ex),
  });
}

// Lista de ejercicios del día (agrupada por bloques y circuitos)
function dayListHtml(day, wk) {
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
        <button class="ex-row ${g.name ? "in-group" : "card"}" data-ex="${i}" aria-label="${esc(ex.name)}: ver técnica">
          <span class="num">${esc(tag)}</span>
          <span class="grow">
            <span class="card-title">${esc(ex.name)}</span>
            <span class="muted block small">${esc(exTarget(ex, wk))}</span>
          </span>
          ${icon("chevron")}
        </button>`;
      })
      .join("");
    if (label) {
      const restR = +members[members.length - 1].rest || 0;
      html += `<div class="card group-card">
        <div class="group-head row between"><b>${esc(label)}</b><span class="muted small">${rounds} ${rounds === 1 ? "ronda" : "rondas"}${restR ? ` · descanso ${restR} s` : ""}</span></div>
        ${items}
      </div>`;
    } else html += items;
  }
  return `<div class="list">${html}</div>`;
}

function daySheet(di) {
  const day = plan.days[di];
  if (!day) return;
  const wk = weekSets();
  const live = session && session.dayIndex === di;
  openSheet({
    title: day.name,
    subtitle: `${wk} series · ${day.exercises.length} ejercicios · ~${estimateMin(day, wk)} min`,
    body: dayListHtml(day, wk),
    footer: `<button class="btn primary full big" data-act="go">${icon("play")} ${live ? "Continuar entrenamiento" : "Empezar"}</button>`,
    onMount: (el, close) => {
      el.querySelectorAll("[data-ex]").forEach((b) =>
        b.addEventListener("click", () => techSheet(day.exercises[+b.dataset.ex], wk, { back: () => daySheet(di) }))
      );
      el.querySelector('[data-act="go"]').addEventListener("click", async () => {
        close(true);
        if (live) return go("workout");
        if (session && !(await ask("Hay otro entrenamiento en curso. ¿Descartarlo y empezar este?", "Empezar"))) return;
        startSession(di);
      });
    },
  });
}


// ============================================================
//  RPE en lenguaje simple
//  RPE = qué tan duro (1–10). Lo práctico: 10 − RPE = repeticiones que te quedan.
// ============================================================
const RPE_SCALE = [
  ["10", "0", "Al límite: no podrías hacer ni una más"],
  ["9.5", "0", "Ninguna más, pero podrías subir un poco el peso"],
  ["9", "1", "Te queda 1 en el tanque"],
  ["8.5", "1–2", "Te quedan 1 o 2"],
  ["8", "2", "Te quedan 2: duro pero controlado"],
  ["7.5", "2–3", "Te quedan 2 o 3"],
  ["7", "3", "Te quedan 3: exigente y cómodo"],
  ["5–6", "4–6", "Te quedan varias: ritmo de trabajo"],
  ["3–4", "+6", "Suave, como calentamiento"],
  ["1–2", "—", "Casi sin esfuerzo"],
];

// "8-9" → { lo: 8, hi: 9 }
function rpeRange(rpe) {
  const n = String(rpe).split(/[-–]/).map((x) => parseFloat(x.replace(",", "."))).filter((x) => !isNaN(x));
  return n.length ? { lo: Math.min(...n), hi: Math.max(...n) } : null;
}

// Texto corto y largo para un objetivo de RPE
function rpePlain(rpe, timed = false) {
  const r = rpeRange(rpe);
  if (!r) return { short: `RPE ${rpe}`, long: "" };
  if (timed) {
    const v = r.hi;
    const short = v >= 9.5 ? "Hasta el límite" : v >= 9 ? "Casi al límite" : v >= 8 ? "Exigente, con margen" : "Firme y cómodo";
    const long =
      v >= 9
        ? "Al terminar el tiempo deberías sentir que casi no aguantabas más."
        : v >= 8
        ? "Al terminar deberías sentir que podías aguantar unos segundos más, no muchos."
        : "Debería costar, pero terminar con bastante margen.";
    return { short, long };
  }
  const a = Math.max(0, Math.round(10 - r.hi)), b = Math.max(0, Math.round(10 - r.lo));
  if (b === 0) return { short: "Hasta el límite", long: "Termina sin poder hacer otra repetición con buena técnica." };
  const n = a === b ? `${a}` : `${a}–${b}`;
  const reps = a === b && a === 1 ? "repetición" : "repeticiones";
  return {
    short: `Deja ${n} en reserva`,
    long: `Elige un peso con el que, al terminar, sientas que podrías hacer ${a === b ? a : `${a} o ${b}`} ${reps} más con buena técnica. Si podías bastantes más, sube el peso; si no llegas a las repeticiones, bájalo.`,
  };
}

function rpeTableHtml(highlight) {
  const hl = rpeRange(highlight);
  return `<div class="rpe-table">
    <div class="rpe-th"><span>RPE</span><span>Te quedan</span><span>Cómo se siente</span></div>
    ${RPE_SCALE.map(([r, rir, d]) => {
      const rr = rpeRange(r);
      const on = hl && rr && rr.hi >= hl.lo && rr.lo <= hl.hi;
      return `<div class="rpe-tr ${on ? "on" : ""}"><b>${r}</b><span>${rir}</span><span>${esc(d)}</span></div>`;
    }).join("")}
  </div>`;
}

const RPE_INTRO = `<p class="rpe-intro"><b>RPE</b> es qué tan duro fue, del 1 al 10. La forma fácil de leerlo:
  <b>10 − RPE = cuántas repeticiones más podrías haber hecho</b> con buena técnica al terminar la serie.
  Por ejemplo, RPE 8 → te deberían quedar 2.</p>`;

// Panel RPE: si viene de un ejercicio, explica ese objetivo y lo marca en la tabla
function rpeSheet(ex) {
  const plain = ex ? rpePlain(ex.rpe, !!ex.time) : null;
  openSheet({
    title: ex ? plain.short : "Esfuerzo (RPE)",
    subtitle: ex ? `${esc(ex.name)} · RPE ${esc(ex.rpe)}` : "Qué tan duro debería sentirse",
    body: `
      ${ex ? effortBlockHtml(ex) : ""}
      ${RPE_INTRO}
      ${rpeTableHtml(ex ? ex.rpe : null)}`,
    onMount: (el) => ex && bindEffort(el, ex),
  });
}

function entrySheet(idx) {
  const e = history[idx];
  if (!e) return;
  openSheet({
    title: e.dayName,
    subtitle: `${fmtDate(e.date)} · ${fmt(e.duration)}`,
    body: `${statsTiles(e)}<div class="sheet-entry">${entryHtml(e)}</div>`,
    footer: `<button class="btn primary full big" data-act="share">Compartir entrenamiento</button>`,
    onMount: (el, close) =>
      el.querySelector('[data-act="share"]').addEventListener("click", () => {
        close(true);
        go("share", { entry: idx });
      }),
  });
}

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
  { sound: true, voice: true, autoRest: true, week: "auto", prep: 10, autoStart: true },
  load(LS.prefs, {})
);
let lastTempo = load("entreno.tempo", {});
// Todos los conteos parten en 1,5 s por repetición: se reinician una vez los ritmos guardados antes.
if (!localStorage.getItem("entreno.tempo.v15")) {
  lastTempo = {};
  save("entreno.tempo", lastTempo);
  localStorage.setItem("entreno.tempo.v15", "1");
}

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
  if (ex.rpe) parts.push(rpePlain(ex.rpe, !!ex.time).short.toLowerCase());
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
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    openSheet({
      title: msg,
      footer: `<div class="sheet-actions">
        <button class="btn primary full big" data-r="1">${esc(okText)}</button>
        <button class="btn ghost full big" data-r="0">Cancelar</button></div>`,
      onClose: () => finish(false),
      onMount: (el, close) =>
        el.querySelectorAll("[data-r]").forEach((b) =>
          b.addEventListener("click", () => {
            finish(b.dataset.r === "1");
            close();
          })
        ),
    });
  });
}
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  $shell.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

const SIDE_NAME = { 1: "derecho", 2: "izquierdo" };
const SIDE_LABEL = { 1: "Derecho", 2: "Izquierdo" };

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
        // Por lado = dos pasos (derecho, luego izquierdo), salvo el conteo con metrónomo
        // (cambia de lado solo) y los alternados (dead bug).
        const metro = !m.ex.time && +m.ex.reps > 0 && +m.ex.tempo > 0;
        const sides = m.ex.perSide && !m.ex.alternate && !metro ? 2 : 1;
        for (let s = 1; s <= sides; s++) {
          const lastInRound = k === active.length - 1 && s === sides;
          let rest;
          if (s < sides) rest = m.ex.time ? 5 : 0; // cambio de lado
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
      // si el sistema pausa el audio de fondo (p. ej. al hablar), lo retomamos sin tocar el entrenamiento
      keepAlive.addEventListener("pause", () => {
        if (session && !keepAlive.dataset.stopped) setTimeout(() => keepAlive.play().catch(() => {}), 250);
      });
    }
    delete keepAlive.dataset.stopped;
    keepAlive.play().catch(() => {});
  } catch {}
}
function stopPlayback() {
  try {
    if (keepAlive) keepAlive.dataset.stopped = "1";
    keepAlive?.pause();
  } catch {}
}

function unlockAudio() {
  unlockSfx();
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

// Sonidos de la app (solo estos):
//  count  = cuenta regresiva 3-2-1 del "Prepárate"
//  start  = empieza el ejercicio (o el otro lado)
//  end    = termina el ejercicio (o un lado)
//  finish = termina el entrenamiento
const SFX = { count: [660, 0.1, 1, 0.45], start: [990, 0.2, 1, 0.5], end: [1175, 0.2, 2, 0.5], finish: [1320, 0.18, 3, 0.45] };
// Cada pitido se genera una vez como un WAV corto y se reproduce con <audio>:
// en iOS sigue sonando aunque la voz o el sistema interrumpan el motor Web Audio.
function toneWavUrl(kind) {
  const [f, d, n] = SFX[kind];
  const rate = 22050, gap = 0.08;
  const total = Math.ceil(rate * (n * d + (n - 1) * gap + 0.05));
  const buf = new ArrayBuffer(44 + total * 2), v = new DataView(buf);
  const w = (o, str) => [...str].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + total * 2, true); w(8, "WAVEfmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, total * 2, true);
  for (let i = 0; i < total; i++) {
    const t = i / rate;
    const k = Math.floor(t / (d + gap));
    const local = t - k * (d + gap);
    let x = 0;
    if (k < n && local < d) {
      const env = Math.min(1, local / 0.006) * Math.exp((-5 * local) / d); // ataque corto, caída suave
      x = 0.62 * env * (Math.sin(2 * Math.PI * f * local) + 0.18 * Math.sin(4 * Math.PI * f * local));
    }
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 32767, true);
  }
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}
const sfxEls = {};
function sfxEl(kind) {
  if (!sfxEls[kind]) {
    const a = new Audio(toneWavUrl(kind));
    a.preload = "auto";
    a.setAttribute("playsinline", "");
    sfxEls[kind] = a;
  }
  return sfxEls[kind];
}
// iOS exige un toque para habilitar cada sonido: se "desbloquean" en silencio al empezar
let sfxUnlocked = false;
function unlockSfx() {
  if (sfxUnlocked) return;
  sfxUnlocked = true;
  Object.keys(SFX).forEach((k) => {
    const a = sfxEl(k);
    a.muted = true;
    const p = a.play();
    const done = () => {
      a.pause();
      a.currentTime = 0;
      a.muted = false;
    };
    p && p.then ? p.then(done, () => ((a.muted = false), (sfxUnlocked = false))) : done();
  });
}
function sfx(kind) {
  if (!prefs.sound) return;
  try {
    const a = sfxEl(kind);
    a.muted = false;
    a.currentTime = 0;
    const p = a.play();
    if (p && p.catch) p.catch(() => {
      const [f, d, n, v] = SFX[kind];
      beep(f, d, n, v); // respaldo
    });
  } catch {
    const [f, d, n, v] = SFX[kind];
    beep(f, d, n, v);
  }
}


// iOS puede mandar "pausa"/"play" al panel Ahora suena cuando la voz o un cambio de
// estado toman el audio. Esas órdenes no son tuyas: las ignoramos durante un momento.
let ignoreMediaUntil = 0;
function shieldMedia(ms) {
  ignoreMediaUntil = Math.max(ignoreMediaUntil, Date.now() + ms);
}

function say(text) {
  if (!prefs.voice || !("speechSynthesis" in window)) return;
  shieldMedia(Math.min(6000, 1800 + text.length * 90));
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
  closeSheet?.(true);
  route = { view, ...params };
  document.body.classList.remove("nav-compact");
  render();
  $app.scrollTop = 0;
}

$back.addEventListener("click", () => {
  if (route.view === "workout") return go("home");
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

// ---------- estado visual (trabajo / preparación / descanso / cambio de lado) ----------
let lastState = null;
function currentState() {
  if (route.view === "summary") return "done";
  if (route.view !== "workout" || !session) return "idle";
  if (session.phase === "rest") return session.restKind || (curStep().side === 2 ? "side" : "rest");
  if (session.metro?.switchUntil) return "side";
  return "work";
}
// Actualiza el estado sin redibujar (p. ej. cambio de lado dentro del conteo)
function syncState() {
  const s = currentState();
  if (s === lastState) return;
  document.documentElement.dataset.state = s;
  lastState = s;
  const t = document.getElementById("stateTxt");
  if (t) t.textContent = STATE_LABEL[s] || "";
  const ph = $app.querySelector(".phase");
  if (ph) {
    ph.classList.remove("morph");
    void ph.offsetWidth;
    ph.classList.add("morph");
  }
}
const STATE_LABEL = { work: "En ejercicio", prep: "Prepárate", side: "Cambia de lado", rest: "Descanso", done: "Completado" };

function render() {
  const state = currentState();
  const changed = lastState !== null && state !== lastState && route.view === "workout";
  renderNow(state, changed);
}

function renderNow(state, changed) {
  document.documentElement.dataset.state = state;
  lastState = state;
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
  const prevView = renderNow.lastView;
  renderNow.lastView = route.view;
  (views[route.view] || renderHome)();
  renderTabbar();
  if (prevView !== route.view) {
    $app.classList.remove("view-enter");
    void $app.offsetWidth;
    $app.classList.add("view-enter");
  }
  if (changed) $app.querySelector(".phase")?.classList.add("morph");
  updateNowPlaying(true);
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
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v5h5"/>',
  minus: '<path d="M6 12h12"/>',
  minus15: '<path d="M3 12h5"/><text x="9.5" y="16" font-size="10" font-weight="700" fill="currentColor" stroke="none" font-family="sans-serif">15</text>',
  plus15: '<path d="M3 12h5M5.5 9.5v5"/><text x="9.5" y="16" font-size="10" font-weight="700" fill="currentColor" stroke="none" font-family="sans-serif">15</text>',
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
        <button class="last" data-last aria-label="Ver detalle del último entrenamiento"><span><b>${esc(lastEntry.dayName)}</b><small>${fmtDate(lastEntry.date)}</small></span><span class="last-dur">${fmt(lastEntry.duration)}</span>${icon("chevron")}</button></section>`
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
  $app.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => daySheet(+b.dataset.day)));
  $app.querySelector("[data-last]")?.addEventListener("click", () => entrySheet(history.length - 1));
  bindActs({
    start: () => startSession(di),
    preview: () => daySheet(di),
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
        cancelScheduled();
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
  ["rpe", "gauge", "Esfuerzo"],
  ["settings", "settings", "Ajustes"],
];
const $tabbar = document.createElement("nav");
$tabbar.className = "tabbar";
$tabbar.setAttribute("aria-label", "Secciones");
$shell.appendChild($tabbar);
function renderTabbar() {
  const v = route.view;
  const show = ["home", "history", "rpe", "settings"].includes(v) && !(v === "rpe" && route.from === "workout");
  document.body.classList.toggle("has-tabbar", show);
  document.body.classList.toggle("is-home", v === "home");
  document.body.classList.toggle("is-workout", v === "workout");
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
  const html = dayListHtml(day, wk);

  const otherSession = session && session.dayIndex !== route.dayIndex;
  $app.innerHTML = `
    ${html}
    <div class="sticky-bottom">
      ${
        session && !otherSession
          ? `<button class="btn primary full big" data-act="resume">Continuar entrenamiento</button>`
          : `<button class="btn primary full big" data-act="start">▶ Comenzar</button>`
      }
    </div>`;

  $app.querySelectorAll("[data-ex]").forEach((b) =>
    b.addEventListener("click", () => techSheet(day.exercises[+b.dataset.ex], wk))
  );

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
  unlockSfx();
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
let scheduledTimeouts = [];
function cancelScheduled() {
  scheduledTimeouts.forEach(clearTimeout);
  scheduledTimeouts = [];
}
// Agenda la cuenta 3-2-1 (solo en "Prepárate") y el aviso del final del temporizador.
function scheduleTimerSounds() {
  cancelScheduled();
  const t = session?.timer;
  if (!t || !t.running) return;
  const leftMs = t.endsAt - Date.now();
  const at = (ms, kind) => ms >= -50 && scheduledTimeouts.push(setTimeout(() => sfx(kind), Math.max(0, ms)));
  if (session.phase === "work") at(leftMs, "end");
  else {
    if (session.restKind === "prep") [3, 2, 1].forEach((k) => leftMs - k * 1000 > 50 && at(leftMs - k * 1000, "count"));
    at(leftMs, "start");
  }
  t.sched = true;
}

function timerStart(seconds) {
  shieldMedia(1200);
  session.timer = { running: true, total: seconds, endsAt: Date.now() + seconds * 1000, remaining: seconds, lastBeep: null };
  scheduleTimerSounds();
  persist();
}
function timerPause() {
  const t = session.timer;
  if (!t || !t.running) return;
  t.remaining = Math.max(0, (t.endsAt - Date.now()) / 1000);
  t.running = false;
  cancelScheduled();
  persist();
}
function timerResume() {
  const t = session.timer;
  if (!t || t.running) return;
  t.endsAt = Date.now() + t.remaining * 1000;
  t.running = true;
  scheduleTimerSounds();
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
    if (!t.sched && session.phase === "rest" && session.restKind === "prep" && whole <= 3 && whole > 0 && t.lastBeep !== whole) {
      t.lastBeep = whole;
      sfx("count");
    }
    if (left <= 0) {
      t.running = false;
      t.remaining = 0;
      onTimerDone();
      return;
    }
  }
  if (route.view === "workout") paintLive();
  if (Date.now() - npAt > 1500) {
    npAt = Date.now();
    updateNowPlaying();
  }
}

function onTimerDone() {
  const sched = session.timer?.sched;
  if (session.phase === "work") {
    if (!sched) sfx("end");
    buzz([200, 100, 200]);
    logSet({ time: curEx().time });
  } else {
    if (!sched) sfx("start");
    buzz([300, 100, 300]);
    const st = curStep();
    if (!(prefs.autoStart && (curEx().time || hasMetro(curEx())))) say(st.side ? `Lado ${SIDE_NAME[st.side]}` : "¡Vamos!");
    beginWork(true, { quiet: true }); // el pitido de inicio ya sonó al terminar la cuenta
  }
}

// ---------- metrónomo (repeticiones guiadas por pitido) ----------
const hasMetro = (ex) => !ex.time && +ex.reps > 0 && +ex.tempo > 0;
const tempoOf = (ex) => +(lastTempo[ex.name] ?? ex.tempo) || 1.5;
const metroBeats = (ex) => +ex.reps * (ex.alternate ? 2 : 1);
const metroSides = (ex) => (ex.perSide && !ex.alternate ? 2 : 1);

function bumpRep() {
  const el = document.getElementById("repNum");
  if (!el) return;
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
}

function metroStart(quiet = false) {
  const ex = curEx();
  session.metro = { running: true, t0: Date.now() + 500, elapsed: 0, side: 1, switchUntil: null, switchLeft: 0, lastBeat: -1, lastHalf: -1, lastCount: null, quiet };
  session.reps = 0;
  session.setStartedAt = Date.now();
  say(ex.perSide ? (ex.alternate ? "Alterna, empieza con el derecho" : "Lado derecho") : "Sigue el conteo");
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
    if (now >= m.switchUntil) {
      sfx("start");
      setTimeout(() => route.view === "workout" && render(), 0);
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
      setTimeout(() => route.view === "workout" && render(), 0);
      m.lastCount = null;
      session.reps = +ex.reps;
      sfx("end");
      say(`Cambia al lado ${SIDE_NAME[m.side + 1]}`);
      persist();
      paintLive();
      return;
    }
    session.reps = +ex.reps;
    session.metro = null;
    sfx("end");
    buzz([150, 80, 150]);
    logSet({ reps: +ex.reps, time: Math.round((now - session.setStartedAt) / 1000) });
    return;
  }
  if (beat !== m.lastBeat) {
    m.lastBeat = beat;
    session.reps = ex.alternate ? Math.floor(beat / 2) + 1 : beat + 1;
    // solo suena al empezar (si no sonó ya al terminar la cuenta); el conteo se ve en pantalla
    if (beat === 0 && m.side === 1 && !m.quiet) sfx("start"); // el 2º lado ya sonó al terminar el cambio
    bumpRep();
    persist();
  }
}

function logSet(entry) {
  const st = curStep();
  const exNow = curEx();
  if (exNow.rpe && entry.kg === undefined) {
    const k = lastKg[exNow.name] ?? lastWeightLog(exNow.name)?.kg;
    if (k != null) entry.kg = k;
  }
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
    if (kind === "side") say(`Cambia al lado ${SIDE_NAME[next.side] || "izquierdo"}`);
    else if (kind === "prep") say(`Prepárate: ${nextEx.name}${nextEx.perSide ? (nextEx.alternate ? ", alternando, parte con el derecho" : ", lado derecho") : ""}`);
    else if (changing) say(`Descanso. Luego, ${nextEx.name}`);
    else say("Descanso");
    persist();
    render();
  } else {
    if (changing) say(`${nextEx.name}${next.side ? `, lado ${SIDE_NAME[next.side]}` : ""}`);
    else if (next.side) say(`Lado ${SIDE_NAME[next.side]}`);
    beginWork(true);
  }
}

function beginWork(auto = false, { quiet = false } = {}) {
  shieldMedia(1500);
  cancelScheduled();
  session.phase = "work";
  session.timer = null;
  session.metro = null;
  session.reps = 0;
  session.setStartedAt = Date.now();
  if (auto && prefs.autoStart) {
    const ex = curEx();
    if (ex.time) {
      timerStart(+ex.time);
      if (!quiet) sfx("start");
      if (!quiet) say("Ya");
    } else if (hasMetro(ex)) {
      metroStart(quiet);
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
  cancelScheduled();
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
  sfx("finish");
  say("¡Entrenamiento terminado! Buen trabajo.");
  go("summary", { entry: history.length - 1 });
}

function sideLabel(st) {
  return st.side ? ` · lado ${SIDE_NAME[st.side]}` : "";
}

// Lado que toca ahora (o el que viene, en descanso/cambio)
function currentSide(ex, st) {
  if (!ex.perSide) return 0;
  if (st.side) return st.side;
  const m = session.metro;
  if (m) {
    if (ex.alternate) return m.lastBeat < 0 || m.lastBeat % 2 === 0 ? 1 : 2;
    return m.switchUntil ? Math.min(2, m.side + 1) : m.side;
  }
  return 1;
}
function sideTagHtml(ex, st) {
  const sd = currentSide(ex, st);
  if (!sd) return "";
  // dentro del círculo, bajo el número: R (right) / L (left)
  return `<em class="side-in s${sd}" id="sideTag" aria-label="Lado ${SIDE_NAME[sd]}">${sd === 1 ? "R" : "L"}</em>`;
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

  // ---- ritmo visual (onda de pulso en la tarjeta + anillo dentro de cada repetición) ----
  const pulse = pulseFor(ex);

  // ---- contexto: dónde estoy y qué viene ----
  const state = currentState();
  const nEx = day.exercises.length;
  let context = ex.block ? esc(ex.block) : "";
  if (st.group) {
    const members = [...new Set(session.steps.filter((s) => s.group === st.group && s.rounds === st.rounds).map((s) => s.ex))];
    context += `${context ? " · " : ""}${esc(st.group)} · ${members.indexOf(st.ex) + 1} de ${members.length}`;
  } else {
    context += `${context ? " · " : ""}ejercicio ${st.ex + 1} de ${nEx}`;
  }
  const setTxt = st.group && st.rounds > 1 ? `Ronda ${st.round + 1}/${st.rounds}` : `Serie ${st.set + 1}/${st.nSets}`;
  const nextStep = session.steps.slice(session.i + 1).find((s) => s.ex !== st.ex);
  const nextEx = nextStep ? day.exercises[nextStep.ex] : null;
  const target = ex.time ? `${ex.time} s${ex.perSide ? " c/lado" : ""}` : ex.reps ? `${ex.reps} reps${ex.perSide ? " c/lado" : ""}` : "";

  const tempoCtl = () => `<div class="tempo-ctl" aria-label="Ritmo">
      <button data-act="tempoMinus" aria-label="Más rápido">−</button>
      <span><b>${tempoOf(ex).toFixed(1).replace(".0", "")}s</b> /rep</span>
      <button data-act="tempoPlus" aria-label="Más lento">+</button>
    </div>`;
  const ib = (act, ic, label, extra = "") => `<button class="ibtn" data-act="${act}" aria-label="${label}" ${extra}>${icon(ic)}</button>`;

  let center, caption = "", tools = "", primary = "";
  if (isRest) {
    const kind = session.restKind || (st.side === 2 ? "side" : "rest");
    center = ringHtml(ex.perSide && st.side ? sideTagHtml(ex, st) : "");
    caption = kind === "side" ? `Ahora <b>${st.side === 1 ? "R" : "L"}</b>` : `Sigue: <b>${esc(ex.name)}</b>${st.side ? ` · ${st.side === 1 ? "R" : "L"}` : ""} · ${setTxt.toLowerCase()}`;
    tools = `${ib("minus15", "minus15", "Restar 15 segundos")}${ib("pause", session.timer?.running ? "pause" : "play", session.timer?.running ? "Pausar" : "Seguir")}${ib("plus15", "plus15", "Sumar 15 segundos")}`;
    primary = `<button class="btn primary full big" data-act="skipRest">${kind === "prep" ? "Estoy listo" : kind === "side" ? "Listo, sigo" : "Saltar descanso"}</button>`;
  } else if (isTimed) {
    const t = session.timer;
    center = t ? ringHtml(sideTagHtml(ex, st)) : `<div class="ring" id="ring" style="--p:0"><div class="ring-num"><span id="bigTime">${fmt(ex.time)}</span>${sideTagHtml(ex, st)}</div></div>`;
    caption = st.side ? `de ${ex.time} s · ${st.side === 1 ? "luego L" : "último lado"}` : `de ${ex.time} s`;
    if (t) {
      tools = `${ib("pause", t.running ? "pause" : "play", t.running ? "Pausar" : "Seguir")}${ib("plus15", "plus15", "Sumar 15 segundos")}${ib("resetTimed", "reset", "Reiniciar")}`;
      primary = `<button class="btn primary full big" data-act="doneTimed">Listo</button>`;
    } else primary = `<button class="btn primary full big" data-act="startTimed">${icon("play")} Iniciar</button>`;
  } else if (hasMetro(ex)) {
    const m = session.metro;
    center = `<button class="rep-counter ${m && m.running ? "metro-on" : ""}" id="repBtn" data-act="${m ? (m.running ? "" : "metroToggle") : "repPlus"}" aria-label="${m ? (m.running ? "Conteo en curso" : "Seguir conteo") : "Sumar repetición"}">
        ${m ? `<svg class="rep-arc" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47" pathLength="100"/></svg>` : ""}
        <span id="repNum">${session.reps}</span><small>/ ${ex.reps}</small>${sideTagHtml(ex, st)}</button>`;
    caption = `<span id="metroStatus">${m ? metroStatusText(ex) : "Toca el círculo para contar a mano"}</span>`;
    tools = m
      ? `${ib("metroToggle", m.running ? "pause" : "play", m.running ? "Pausar" : "Seguir")}${ib("metroReset", "reset", "Reiniciar")}${tempoCtl()}`
      : tempoCtl();
    primary = m
      ? `<button class="btn primary full big" data-act="doneReps">Serie lista</button>`
      : `<button class="btn primary full big" data-act="metroStart">${icon("play")} Iniciar conteo</button>`;
  } else {
    const kg = lastKg[ex.name] ?? lastWeightLog(ex.name)?.kg ?? "";
    center = `<button class="rep-counter" id="repBtn" data-act="repPlus" aria-label="Sumar repetición">
        <span id="repNum">${session.reps}</span><small>${ex.reps ? `/ ${ex.reps}` : "reps"}</small>${sideTagHtml(ex, st)}</button>`;
    caption = `Toca el círculo en cada repetición · <span id="setClock">${fmt((Date.now() - session.setStartedAt) / 1000)}</span>`;
    tools = `${ib("repMinus", "minus", "Restar una repetición")}${
      ex.rpe
        ? `<label class="kg-ctl" for="kgInput"><input id="kgInput" type="number" inputmode="decimal" step="0.5" min="0" placeholder="—" value="${esc(kg)}"><span>kg</span></label>`
        : ""
    }`;
    primary = `<button class="btn primary full big" data-act="doneReps">Serie lista</button>`;
  }

  const setDotsHtml = st.nSets > 1 ? `<span class="dots">${setDots}</span>` : "";

  $app.innerHTML = `
    <div class="progress" aria-hidden="true"><div style="width:${(session.i / total) * 100}%"></div></div>
    <div class="context">${context}</div>
    <h2 class="ex-name">${esc(ex.name)}</h2>
    <div class="ex-meta">
      ${target ? `<span>${esc(target)}</span>` : ""}
      ${ex.rpe ? `<button class="rpe-chip" data-act="rpe" aria-label="Qué significa este esfuerzo">${esc(rpePlain(ex.rpe, !!ex.time).short)} ${icon("info")}</button>` : ""}
      <button class="tech-chip ${state === "prep" ? "hint" : ""}" data-act="tech" aria-label="Ver técnica: notas y video">${icon("play")} Técnica</button>
    </div>

    <section class="phase ${pulse.cls}" style="${pulse.style}">
      <div class="pulse-field" aria-hidden="true">${[0, 1, 2].map((k) => `<i style="${pulse.blobs?.[k] || ""}"></i>`).join("")}</div>
      <header class="phase-head">
        <div class="state-pill" role="status"><i></i><span id="stateTxt">${STATE_LABEL[state] || ""}</span></div>
        <div class="set-info">${setTxt}${setDotsHtml}</div>
      </header>
      <div class="phase-center">${center}</div>
      <p class="phase-caption">${caption}</p>
      ${tools ? `<div class="tools">${tools}</div>` : ""}
      ${primary}
      ${
        nextEx && !isRest
          ? `<footer class="phase-next"><span>Sigue</span><b>${esc(nextEx.name)}</b></footer>`
          : ""
      }
    </section>

    <nav class="workout-foot" aria-label="Navegación del entrenamiento">
      <button class="text-btn" data-act="prevEx" ${session.i === 0 ? "disabled" : ""}>‹ Anterior</button>
      <button class="text-btn" data-act="nextEx" ${session.i >= total - 1 ? "disabled" : ""}>Saltar ejercicio ›</button>
      <button class="text-btn danger" data-act="finish">Terminar</button>
    </nav>
  `;

  placePulse();
  // solo vuelve arriba al cambiar de ejercicio (evita saltos en cada redibujo)
  if (renderWorkout.lastEx !== `${session.dayIndex}:${st.ex}`) {
    renderWorkout.lastEx = `${session.dayIndex}:${st.ex}`;
    $app.scrollTop = 0;
  }

  bindActs({
    repPlus: () => {
      if (+ex.reps && session.reps >= +ex.reps) {
        buzz(60);
        return toast(`Máximo ${ex.reps} repeticiones`);
      }
      session.reps++;
      persist();
      bumpRep();
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
      sfx("end");
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
      sfx("start");
      say("Ya");
      timerStart(+ex.time);
      render();
    },
    pause: () => {
      session.timer?.running ? timerPause() : timerResume();
      render();
    },
    resetTimed: () => {
      cancelScheduled();
      session.timer = null;
      persist();
      render();
    },
    doneTimed: () => {
      const t = session.timer;
      logSet({ time: t ? Math.round(t.total - timerLeft()) : +ex.time });
    },
    minus15: () => {
      adjustTimer(-15);
      render();
    },
    plus15: () => {
      adjustTimer(15);
      render();
    },
    skipRest: () => beginWork(true),
    prevEx: () => jumpStep(-1),
    nextEx: () => jumpStep(1),
    rpe: () => rpeSheet(ex),
    tech: () => techSheet(ex, weekSets()),
    finish: async () => {
      if (await ask("¿Terminar y guardar el entrenamiento?")) finishSession();
    },
  });
}


// Ritmo de la onda: repetición (conteo), segundo (tiempo), respiración (descanso / reps a mano).
// Se alinea con el reloj real para que la onda coincida con el conteo.
function pulseFor(ex) {
  const state = currentState();
  const now = Date.now();
  let beat = 0, offset = 0, mode = "";
  if (session.phase === "rest") {
    const t = session.timer;
    if (t && t.running) return { cls: "live liquid", style: "", blobs: liquidBlobs() };
    return { cls: "still liquid", style: "", blobs: liquidBlobs() };
  } else if (session.metro) {
    const m = session.metro;
    if (m.running && !m.switchUntil) {
      beat = tempoOf(ex);
      offset = Math.max(0, (now - m.t0) / 1000) % beat;
      mode = "beat";
    } else if (m.running && m.switchUntil) {
      beat = 1;
      mode = "tick";
    }
  } else if (ex.time) {
    const t = session.timer;
    if (t && t.running) {
      beat = 1;
      offset = (t.total - timerLeft()) % 1;
      mode = "tick";
    }
  } else {
    beat = 3;
    offset = ((now - session.setStartedAt) / 1000) % 3;
    mode = "breathe";
  }
  if (!beat) return { cls: "still", style: "" };
  return { cls: `live ${mode}`, style: `--beat:${beat}s;--beat-off:-${offset.toFixed(3)}s;--beat-half:-${(offset + beat / 2).toFixed(3)}s` };
}


// Manchas de luz que se mueven lento y al azar dentro de la tarjeta (descanso / prepárate).
// Recorridos aleatorios pero estables durante el mismo descanso (semilla = paso),
// y continuos aunque se redibuje la tarjeta (el desfase sale del tiempo transcurrido).
function liquidBlobs() {
  let seed = (session.i + 1) * 9301 + (session.dayIndex + 1) * 49297;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const r = (a, b) => (a + (b - a) * rnd()).toFixed(1);
  const t = session.timer;
  const elapsed = t ? Math.max(0, t.total - timerLeft()) : 0;
  return [0, 1, 2].map(() => {
    const dur = +r(16, 26);
    return [
      `--x0:${r(-28, 28)}%`, `--y0:${r(-22, 22)}%`, `--s0:${r(0.85, 1.15)}`,
      `--x1:${r(-28, 28)}%`, `--y1:${r(-22, 22)}%`, `--s1:${r(0.9, 1.25)}`,
      `--x2:${r(-28, 28)}%`, `--y2:${r(-22, 22)}%`, `--s2:${r(0.8, 1.1)}`,
      `--dur:${dur}s`, `animation-delay:-${((elapsed + +r(0, dur)) % dur).toFixed(2)}s`,
    ].join(";");
  });
}

// La onda nace exactamente del centro del anillo/contador (no del centro de la tarjeta)
function placePulse() {
  const ph = $app.querySelector(".phase");
  const c = ph?.querySelector(".phase-center > *");
  if (!ph || !c) return;
  const a = ph.getBoundingClientRect();
  const b = c.getBoundingClientRect();
  ph.style.setProperty("--py", `${Math.round(b.top - a.top + b.height / 2)}px`);
  ph.style.setProperty("--px", `${Math.round(b.left - a.left + b.width / 2)}px`);
}
window.addEventListener("resize", () => route.view === "workout" && placePulse());

function metroStatusText(ex) {
  const m = session.metro;
  if (!m) return "";
  if (m.switchUntil) {
    const left = Math.max(0, Math.ceil(((m.running ? m.switchUntil - Date.now() : m.switchLeft)) / 1000));
    return `Cambia a L · ${left}`;
  }
  if (!m.running) return "En pausa · toca el círculo para seguir";
  const sides = metroSides(ex);
  if (ex.alternate) return "Alterna R / L";
  if (Date.now() < m.t0) return "Prepárate…";
  return sides > 1 ? (m.side === 1 ? "Sigue el conteo · luego L" : "Sigue el conteo · último lado") : "Sigue el conteo";
}

// El anillo avanza con una animación CSS lineal hasta el final del tiempo:
// fluido a 60 fps y se detiene/reanuda con el temporizador.
function ringHtml(extra = "") {
  const t = session.timer;
  const left = timerLeft();
  const p0 = t && t.total ? Math.min(100, Math.max(0, (1 - left / t.total) * 100)) : 0;
  const anim = t && t.running ? ` anim" style="--p0:${p0.toFixed(2)};--p:${p0.toFixed(2)};--dur:${left.toFixed(2)}s` : `" style="--p:${p0.toFixed(2)}`;
  return `<div class="ring${anim}" id="ring"><div class="ring-num"><span id="bigTime">${fmt(left)}</span>${extra}</div></div>`;
}

function adjustTimer(delta) {
  const t = session.timer;
  if (!t) return;
  if (t.running) t.endsAt = Math.max(Date.now(), t.endsAt + delta * 1000);
  else t.remaining = Math.max(0, t.remaining + delta);
  t.total = Math.max(t.total + delta, 1);
  t.lastBeep = null;
  if (t.running) scheduleTimerSounds();
  persist();
  paintLive();
}

// Actualiza solo los números (no recrea el video)
function paintLive() {
  if (route.view === "workout" && session) {
    syncState();
    const tag = document.getElementById("sideTag");
    if (tag) {
      const sd = currentSide(curEx(), curStep());
      const txt = sd === 1 ? "R" : "L";
      if (tag.textContent !== txt) {
        tag.textContent = txt;
        tag.className = `side-in s${sd} flip`;
        tag.setAttribute("aria-label", `Lado ${SIDE_NAME[sd]}`);
      }
    }
  }
  const big = document.getElementById("bigTime");
  const ring = document.getElementById("ring");
  if (big && session.timer) {
    const left = timerLeft();
    big.textContent = fmt(left);
    if (ring && !ring.classList.contains("anim")) {
      const pct = session.timer.total ? (1 - left / session.timer.total) * 100 : 0;
      ring.style.setProperty("--p", pct.toFixed(1));
    }
  }
  const rn = document.getElementById("repNum");
  if (rn) rn.textContent = session.reps;
  const ms = document.getElementById("metroStatus");
  if (ms && session.metro) ms.textContent = metroStatusText(curEx());
  const sc = document.getElementById("setClock");
  if (sc) sc.textContent = fmt((Date.now() - session.setStartedAt) / 1000);
}

// ============================================================
//  RPE
// ============================================================
function renderRpe() {
  setHeader("Esfuerzo (RPE)", true);
  $app.innerHTML = `
    <section class="card rpe-card">
      ${RPE_INTRO}
      ${rpeTableHtml(null)}
      <p class="muted small rpe-tip">Para ajustar el peso: si al terminar sientes que te quedaban <b>más</b> de las indicadas, súbelo la próxima serie; si te quedaban <b>menos</b> (o no llegaste), bájalo.</p>
    </section>`;
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
const F_SERIF = '"Instrument Serif", "Times New Roman", Georgia, serif';

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

// Paleta del anillo: de frío a cálido (igual que el ícono)
const RING_STOPS = ["#52c7e6", "#8a93ff", "#b29dff", "#ffb39c", "#ff7448"];
const INK = "#f4efe6"; // blanco cálido, tipo papel
const INK_SOFT = "rgba(244, 239, 230, 0.72)";
const INK_LINE = "rgba(244, 239, 230, 0.32)";

function plannedSets(e) {
  const day = plan.days.find((d) => d.name === e.dayName);
  if (!day) return 0;
  const wk = plan.weeks?.[e.week]?.sets || weekSets();
  return day.exercises.reduce((n, ex) => n + setsOf(ex, wk), 0);
}

function drawRing(ctx, cx, cy, r, lw, frac) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = lw;
  ctx.strokeStyle = "rgba(244, 239, 230, 0.14)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const a0 = -Math.PI / 2;
  const span = Math.PI * 2 * Math.max(0.02, Math.min(1, frac));
  // degradado a lo largo del arco: segmentos cortos con color interpolado
  const N = 240;
  const lerp = (c1, c2, t) => {
    const h = (c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
    const A = h(c1), B = h(c2);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",")})`;
  };
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const seg = t * (RING_STOPS.length - 1);
    const k = Math.min(RING_STOPS.length - 2, Math.floor(seg));
    ctx.strokeStyle = lerp(RING_STOPS[k], RING_STOPS[k + 1], seg - k);
    ctx.lineCap = i === 0 || i === N - 1 ? "round" : "butt";
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0 + span * t, a0 + span * ((i + 1.4) / N));
    ctx.stroke();
  }
  ctx.restore();
}

function drawWordmark(ctx, cx, y, size, align = "center") {
  ctx.save();
  ctx.font = `600 ${size}px ${F_BODY}`;
  ctx.fillStyle = INK_SOFT;
  ctx.textBaseline = "middle";
  const text = "ENTRENO";
  const sp = size * 0.42;
  const tw = [...text].reduce((a, c) => a + ctx.measureText(c).width, 0) + sp * (text.length - 1);
  const mr = size * 0.42, gap = size * 0.7;
  const total = mr * 2 + gap + tw;
  const left = align === "center" ? cx - total / 2 : cx;
  drawRing(ctx, left + mr, y, mr, size * 0.16, 0.82);
  spaced(ctx, text, left + mr * 2 + gap + tw / 2, y + 1, sp);
  ctx.restore();
}

function statBlock(ctx, x, y, label, value, lSize, vSize, align = "center") {
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK_SOFT;
  ctx.font = `500 ${lSize}px ${F_BODY}`;
  ctx.fillText(label, x, y);
  ctx.fillStyle = INK;
  ctx.font = `500 ${vSize}px ${F_DISPLAY}`;
  ctx.fillText(value, x, y + vSize * 0.98);
}

function hairline(ctx, x1, y, x2) {
  ctx.save();
  ctx.strokeStyle = INK_LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

function subtitle(e) {
  const d = new Date(e.date).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
  const wk = e.week != null && plan.weeks?.[e.week] ? ` · semana ${e.week + 1}` : "";
  return `${e.dayName} · ${d}${wk}`;
}

const SHARE_TEMPLATES = [
  { id: "anillo", name: "Anillo", transparent: true },
  { id: "editorial", name: "Editorial", transparent: true },
  { id: "tarjeta", name: "Tarjeta", transparent: true },
];

// Escribe trozos de texto con distintos estilos en una misma línea, centrada o desde x
function richLine(ctx, parts, x, y, align = "center") {
  const widths = parts.map(([t, font]) => {
    ctx.font = font;
    return ctx.measureText(t).width;
  });
  const total = widths.reduce((a, b) => a + b, 0);
  let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  ctx.textAlign = "left";
  parts.forEach(([t, font, color], i) => {
    ctx.font = font;
    ctx.fillStyle = color || INK;
    ctx.fillText(t, cx, y);
    cx += widths[i];
  });
}

function drawShare(canvas, tpl, e) {
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;
  const ctx = canvas.getContext("2d");
  const st = entryStats(e);
  const planned = plannedSets(e);
  const frac = planned ? st.sets / planned : 1;
  const W = SHARE_W, cx = W / 2, cy = SHARE_H / 2;
  ctx.clearRect(0, 0, W, SHARE_H);
  const mm = Math.floor(st.dur / 60), ss = String(st.dur % 60).padStart(2, "0");
  const timeTxt = mm >= 60 ? `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
  const dateTxt = new Date(e.date).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
  const weekTxt = e.week != null && plan.weeks?.[e.week] ? `Semana ${e.week + 1}` : "";
  const third = st.vol ? [st.vol.toLocaleString("es"), "kg"] : [String(st.reps), "reps"];
  const shadow = () => {
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 14;
  };
  const noShadow = () => {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
  };
  ctx.textBaseline = "alphabetic";

  if (tpl.id === "anillo") {
    // Composición horizontal compacta: anillo pequeño + texto al lado
    const r = 120, ringX = cx - 250, ringY = cy;
    noShadow();
    drawRing(ctx, ringX, ringY, r, 14, frac);
    shadow();
    ctx.textAlign = "center";
    ctx.fillStyle = INK;
    ctx.font = `500 46px ${F_DISPLAY}`;
    ctx.fillText(`${Math.round(Math.min(1, frac) * 100)}%`, ringX, ringY + 16);
    const tx = ringX + r + 70;
    ctx.textAlign = "left";
    ctx.font = `italic 44px ${F_SERIF}`;
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(`${e.dayName}, ${dateTxt.split(",")[0]}`, tx, cy - 118);
    ctx.font = `500 150px ${F_DISPLAY}`;
    ctx.fillStyle = INK;
    ctx.fillText(timeTxt, tx - 4, cy + 34);
    richLine(
      ctx,
      [
        [String(st.ex), `700 36px ${F_BODY}`],
        [" ejercicios   ", `italic 36px ${F_SERIF}`, INK_SOFT],
        [String(st.sets), `700 36px ${F_BODY}`],
        [" series   ", `italic 36px ${F_SERIF}`, INK_SOFT],
        [third[0], `700 36px ${F_BODY}`],
        [" " + third[1], `italic 36px ${F_SERIF}`, INK_SOFT],
      ],
      tx,
      cy + 110,
      "left"
    );
    noShadow();
    drawWordmark(ctx, cx, cy + 270, 26);
    return;
  }

  if (tpl.id === "editorial") {
    // Jerarquía tipográfica: versalitas, cursivas serif, cifras grandes y negritas
    const x = 150, right = W - 150;
    let y = cy - 360;
    shadow();
    ctx.textAlign = "left";
    ctx.font = `700 28px ${F_BODY}`;
    ctx.fillStyle = INK_SOFT;
    const kicker = `ENTRENO${weekTxt ? " · " + weekTxt.toUpperCase() : ""}`;
    const kw = [...kicker].reduce((w, c) => w + ctx.measureText(c).width, 0) + 6 * (kicker.length - 1);
    spaced(ctx, kicker, x + kw / 2, y, 6);
    y += 110;
    ctx.textAlign = "left";
    ctx.font = `400 120px ${F_SERIF}`;
    ctx.fillStyle = INK;
    ctx.fillText(e.dayName, x, y);
    y += 64;
    ctx.font = `italic 50px ${F_SERIF}`;
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(dateTxt.charAt(0).toUpperCase() + dateTxt.slice(1), x, y);
    y += 50;
    noShadow();
    hairline(ctx, x, y, right);
    shadow();
    y += 230;
    ctx.font = `500 240px ${F_DISPLAY}`;
    ctx.fillStyle = INK;
    ctx.fillText(timeTxt, x - 8, y);
    const tw = ctx.measureText(timeTxt).width;
    ctx.font = `italic 56px ${F_SERIF}`;
    ctx.fillStyle = INK_SOFT;
    ctx.fillText("minutos", x + tw + 24, y);
    y += 120;
    richLine(ctx, [[String(st.ex), `800 54px ${F_BODY}`], [" ejercicios,", `italic 58px ${F_SERIF}`, INK_SOFT]], x, y, "left");
    y += 76;
    richLine(ctx, [[String(st.sets), `800 54px ${F_BODY}`], [" series y ", `italic 58px ${F_SERIF}`, INK_SOFT], [third[0], `800 54px ${F_BODY}`], [" " + (third[1] === "kg" ? "kg movidos." : "repeticiones."), `italic 58px ${F_SERIF}`, INK_SOFT]], x, y, "left");
    y += 70;
    noShadow();
    hairline(ctx, x, y, right);
    drawWordmark(ctx, x, y + 80, 26, "left");
    return;
  }

  // Tarjeta: solo la tarjeta es visible, el resto del PNG queda transparente
  const pw = 820, ph = 640, px = cx - pw / 2, py = cy - ph / 2, pr = 54;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 16;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, pr);
  const fill = ctx.createLinearGradient(px, py, px + pw, py + ph);
  fill.addColorStop(0, "rgba(28, 26, 34, 0.86)");
  fill.addColorStop(1, "rgba(14, 14, 18, 0.9)");
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, pr);
  ctx.clip();
  [[px + 40, py + 20, 380, "rgba(255,116,72,0.22)"], [px + pw, py + ph, 420, "rgba(82,199,230,0.16)"], [px + pw - 60, py, 300, "rgba(178,157,255,0.16)"]].forEach(([x, y, r, c]) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(px, py, pw, ph);
  });
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(px + 1, py + 1, pw - 2, ph - 2, pr);
  const rim = ctx.createLinearGradient(0, py, 0, py + ph);
  rim.addColorStop(0, "rgba(244,239,230,0.32)");
  rim.addColorStop(1, "rgba(244,239,230,0.05)");
  ctx.strokeStyle = rim;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  const ix = px + 64;
  drawWordmark(ctx, ix, py + 80, 24, "left");
  ctx.textAlign = "right";
  ctx.font = `italic 36px ${F_SERIF}`;
  ctx.fillStyle = INK_SOFT;
  ctx.fillText(dateTxt.split(",")[0].replace(/^./, (c) => c.toUpperCase()) + (dateTxt.includes(",") ? "," + dateTxt.split(",")[1] : ""), px + pw - 64, py + 92);
  drawRing(ctx, ix + 70, py + 290, 70, 10, frac);
  ctx.textAlign = "left";
  ctx.font = `italic 40px ${F_SERIF}`;
  ctx.fillStyle = INK_SOFT;
  ctx.fillText(e.dayName, ix + 180, py + 238);
  ctx.font = `500 140px ${F_DISPLAY}`;
  ctx.fillStyle = INK;
  ctx.fillText(timeTxt, ix + 172, py + 350);
  hairline(ctx, ix, py + 440, px + pw - 64);
  const cols = [[String(st.ex), "ejercicios"], [String(st.sets), "series"], third];
  const colW = (pw - 128) / 3;
  cols.forEach(([v, l], i) => {
    const x0 = ix + colW * i;
    ctx.textAlign = "left";
    ctx.font = `500 72px ${F_DISPLAY}`;
    ctx.fillStyle = INK;
    ctx.fillText(v, x0, py + 535);
    ctx.font = `italic 34px ${F_SERIF}`;
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(l, x0, py + 580);
  });
}

async function ensureShareFonts() {
  try {
    await Promise.all([
      document.fonts.load(`500 80px ${F_DISPLAY}`),
      document.fonts.load(`700 80px ${F_DISPLAY}`),
      document.fonts.load(`500 40px ${F_BODY}`),
      document.fonts.load(`600 40px ${F_BODY}`),
      document.fonts.load(`800 40px ${F_BODY}`),
      document.fonts.load(`italic 40px ${F_SERIF}`),
      document.fonts.load(`400 40px ${F_SERIF}`),
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
    <div class="list mt">${
      history
        .map((h, i) => {
          const st = entryStats(h);
          return `<button class="row-link hist-item" data-entry="${i}">
            <span><b>${esc(h.dayName)} · ${fmtDate(h.date)}</b><small>${fmt(h.duration)} · ${st.ex} ejercicios · ${st.sets} series${st.vol ? ` · ${st.vol} kg` : ""}</small></span>${icon("chevron")}
          </button>`;
        })
        .reverse()
        .join("") || `<p class="muted center">Aún no hay entrenamientos guardados.</p>`
    }</div>
    ${total ? `<button class="btn danger-ghost full mt" data-act="clear">Borrar historial</button>` : ""}`;
  $app.querySelectorAll("[data-entry]").forEach((b) => b.addEventListener("click", () => entrySheet(+b.dataset.entry)));
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
      <p class="muted small">Suenan solo: la cuenta 3-2-1 de "Prepárate", el inicio y el término de cada ejercicio (y de cada lado), y el final del entrenamiento. Funcionan aunque el iPhone esté en silencio.</p>
      <p class="muted small">Durante el entrenamiento verás el ejercicio, las repeticiones o el tiempo y lo que sigue en <b>Ahora suena</b>: pantalla bloqueada, Dynamic Island y Apple Watch. Desde ahí puedes <b>pausar</b> (⏯) o pasar a lo <b>siguiente</b> (⏭).</p>
    </section>
    <section class="section">
      <div class="section-head"><h2>App</h2></div>
      <button class="row-link" data-act="update"><span><b>Actualizar app</b><small>Descarga la última versión sin borrar el acceso directo ni tu historial</small></span>${icon("refresh")}</button>
      <p class="muted small">Pantalla ${viewportInfo} · Versión ${DEV_BUILD ? "de desarrollo" : esc(APP_VERSION.slice(0, 7))}${latestVersion && latestVersion !== APP_VERSION ? " · hay una versión nueva" : ""}</p>
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
    update: updateApp,
    test: () => {
      unlockAudio();
      ensurePlayback();
      if (!session) setTimeout(stopPlayback, 5000);
      // muestra de los sonidos: 3-2-1, inicio, término
      [["count", 0], ["count", 600], ["count", 1200], ["start", 1800], ["end", 3000]].forEach(([k, ms]) => setTimeout(() => sfx(k), ms));
      say("Sonido de prueba");
    },
  });
}

// ---------- ocultar barras al hacer scroll ----------
// Bajando: se esconden el menú inferior y la barra superior. Subiendo o cerca del borde: vuelven.
(() => {
  // Con histéresis: solo cambia tras recorrer ~28px en la misma dirección,
  // e ignora el "rebote" de iOS arriba y abajo (evita que el menú tiemble).
  let lastY = 0;
  let acc = 0;
  let ticking = false;
  const update = () => {
    ticking = false;
    const max = $app.scrollHeight - $app.clientHeight;
    const raw = $app.scrollTop;
    if (raw < 0 || raw > max + 1) return; // rebote elástico
    const y = raw;
    const dy = y - lastY;
    lastY = y;
    if (y < 24) {
      acc = 0;
      document.body.classList.remove("nav-compact");
      return;
    }
    if (Math.sign(dy) !== Math.sign(acc)) acc = 0;
    acc += dy;
    if (acc > 28) document.body.classList.add("nav-compact");
    else if (acc < -28) document.body.classList.remove("nav-compact");
  };
  $app.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true }
  );
})();


// ============================================================
//  "AHORA SUENA": pantalla bloqueada, Dynamic Island y Apple Watch
//  (las Live Activities nativas no están disponibles para apps web;
//   usamos el panel de reproducción, que sí lo está mientras suena el audio)
// ============================================================
function isWorkoutPaused() {
  if (!session) return false;
  return (session.metro && !session.metro.running) || (session.timer && !session.timer.running) || false;
}
function workoutTogglePause() {
  if (!session) return;
  if (session.metro) session.metro.running ? metroPause() : metroResume();
  else if (session.timer) session.timer.running ? timerPause() : timerResume();
  else return;
  if (route.view === "workout") render();
}
// Acción principal: la misma que el botón grande de la pantalla
function workoutPrimary() {
  if (!session) return;
  const ex = curEx();
  if (session.phase === "rest") return beginWork(true);
  if (ex.time) {
    if (session.timer) return logSet({ time: Math.round(session.timer.total - timerLeft()) });
    timerStart(+ex.time);
    sfx("start");
    return route.view === "workout" && render();
  }
  if (hasMetro(ex) && !session.metro) {
    metroStart();
    return route.view === "workout" && render();
  }
  session.metro = null;
  const entry = { reps: Math.min(session.reps || +ex.reps || 0, +ex.reps || Infinity), time: Math.round((Date.now() - session.setStartedAt) / 1000) };
  const kgIn = document.getElementById("kgInput");
  const kg = kgIn && kgIn.value !== "" ? +kgIn.value : lastKg[ex.name];
  if (ex.rpe && kg) entry.kg = +kg;
  logSet(entry);
}

let npKey = "";
const NP_ART = [{ src: new URL("icons/entreno-512-v3.png", location.href).href, sizes: "512x512", type: "image/png" }];
let npAt = 0;
function updateNowPlaying(force = false) {
  if (!("mediaSession" in navigator)) return;
  const ms = navigator.mediaSession;
  if (!session) {
    if (npKey) {
      try {
        ms.metadata = null;
        ms.playbackState = "none";
      } catch {}
      npKey = "";
    }
    return;
  }
  const day = curDay(), st = curStep(), ex = curEx(), state = currentState();
  const setTxt = st.group && st.rounds > 1 ? `Ronda ${st.round + 1}/${st.rounds}` : `Serie ${st.set + 1}/${st.nSets}`;
  let title, artist;
  if (session.phase === "rest") {
    title = `${STATE_LABEL[state]} · ${ex.name}`;
    artist = `Sigue: ${setTxt}`;
  } else {
    let prog;
    if (ex.time) prog = `${ex.time} s`;
    else if (session.metro?.switchUntil) prog = "Cambia de lado";
    else prog = `${session.reps}/${ex.reps || "–"}`;
    const sd = currentSide(ex, st);
    title = `${prog} · ${ex.name}${sd ? ` · ${sd === 1 ? "R" : "L"}` : ""}`;
    const nxt = session.steps.slice(session.i + 1).find((x) => x.ex !== st.ex);
    artist = `${setTxt}${nxt ? ` · Sigue: ${day.exercises[nxt.ex].name}` : " · Último ejercicio"}`;
  }
  const key = title + "|" + artist;
  if (force || key !== npKey) {
    npKey = key;
    try {
      ms.metadata = new MediaMetadata({
        title,
        artist,
        album: `Entreno · ${day.name}`,
        artwork: NP_ART,
      });
    } catch {}
  }
  try {
    ms.playbackState = isWorkoutPaused() ? "paused" : "playing";
    const t = session.timer;
    if (t && ms.setPositionState) {
      ms.setPositionState({ duration: Math.max(1, t.total), position: Math.min(t.total, Math.max(0, t.total - timerLeft())), playbackRate: 1 });
    }
  } catch {}
}

(function setupMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const h = (a, f) => {
    try {
      navigator.mediaSession.setActionHandler(a, f);
    } catch {}
  };
  const after = () => {
    ensurePlayback();
    updateNowPlaying(true);
  };
  const external = () => Date.now() < ignoreMediaUntil;
  h("play", () => {
    if (!external() && isWorkoutPaused()) workoutTogglePause();
    after();
  });
  h("pause", () => {
    // pausa automática del sistema (voz, cambio de estado): no detener el entrenamiento
    if (!external() && !isWorkoutPaused()) workoutTogglePause();
    after();
  });
  h("nexttrack", () => {
    if (external()) return after();
    workoutPrimary();
    after();
  });
  h("previoustrack", () => {
    if (session) jumpStep(-1);
    after();
  });
})();

// ---------- actualizar la app ----------
async function updateApp() {
  toast("Actualizando…");
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.map((r) => r.update().catch(() => {})));
    if (window.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch {}
  location.replace(location.pathname + "?u=" + Date.now());
}

let latestVersion = null;
async function checkForUpdate() {
  if (DEV_BUILD || location.protocol === "file:") return;
  try {
    const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return;
    latestVersion = (await r.json()).v;
    if (latestVersion && latestVersion !== APP_VERSION && !session) showUpdateBanner();
  } catch {}
}
function showUpdateBanner() {
  if (document.querySelector(".update-banner")) return;
  const b = document.createElement("div");
  b.className = "update-banner";
  b.innerHTML = `<span>Hay una versión nueva de la app</span><button class="btn primary">Actualizar</button>`;
  b.querySelector("button").addEventListener("click", updateApp);
  $shell.appendChild(b);
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkForUpdate();
});

// ---------- inicio ----------
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
if (session && (!session.steps || !plan.days[session.dayIndex])) {
  session = null;
  save(LS.session, null);
}
render();
checkForUpdate();
