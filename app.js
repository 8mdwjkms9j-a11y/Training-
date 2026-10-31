"use strict";

/* ============================================================
   Entreno — app de pauta de entrenamiento (sin dependencias)
   ============================================================ */

const LS = {
  plan: "entreno.plan",
  history: "entreno.history",
  session: "entreno.session",
  prefs: "entreno.prefs",
};

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

let plan = load(LS.plan, null) || structuredClone(window.DEFAULT_PLAN);
let history = load(LS.history, []);
let session = load(LS.session, null);
let prefs = Object.assign({ sound: true, voice: true, autoRest: true }, load(LS.prefs, {}));

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

function exTarget(ex) {
  const parts = [];
  if (ex.sets) parts.push(`${ex.sets} series`);
  if (ex.time) parts.push(`${ex.time} s`);
  else if (ex.reps) parts.push(`${ex.reps} reps`);
  if (ex.weight) parts.push(ex.weight);
  if (ex.rest) parts.push(`descanso ${ex.rest} s`);
  return parts.join(" · ");
}

function youtubeId(url) {
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function videoHtml(ex) {
  const url = ex.video;
  if (url) {
    const id = youtubeId(url);
    if (id) {
      return `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&modestbranding=1"
        title="${esc(ex.name)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
    }
    if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) {
      return `<div class="video"><video src="${esc(url)}" controls playsinline loop muted></video></div>`;
    }
    return `<a class="btn ghost full" href="${esc(url)}" target="_blank" rel="noopener">▶ Ver video</a>`;
  }
  const q = encodeURIComponent(`${ex.name} ejercicio técnica`);
  return `<a class="btn ghost full" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener">🔎 Buscar video en YouTube</a>`;
}

// ---------- sonido, voz, vibración, pantalla encendida ----------
let audioCtx = null;
function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {}
}
document.addEventListener("touchend", unlockAudio, { passive: true });
document.addEventListener("click", unlockAudio);

function beep(freq = 880, dur = 0.15, times = 1) {
  if (!prefs.sound || !audioCtx) return;
  for (let i = 0; i < times; i++) {
    const t = audioCtx.currentTime + i * (dur + 0.08);
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    o.type = "sine";
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
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
  render();
  window.scrollTo(0, 0);
}

$back.addEventListener("click", () => {
  switch (route.view) {
    case "day":
    case "history":
    case "edit":
    case "settings":
      go("home");
      break;
    case "workout":
      go("day", { dayIndex: session ? session.dayIndex : 0 });
      break;
    case "summary":
      go("home");
      break;
    default:
      go("home");
  }
});

function setHeader(title, showBack) {
  $title.textContent = title;
  $back.hidden = !showBack;
}

function render() {
  clearInterval(ticker);
  ticker = null;
  updateClock();
  if (session) ticker = setInterval(tick, 250);

  const v = route.view;
  if (v === "home") return renderHome();
  if (v === "day") return renderDay();
  if (v === "workout") return renderWorkout();
  if (v === "summary") return renderSummary();
  if (v === "history") return renderHistory();
  if (v === "edit") return renderEdit();
  if (v === "settings") return renderSettings();
}

// ---------- reloj de sesión ----------
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

function renderHome() {
  setHeader(plan.name || "Entreno", false);
  const sug = suggestedDayIndex();
  const resume = session
    ? `<div class="card highlight">
         <div class="card-title">Entrenamiento en curso</div>
         <div class="muted">${esc(plan.days[session.dayIndex]?.name)}</div>
         <div class="row gap mt">
           <button class="btn primary grow" data-act="resume">Continuar</button>
           <button class="btn ghost" data-act="discard">Descartar</button>
         </div>
       </div>`
    : "";

  const days = plan.days
    .map((d, i) => {
      const last = lastDoneFor(d.name);
      return `<button class="card day-card" data-day="${i}">
        <div class="row between">
          <div class="card-title">${esc(d.name)}</div>
          ${i === sug && !session ? `<span class="badge">Te toca</span>` : ""}
        </div>
        <div class="muted">${d.exercises.length} ejercicios${last ? ` · último: ${fmtDate(last)}` : ""}</div>
      </button>`;
    })
    .join("");

  $app.innerHTML = `
    ${resume}
    <div class="list">${days || `<p class="muted">Tu pauta no tiene días. Edítala abajo.</p>`}</div>
    <div class="grid3 mt">
      <button class="btn ghost" data-act="history">📈 Historial</button>
      <button class="btn ghost" data-act="edit">✏️ Pauta</button>
      <button class="btn ghost" data-act="settings">⚙️ Ajustes</button>
    </div>`;

  $app.querySelectorAll("[data-day]").forEach((b) =>
    b.addEventListener("click", () => go("day", { dayIndex: +b.dataset.day }))
  );
  bindActs({
    resume: () => go("workout"),
    discard: () => {
      if (confirm("¿Descartar el entrenamiento en curso?")) {
        session = null;
        save(LS.session, null);
        keepAwake(false);
        render();
      }
    },
    history: () => go("history"),
    edit: () => go("edit"),
    settings: () => go("settings"),
  });
}

function bindActs(map) {
  $app.querySelectorAll("[data-act]").forEach((el) => {
    const fn = map[el.dataset.act];
    if (fn) el.addEventListener("click", (e) => fn(e, el));
  });
}

// ============================================================
//  DÍA
// ============================================================
function renderDay() {
  const day = plan.days[route.dayIndex];
  if (!day) return go("home");
  setHeader(day.name, true);

  const items = day.exercises
    .map(
      (ex, i) => `
      <details class="card ex-card">
        <summary>
          <span class="num">${i + 1}</span>
          <span class="grow">
            <span class="card-title">${esc(ex.name)}</span>
            <span class="muted block">${esc(exTarget(ex))}</span>
          </span>
        </summary>
        <div class="ex-body" data-video="${i}"></div>
        ${ex.notes ? `<p class="notes">${esc(ex.notes)}</p>` : ""}
      </details>`
    )
    .join("");

  const otherSession = session && session.dayIndex !== route.dayIndex;
  $app.innerHTML = `
    <div class="list">${items}</div>
    <div class="sticky-bottom">
      ${
        session && !otherSession
          ? `<button class="btn primary full big" data-act="resume">Continuar entrenamiento</button>`
          : `<button class="btn primary full big" data-act="start">▶ Comenzar</button>`
      }
    </div>`;

  // Carga el video solo al abrir el ejercicio (más liviano)
  $app.querySelectorAll("details.ex-card").forEach((d, i) => {
    d.addEventListener("toggle", () => {
      const box = d.querySelector("[data-video]");
      if (d.open && !box.innerHTML) box.innerHTML = videoHtml(day.exercises[i]);
    });
  });

  bindActs({
    resume: () => go("workout"),
    start: () => {
      if (otherSession && !confirm("Hay otro entrenamiento en curso. ¿Descartarlo y empezar este?")) return;
      startSession(route.dayIndex);
    },
  });
}

// ============================================================
//  SESIÓN DE ENTRENAMIENTO
// ============================================================
/*
  session = {
    dayIndex, exIndex, setIndex, startedAt,
    phase: "work" | "rest",
    reps,                 // contador de la serie actual
    timer: { running, endsAt, remaining, startedAt }  // serie por tiempo / descanso
    setStartedAt,         // para cronometrar series por repeticiones
    log: [ [ {reps|time, at} ... ] por ejercicio ]
  }
*/
function startSession(dayIndex) {
  unlockAudio();
  const day = plan.days[dayIndex];
  session = {
    dayIndex,
    exIndex: 0,
    setIndex: 0,
    startedAt: Date.now(),
    phase: "work",
    reps: 0,
    timer: null,
    setStartedAt: Date.now(),
    log: day.exercises.map(() => []),
  };
  persist();
  keepAwake(true);
  say(`Empezamos. ${day.exercises[0]?.name || ""}`);
  go("workout");
}

function persist() {
  save(LS.session, session);
}

function curDay() {
  return plan.days[session.dayIndex];
}
function curEx() {
  return curDay().exercises[session.exIndex];
}
function totalSets(ex) {
  return Math.max(1, +ex.sets || 1);
}

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
  const ex = curEx();
  if (session.phase === "work") {
    // serie por tiempo completada
    beep(990, 0.25, 2);
    buzz([200, 100, 200]);
    logSet({ time: ex.time });
  } else {
    // fin del descanso
    beep(990, 0.3, 2);
    buzz([300, 100, 300]);
    say("¡Vamos!");
    beginWork();
  }
}

function logSet(entry) {
  session.log[session.exIndex].push({ ...entry, at: Date.now() });
  const ex = curEx();
  const lastSet = session.setIndex + 1 >= totalSets(ex);
  const lastEx = session.exIndex + 1 >= curDay().exercises.length;

  if (lastSet && lastEx) {
    persist();
    return finishSession();
  }

  if (lastSet) {
    session.exIndex++;
    session.setIndex = 0;
  } else {
    session.setIndex++;
  }

  const rest = +ex.rest || 0;
  if (rest > 0 && prefs.autoRest) {
    session.phase = "rest";
    session.reps = 0;
    timerStart(rest);
    const next = curEx();
    say(lastSet ? `Descanso. Luego, ${next.name}` : "Descanso");
  } else {
    beginWork();
  }
  persist();
  render();
}

function beginWork() {
  session.phase = "work";
  session.timer = null;
  session.reps = 0;
  session.setStartedAt = Date.now();
  persist();
  render();
}

function jumpTo(exIndex) {
  const n = curDay().exercises.length;
  if (exIndex < 0 || exIndex >= n) return;
  session.exIndex = exIndex;
  session.setIndex = Math.min(session.log[exIndex].length, totalSets(curEx()) - 1);
  beginWork();
}

function finishSession() {
  const day = curDay();
  const entry = {
    date: Date.now(),
    dayName: day.name,
    duration: Math.round((Date.now() - session.startedAt) / 1000),
    exercises: day.exercises.map((ex, i) => ({ name: ex.name, sets: session.log[i] || [] })),
  };
  history.push(entry);
  save(LS.history, history);
  session = null;
  save(LS.session, null);
  keepAwake(false);
  beep(1200, 0.2, 3);
  say("¡Entrenamiento terminado! Buen trabajo.");
  go("summary", { entry: history.length - 1 });
}

function renderWorkout() {
  if (!session) return go("home");
  const day = curDay();
  const ex = curEx();
  if (!ex) return go("home");
  setHeader(day.name, true);
  keepAwake(true);

  const nSets = totalSets(ex);
  const isRest = session.phase === "rest";
  const isTimed = !!ex.time;
  const nEx = day.exercises.length;

  const setDots = Array.from({ length: nSets }, (_, i) => {
    const done = i < session.log[session.exIndex].length;
    const cur = i === session.setIndex && !isRest;
    return `<span class="dot ${done ? "done" : ""} ${cur ? "cur" : ""}"></span>`;
  }).join("");

  let main;
  if (isRest) {
    main = `
      <div class="phase rest">
        <div class="phase-label">DESCANSO</div>
        <div class="ring" id="ring"><div class="ring-num" id="bigTime">${fmt(timerLeft())}</div></div>
        <div class="muted center">A continuación: <b>${esc(ex.name)}</b> · serie ${session.setIndex + 1}/${nSets}</div>
        <div class="row gap mt">
          <button class="btn ghost grow" data-act="minus15">−15 s</button>
          <button class="btn ghost grow" data-act="pause">${session.timer?.running ? "⏸ Pausa" : "▶ Seguir"}</button>
          <button class="btn ghost grow" data-act="plus15">+15 s</button>
        </div>
        <button class="btn primary full big mt" data-act="skipRest">Saltar descanso ⏭</button>
      </div>`;
  } else if (isTimed) {
    const t = session.timer;
    const started = !!t;
    main = `
      <div class="phase work">
        <div class="phase-label">SERIE ${session.setIndex + 1} DE ${nSets} · ${ex.time} s</div>
        <div class="ring" id="ring"><div class="ring-num" id="bigTime">${fmt(started ? timerLeft() : ex.time)}</div></div>
        ${
          !started
            ? `<button class="btn primary full big" data-act="startTimed">▶ Iniciar</button>`
            : `<div class="row gap">
                 <button class="btn ghost grow" data-act="pause">${t.running ? "⏸ Pausa" : "▶ Seguir"}</button>
                 <button class="btn ghost grow" data-act="resetTimed">↺ Reiniciar</button>
               </div>
               <button class="btn primary full big mt" data-act="doneTimed">✓ Serie lista</button>`
        }
      </div>`;
  } else {
    const target = +ex.reps || 0;
    main = `
      <div class="phase work">
        <div class="phase-label">SERIE ${session.setIndex + 1} DE ${nSets}${target ? ` · objetivo ${target} reps` : ""}</div>
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
        <button class="btn primary full big mt" data-act="doneReps">✓ Serie lista</button>
      </div>`;
  }

  $app.innerHTML = `
    <div class="progress"><div style="width:${(session.exIndex / nEx) * 100}%"></div></div>
    <div class="row between muted small mt">
      <span>Ejercicio ${session.exIndex + 1} de ${nEx}</span>
      <span class="dots">${setDots}</span>
    </div>
    <h2 class="ex-name">${esc(ex.name)}</h2>
    <div class="muted">${esc(exTarget(ex))}</div>
    ${ex.notes ? `<p class="notes">${esc(ex.notes)}</p>` : ""}
    <details class="video-box" ${isRest ? "" : "open"}>
      <summary>🎬 Video</summary>
      <div class="video-slot"></div>
    </details>
    ${main}
    <div class="row gap mt">
      <button class="btn ghost grow" data-act="prevEx" ${session.exIndex === 0 ? "disabled" : ""}>‹ Anterior</button>
      <button class="btn ghost grow" data-act="nextEx" ${session.exIndex >= nEx - 1 ? "disabled" : ""}>Siguiente ›</button>
    </div>
    <button class="btn danger-ghost full mt" data-act="finish">Terminar entrenamiento</button>
  `;

  // video: cargar solo si el desplegable está abierto
  const vb = $app.querySelector(".video-box");
  const loadVideo = () => {
    const slot = vb.querySelector(".video-slot");
    if (vb.open && !slot.innerHTML) slot.innerHTML = videoHtml(ex);
  };
  vb.addEventListener("toggle", loadVideo);
  loadVideo();

  bindActs({
    repPlus: () => {
      session.reps++;
      persist();
      beep(1000, 0.04);
      if (+ex.reps && session.reps === +ex.reps) {
        buzz(150);
        beep(1300, 0.12, 2);
      }
      paintLive();
    },
    repMinus: () => {
      session.reps = Math.max(0, session.reps - 1);
      persist();
      paintLive();
    },
    doneReps: () => {
      logSet({ reps: session.reps || +ex.reps || 0, time: Math.round((Date.now() - session.setStartedAt) / 1000) });
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
      const done = t ? Math.round(t.total - timerLeft()) : +ex.time;
      logSet({ time: done });
    },
    minus15: () => adjustRest(-15),
    plus15: () => adjustRest(15),
    skipRest: () => beginWork(),
    prevEx: () => jumpTo(session.exIndex - 1),
    nextEx: () => jumpTo(session.exIndex + 1),
    finish: () => {
      if (confirm("¿Terminar y guardar el entrenamiento?")) finishSession();
    },
  });
}

function adjustRest(delta) {
  const t = session.timer;
  if (!t) return;
  if (t.running) t.endsAt = Math.max(Date.now(), t.endsAt + delta * 1000);
  else t.remaining = Math.max(0, t.remaining + delta);
  t.total = Math.max(t.total + delta, 1);
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
  const sc = document.getElementById("setClock");
  if (sc) sc.textContent = "⏱ " + fmt((Date.now() - session.setStartedAt) / 1000);
}

// ============================================================
//  RESUMEN E HISTORIAL
// ============================================================
function entryHtml(e) {
  const rows = e.exercises
    .map((x) => {
      const sets = x.sets.length
        ? x.sets.map((s) => (s.reps ? `${s.reps}` : `${s.time}s`)).join(" · ")
        : `<span class="muted">—</span>`;
      return `<div class="row between hist-row"><span>${esc(x.name)}</span><span>${sets}</span></div>`;
    })
    .join("");
  return `<div class="card">
    <div class="row between"><div class="card-title">${esc(e.dayName)}</div><span class="muted">${fmtDate(e.date)}</span></div>
    <div class="muted small">Duración ${fmt(e.duration)}</div>
    <div class="mt">${rows}</div>
  </div>`;
}

function renderSummary() {
  const e = history[route.entry];
  setHeader("¡Listo! 💪", true);
  $app.innerHTML = `
    <div class="center big-emoji">🏆</div>
    ${e ? entryHtml(e) : ""}
    <button class="btn primary full big mt" data-act="home">Volver al inicio</button>`;
  bindActs({ home: () => go("home") });
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
    <div class="list mt">${history.slice().reverse().map(entryHtml).join("") || `<p class="muted center">Aún no hay entrenamientos guardados.</p>`}</div>
    ${total ? `<button class="btn danger-ghost full mt" data-act="clear">Borrar historial</button>` : ""}`;
  bindActs({
    clear: () => {
      if (confirm("¿Borrar todo el historial?")) {
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
    <p class="muted small">Edita tu pauta en formato JSON. Cada ejercicio puede tener:
      <code>name</code>, <code>sets</code>, <code>reps</code> o <code>time</code> (segundos),
      <code>rest</code> (segundos), <code>weight</code>, <code>video</code> (link YouTube) y <code>notes</code>.</p>
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
        alert("Pauta copiada al portapapeles");
      } catch {
        ta.select();
      }
    },
    resetPlan: () => {
      if (!confirm("¿Volver a la pauta original del archivo plan.js? Se pierden tus cambios hechos en la app.")) return;
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
}

// ============================================================
//  AJUSTES
// ============================================================
function renderSettings() {
  setHeader("Ajustes", true);
  const opt = (key, label) => `
    <label class="card toggle">
      <span>${label}</span>
      <input type="checkbox" data-pref="${key}" ${prefs[key] ? "checked" : ""}>
    </label>`;
  $app.innerHTML = `
    <div class="list">
      ${opt("sound", "🔔 Sonidos (pitidos)")}
      ${opt("voice", "🗣️ Avisos por voz")}
      ${opt("autoRest", "⏳ Iniciar descanso automáticamente")}
    </div>
    <button class="btn ghost full mt" data-act="test">Probar sonido</button>
    <p class="muted small mt">Consejo: en iPhone, si no escuchas los pitidos revisa que el interruptor de silencio esté desactivado.</p>`;
  $app.querySelectorAll("[data-pref]").forEach((c) =>
    c.addEventListener("change", () => {
      prefs[c.dataset.pref] = c.checked;
      save(LS.prefs, prefs);
    })
  );
  bindActs({
    test: () => {
      unlockAudio();
      beep(880, 0.15, 2);
      say("Sonido de prueba");
    },
  });
}

// ---------- inicio ----------
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
if (session && !plan.days[session.dayIndex]) {
  session = null;
  save(LS.session, null);
}
render();
