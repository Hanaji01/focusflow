/* FocusFlow — base condivisa da tutte le pagine
   - dati dei task (localStorage, in attesa del backend Node/Express/MySQL)
   - sessione demo
   - barra di navigazione e pannello "Nuovo task"
   Uso nelle pagine:  <script type="module"> import * as FF from './app.js'; ... </script> */

export const CATEGORIES = {
    lavoro:    { label: 'Lavoro' },
    casa:      { label: 'Casa' },
    studio:    { label: 'Studio' },
    salute:    { label: 'Salute' },
    personale: { label: 'Personale' }
};
export const PRIORITIES = ['alta', 'media', 'bassa'];
export const MAX_TASKS_PER_DAY = 8;   // stesso valore in server/lib/validate.js: un petalo per task

const KEY_TASKS = 'ff_tasks';
const KEY_USER = 'ff_user';

/* ============================================================
   Date — sempre in ora locale, formato YYYY-MM-DD
   ============================================================ */
export function toISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
export function fromISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}
export const todayISO = () => toISO(new Date());
export function addDaysISO(iso, n) {
    const d = fromISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
}
export function longDate(iso) {
    const s = fromISO(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
}
export function shortDate(iso) {
    return fromISO(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }).replace('.', '');
}

export function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ============================================================
   Dati — un task:
   { id, title, category, priority, type: 'evento'|'scadenza',
     date, created, done, doneOn, subtasks: [{ id, title, done }] }
   ============================================================ */
const uid = () => Math.random().toString(36).slice(2, 10);

function seed() {
    const t = todayISO();
    const sub = (titles, doneCount) => titles.map((title, i) => ({ id: uid(), title, done: i < doneCount }));
    return [
        { id: uid(), title: 'Preparare presentazione Q3', category: 'lavoro', priority: 'alta', type: 'evento',
          date: t, created: t, done: false, doneOn: null,
          subtasks: sub(['Raccogliere i dati', 'Creare le slide', 'Provare il discorso'], 1) },
        { id: uid(), title: 'Comprare frutta e verdura', category: 'casa', priority: 'bassa', type: 'evento',
          date: t, created: t, done: false, doneOn: null,
          subtasks: sub(['Fare la lista', 'Andare al mercato', 'Sistemare la spesa'], 0) },
        { id: uid(), title: 'Leggere 30 pagine', category: 'studio', priority: 'media', type: 'evento',
          date: t, created: t, done: false, doneOn: null, subtasks: [] },
        { id: uid(), title: 'Yoga mattutino', category: 'salute', priority: 'bassa', type: 'evento',
          date: t, created: t, done: true, doneOn: t, subtasks: [] },
        { id: uid(), title: 'Chiamare il dentista', category: 'salute', priority: 'alta', type: 'evento',
          date: addDaysISO(t, -3), created: addDaysISO(t, -4), done: false, doneOn: null, subtasks: [] },
        { id: uid(), title: 'Revisione codice collega', category: 'lavoro', priority: 'media', type: 'scadenza',
          date: addDaysISO(t, -2), created: addDaysISO(t, -5), done: false, doneOn: null, subtasks: [] },
        { id: uid(), title: 'Pagare bolletta luce', category: 'casa', priority: 'media', type: 'scadenza',
          date: addDaysISO(t, -1), created: addDaysISO(t, -6), done: false, doneOn: null, subtasks: [] }
    ];
}

/* ============================================================
   Dati e sessione — due modalità:
   - 'api'   → server Express + MySQL: l'interfaccia si aggiorna subito, il salvataggio segue
   - 'local' → modalità demo nel browser (localStorage), quando il server non c'è
   ============================================================ */
const KEY_TOKEN = 'ff_token';

let mode = 'local';
let cache = [];
let initPromise = null;

export const getMode = () => mode;

const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* non disponibile */ } },
    del(key) { try { localStorage.removeItem(key); } catch (e) { /* ignora */ } }
};

const notify = () => window.dispatchEvent(new CustomEvent('ff:change'));

/* Messaggio breve in basso */
let toastTimer;
export function toast(message) {
    let el = document.querySelector('.ff-toast');
    if (!el) {
        el = document.createElement('div');
        el.className = 'ff-toast';
        el.setAttribute('role', 'status');
        document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

/* ---------- Sessione ---------- */
export const session = {
    user() { return store.get(KEY_USER); },
    token() { return store.get(KEY_TOKEN); },
    ok() { return Boolean(session.user()) && (mode !== 'api' || Boolean(session.token())); },
    set(user, token) {
        store.set(KEY_USER, user);
        if (token) store.set(KEY_TOKEN, token); else store.del(KEY_TOKEN);
    },
    clear() { store.del(KEY_USER); store.del(KEY_TOKEN); },
    logout() { flushTelemetry(); session.clear(); location.href = 'login.html'; }
};

/* ---------- Telemetria tecnica (solo con il server) ---------- */
const tQueue = [];
let tTimer = null;

export function track(metric, value = null, meta = {}) {
    if (mode !== 'api' || !session.token()) return;
    tQueue.push({ metric, value, meta });
    if (!tTimer) tTimer = setTimeout(flushTelemetry, 3000);
}

function flushTelemetry() {
    tTimer = null;
    const events = tQueue.splice(0, 50);
    const token = session.token();
    if (events.length === 0 || !token) return;
    fetch('/api/telemetry', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ events })
    }).catch(() => { /* la telemetria non deve mai disturbare l'uso */ });
    if (tQueue.length > 0) tTimer = setTimeout(flushTelemetry, 3000);
}
window.addEventListener('pagehide', flushTelemetry);

/* ---------- Chiamate al server ---------- */
async function http(method, path, body) {
    const t0 = performance.now();
    const token = session.token();
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = res.status === 204 ? null : await res.json().catch(() => null);

    if (res.status === 401 && token) {          // sessione scaduta o token non valido
        session.clear();
        location.replace('login.html');
        throw new Error('Sessione scaduta: accedi di nuovo');
    }
    if (!res.ok) throw Object.assign(new Error((data && data.error) || `Errore ${res.status}`), { status: res.status });

    track('api_latency_ms', Math.round(performance.now() - t0), { method, path: path.replace(/\d+/g, ':id') });
    return data;
}

/* ---------- Avvio: sceglie la modalità e carica i task ---------- */
export function init() {
    if (!initPromise) {
        initPromise = (async () => {
            try {
                const res = await fetch('/api/health', { cache: 'no-store' });
                const data = await res.json().catch(() => null);
                if (res.ok && data && data.ok) mode = 'api';
                else if (res.status === 503) { mode = 'api'; toast('Il database non è raggiungibile'); }
            } catch (e) { /* nessun server: si resta in modalità demo */ }

            if (mode === 'api') {
                if (session.token()) {
                    try { cache = await http('GET', '/tasks'); }
                    catch (err) { toast('Impossibile caricare i task: ' + err.message); }
                }
            } else {
                loadLocal();
            }
        })();
    }
    return initPromise;
}

/* Da chiamare all'inizio di ogni pagina interna: porta al login se manca la sessione, poi monta la barra */
export async function boot(active) {
    await init();
    if (!session.ok()) {
        location.replace('login.html');
        await new Promise(() => {}); // la pagina sta cambiando: si ferma qui
    }
    mountNav(active);
    syncFlowerSoon();
}

export const auth = {
    async login(username, password) {
        if (mode !== 'api') { session.set(username, null); return; } // demo: qualunque credenziale
        const { token, user } = await http('POST', '/auth/login', { username, password });
        session.set(user.username, token);
    },
    async register(username, password) {
        if (mode !== 'api') throw new Error('La registrazione richiede il server');
        const { token, user } = await http('POST', '/auth/register', { username, password });
        session.set(user.username, token);
    }
};

/* ---------- Modalità demo ---------- */
function loadLocal() {
    try {
        const raw = store.get(KEY_TASKS);
        if (raw) { cache = JSON.parse(raw); return; }
    } catch (e) { /* dati non leggibili: si riparte dai dati di esempio */ }
    cache = seed();
    saveLocal();
}
const saveLocal = () => store.set(KEY_TASKS, JSON.stringify(cache));

export function resetDemo() {
    if (mode !== 'local') return;
    store.del(KEY_TASKS);
    loadLocal();
    notify();
}

/* ---------- Fiore del giorno (solo con il server) ---------- */
let flowerTimer = null;
function syncFlowerSoon() {
    if (mode !== 'api') return;
    clearTimeout(flowerTimer);
    flowerTimer = setTimeout(async () => {
        try {
            const flower = await http('PUT', `/flowers/${todayISO()}/sync`);
            window.dispatchEvent(new CustomEvent('ff:flower', { detail: flower }));
        } catch (e) { /* si riallinea alla prossima modifica */ }
    }, 600);
}

/* ---------- Task ---------- */
export const getTasks = () => cache;

/* Task "dovuti" in un giorno: un evento vale solo nella sua data;
   una scadenza resta visibile ogni giorno dalla creazione fino alla scadenza. */
export function dueOn(iso) {
    return getTasks().filter((t) => t.type === 'scadenza'
        ? t.created <= iso && t.date >= iso && (!t.done || t.doneOn === iso)
        : t.date === iso);
}

/* Task non completati con data già passata: alimentano "In sospeso" */
export function overdue(iso = todayISO()) {
    return getTasks().filter((t) => !t.done && t.date < iso);
}

/* Tetto giornaliero: conta i task con quella data, completati compresi */
const DAY_FULL = `Giornata piena: massimo ${MAX_TASKS_PER_DAY} task al giorno. Scegli un'altra data.`;
export const isDayFull = (iso) => getTasks().filter((t) => t.date === iso).length >= MAX_TASKS_PER_DAY;

/* Giardino: un fiore per ogni giorno con almeno un task completato, con un petalo per task */
export function flowers() {
    const days = new Map();
    for (const t of getTasks()) {
        if (!t.done || !t.doneOn) continue;
        if (!days.has(t.doneOn)) days.set(t.doneOn, []);
        days.get(t.doneOn).push(t);
    }
    return [...days]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, tasks]) => ({ date, tasks: tasks.slice(0, MAX_TASKS_PER_DAY) }));
}

/* Applica subito la modifica all'interfaccia; con il server la salva in seguito e,
   se fallisce, annulla la modifica e avvisa. */
function persistChange(remote, rollback) {
    if (mode !== 'api') { saveLocal(); return; }
    remote().then(syncFlowerSoon).catch((err) => {
        rollback();
        toast(err.message || 'Modifica non salvata');
    });
}

export async function addTask(draft) {
    const created = todayISO();
    const fields = {
        title: draft.title,
        category: CATEGORIES[draft.category] ? draft.category : 'personale',
        priority: PRIORITIES.includes(draft.priority) ? draft.priority : 'media',
        type: draft.type === 'scadenza' ? 'scadenza' : 'evento',
        date: draft.date || created,
        created
    };
    const subtitles = draft.subtasks || [];

    if (isDayFull(fields.date)) {
        toast(DAY_FULL);
        throw new Error(DAY_FULL);
    }

    if (mode === 'api') {
        try {
            const task = await http('POST', '/tasks', { ...fields, subtasks: subtitles });
            cache.push(task);
            notify();
            syncFlowerSoon();
            return task;
        } catch (err) {
            toast(err.message || 'Task non salvato');
            throw err;
        }
    }
    const task = { id: uid(), ...fields, done: false, doneOn: null,
                   subtasks: subtitles.map((s) => ({ id: uid(), title: s, done: false })) };
    cache.push(task);
    saveLocal();
    notify();
    return task;
}

export function toggleTask(id) {
    const task = cache.find((x) => x.id === id);
    if (!task) return;
    const before = { done: task.done, doneOn: task.doneOn };
    task.done = !task.done;
    task.doneOn = task.done ? todayISO() : null;
    notify();
    persistChange(
        () => http('PATCH', `/tasks/${id}`, { done: task.done, doneOn: task.doneOn }),
        () => { Object.assign(task, before); notify(); });
}

export function toggleSub(id, subId) {
    const task = cache.find((x) => x.id === id);
    const sub = task && task.subtasks.find((s) => s.id === subId);
    if (!sub) return;
    sub.done = !sub.done;
    notify();
    persistChange(
        () => http('PATCH', `/subtasks/${subId}`, { done: sub.done }),
        () => { sub.done = !sub.done; notify(); });
}

export function moveTask(id, iso) {
    const task = cache.find((x) => x.id === id);
    if (!task || task.date === iso) return;
    if (isDayFull(iso)) { toast(DAY_FULL); return; }
    const before = task.date;
    task.date = iso;
    notify();
    persistChange(
        () => http('PATCH', `/tasks/${id}`, { date: iso }),
        () => { task.date = before; notify(); });
}

export function removeTask(id) {
    const index = cache.findIndex((x) => x.id === id);
    if (index < 0) return;
    const [removed] = cache.splice(index, 1);
    notify();
    persistChange(
        () => http('DELETE', `/tasks/${id}`),
        () => { cache.splice(index, 0, removed); notify(); });
}

/* ============================================================
   Card task condivisa (Oggi, In sospeso, Calendario)
   ============================================================ */
const openSubs = new Set(); // card con l'elenco delle sotto-attività aperto

export function taskCardHTML(t, { showDate = false, readOnly = false } = {}) {
    const lock = readOnly ? 'disabled' : '';
    const subDone = t.subtasks.filter((s) => s.done).length;
    const subs = t.subtasks.length
        ? `<button class="sub-toggle" type="button" data-toggle-subs="${t.id}">▸ ${subDone}/${t.subtasks.length} sotto-attività</button>
           <ul class="subtasks" data-subs="${t.id}" ${openSubs.has(t.id) ? '' : 'hidden'}>
             ${t.subtasks.map((s) => `<li class="${s.done ? 'done' : ''}"><input type="checkbox" data-sub="${t.id}:${s.id}" ${s.done ? 'checked' : ''} ${lock}><span>${esc(s.title)}</span></li>`).join('')}
           </ul>`
        : '';
    const date = showDate ? `<span>${shortDate(t.date)}</span>` : '';
    return `
      <article class="task ${t.done ? 'done' : ''}" data-cat="${t.category}" data-id="${t.id}">
        <button class="task-check" type="button" data-check="${t.id}" ${lock} aria-label="${t.done ? 'Segna come da fare' : 'Segna come completato'}">${ICONS.check}</button>
        <div class="task-body">
          <div class="task-title">${esc(t.title)}</div>
          <div class="task-meta">
            <span class="cat-label">${CATEGORIES[t.category].label}</span>
            <span class="prio" data-p="${t.priority}">${t.priority}</span>
            ${date}
          </div>
          ${subs}
        </div>
      </article>`;
}

/* Collega i click di una lista di card (spunta, sotto-attività, apri/chiudi) */
export function wireTaskList(root) {
    root.addEventListener('click', (e) => {
        const check = e.target.closest('[data-check]');
        if (check) { toggleTask(check.dataset.check); return; }
        const tog = e.target.closest('[data-toggle-subs]');
        if (tog) {
            const list = root.querySelector(`[data-subs="${tog.dataset.toggleSubs}"]`);
            if (list) {
                list.hidden = !list.hidden;
                if (list.hidden) openSubs.delete(tog.dataset.toggleSubs);
                else openSubs.add(tog.dataset.toggleSubs);
            }
        }
    });
    root.addEventListener('change', (e) => {
        const sub = e.target.closest('[data-sub]');
        if (sub) { const [id, subId] = sub.dataset.sub.split(':'); toggleSub(id, subId); }
    });
}

/* ============================================================
   Icone (contorno sottile)
   ============================================================ */
const svg = (inner, w = 1.75) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const ICONS = {
    calendario: svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>'),
    oggi: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 2.4),
    sospeso: svg('<path d="M6 2h12M6 22h12M7 2v4.5a3 3 0 0 0 .9 2.1L12 12 7.9 15.4a3 3 0 0 0-.9 2.1V22M17 2v4.5a3 3 0 0 1-.9 2.1L12 12l4.1 3.4a3 3 0 0 1 .9 2.1V22"/>'),
    giardino: svg('<path d="M12 22v-7"/><path d="M8 15h8a4.5 4.5 0 0 0 1.2-8.8A5.5 5.5 0 0 0 7 5.6 4.6 4.6 0 0 0 8 15z"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    spark: svg('<path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2L12 3z"/>')
};

/* ============================================================
   Analisi del testo del "Nuovo task"
   La pipeline vera (chrono-node + modello sul dispositivo) è in nlp.js e si carica solo
   quando serve. Se non si riesce a caricarla si usa questa euristica minima.
   ============================================================ */
const WEEKDAYS = { domenica: 0, lunedì: 1, lunedi: 1, martedì: 2, martedi: 2, mercoledì: 3, mercoledi: 3,
                   giovedì: 4, giovedi: 4, venerdì: 5, venerdi: 5, sabato: 6 };

function nextWeekday(target) {
    const d = new Date();
    const diff = (target - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return toISO(d);
}

function guessCategory(text) {
    const l = text.toLowerCase();
    if (/(riunione|presentazione|relazione|cliente|report|email|mail|progetto|ufficio)/.test(l)) return 'lavoro';
    if (/(spesa|bolletta|pulire|casa|frutta|verdura|cucinare|bucato)/.test(l)) return 'casa';
    if (/(studiare|leggere|esame|lezione|tesi|libro|ripasso)/.test(l)) return 'studio';
    if (/(dentista|medico|yoga|palestra|visita|corsa|allenamento)/.test(l)) return 'salute';
    return 'personale';
}

function heuristicAnalyze(text) {
    const l = text.toLowerCase();
    let date = todayISO();
    if (/\bdopodomani\b/.test(l)) date = addDaysISO(todayISO(), 2);
    else if (/\bdomani\b/.test(l)) date = addDaysISO(todayISO(), 1);
    else {
        // \b non riconosce il confine dopo una lettera accentata ("venerdì"): si usano lookaround Unicode
        const day = Object.keys(WEEKDAYS).find((w) => new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, 'u').test(l));
        if (day) date = nextWeekday(WEEKDAYS[day]);
    }
    const priority = /(urgente|importante|subito)/.test(l) ? 'alta'
        : /(quando ho tempo|con calma|non urgente)/.test(l) ? 'bassa' : 'media';
    const title = text
        .replace(/\b(oggi|domani|dopodomani|urgente|importante)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/[,\s]+$/, '')
        .trim();
    const label = title.charAt(0).toUpperCase() + title.slice(1);
    return [{ title: label || text.trim(), category: guessCategory(text), priority,
              type: /\bentro\b/.test(l) ? 'scadenza' : 'evento', date }];
}

let nlpPromise = null;
function getNlp() {
    if (!nlpPromise) nlpPromise = import('./nlp.js').then((m) => { m.onStatus(renderStatus); return m; });
    return nlpPromise;
}

async function analyzeText(text) {
    try {
        return await (await getNlp()).analyze(text);
    } catch (err) {
        console.warn('[FocusFlow] pipeline NLP non disponibile, uso l\'euristica minima.', err);
        return heuristicAnalyze(text);
    }
}

async function suggestSubtasks(title) {
    try {
        return await (await getNlp()).breakdown(title);
    } catch (err) {
        const t = title.charAt(0).toLowerCase() + title.slice(1);
        return { items: [`Preparare quello che serve per: ${t}`, `Svolgere: ${t}`, 'Controllare il risultato'], source: 'base' };
    }
}

/* ============================================================
   Navigazione + pannello "Nuovo task"
   Due viste: scrittura del testo e controllo dei task trovati prima di salvarli.
   ============================================================ */
let sheetEl = null;
let backdropEl = null;
let drafts = [];

export function openSheet() {
    if (!sheetEl) return;
    backdropEl.classList.add('open');
    sheetEl.classList.add('open');
    sheetEl.setAttribute('aria-hidden', 'false');
    const first = sheetEl.querySelector('[data-view="review"]').hidden
        ? sheetEl.querySelector('textarea')
        : sheetEl.querySelector('.rv-title');
    if (first) first.focus();
}

export function closeSheet() {
    if (!sheetEl) return;
    backdropEl.classList.remove('open');
    sheetEl.classList.remove('open');
    sheetEl.setAttribute('aria-hidden', 'true');
}

/* Stato del modello sul dispositivo, mostrato in fondo al pannello */
function renderStatus(s) {
    const el = sheetEl && sheetEl.querySelector('.ff-ai-status');
    if (!el) return;
    if (s.state === 'loading') el.textContent = `Modello IA in caricamento… ${s.progress}%`;
    else if (s.state === 'failed') el.textContent = 'Modello IA non disponibile: uso le regole di base.';
    else el.textContent = '';
}

function buildSheet() {
    backdropEl = document.createElement('div');
    backdropEl.className = 'ff-backdrop';

    sheetEl = document.createElement('section');
    sheetEl.className = 'ff-sheet';
    sheetEl.setAttribute('role', 'dialog');
    sheetEl.setAttribute('aria-modal', 'true');
    sheetEl.setAttribute('aria-labelledby', 'ff-sheet-title');
    sheetEl.setAttribute('aria-hidden', 'true');
    sheetEl.innerHTML = `
      <div class="ff-sheet-handle"></div>
      <header class="ff-sheet-head">
        <h2 id="ff-sheet-title">Nuovo task</h2>
        <button class="ff-icon-btn" type="button" data-close aria-label="Chiudi">${ICONS.close}</button>
      </header>

      <div data-view="input">
        <p class="ff-sheet-lead">Scrivi il task in modo naturale — l'AI lo strutturerà per te</p>
        <textarea rows="3" placeholder="Es. Chiamare il dentista domani, urgente"></textarea>
        <p class="ff-hint">Suggerimento: puoi indicare data (oggi/domani/lunedì), priorità (urgente/importante) e tipo</p>
        <button class="btn" type="button" data-analyze disabled>${ICONS.spark}<span>Analizza con AI</span></button>
      </div>

      <div data-view="review" hidden>
        <p class="ff-sheet-lead">Controlla i task trovati: puoi correggerli o escluderli prima di salvare.</p>
        <ul class="rv-list"></ul>
        <div class="rv-actions">
          <button class="btn ghost" type="button" data-back>Indietro</button>
          <button class="btn" type="button" data-confirm>Aggiungi</button>
        </div>
      </div>

      <p class="ff-ai-status" role="status" aria-live="polite"></p>`;

    document.body.append(backdropEl, sheetEl);

    const q = (sel) => sheetEl.querySelector(sel);
    const input = q('textarea');
    const analyze = q('[data-analyze]');
    const label = analyze.querySelector('span');
    const viewInput = q('[data-view="input"]');
    const viewReview = q('[data-view="review"]');
    const list = q('.rv-list');
    const confirmBtn = q('[data-confirm]');

    const showView = (name) => {
        viewInput.hidden = name !== 'input';
        viewReview.hidden = name !== 'review';
    };

    const updateCount = () => {
        const n = list.querySelectorAll('.rv-inc:checked').length;
        confirmBtn.disabled = n === 0;
        confirmBtn.textContent = n === 1 ? 'Aggiungi 1 task' : `Aggiungi ${n} task`;
    };

    const options = (items, selected) => items
        .map(([value, text]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${text}</option>`).join('');

    function renderReview(items) {
        drafts = items;
        const cats = Object.entries(CATEGORIES).map(([k, v]) => [k, v.label]);
        const prios = PRIORITIES.map((p) => [p, p]);
        list.innerHTML = items.map((d, i) => `
          <li class="rv-item" data-i="${i}">
            <div class="rv-head">
              <input class="rv-inc" type="checkbox" checked aria-label="Includi nel salvataggio">
              <input class="rv-title" type="text" value="${esc(d.title)}" aria-label="Titolo del task">
            </div>
            <div class="rv-fields">
              <select class="rv-cat" aria-label="Categoria">${options(cats, d.category)}</select>
              <select class="rv-prio" aria-label="Priorità">${options(prios, d.priority)}</select>
              <input class="rv-date" type="date" value="${d.date}" aria-label="Data">
            </div>
            <button class="rv-sub-btn" type="button">+ Suggerisci sotto-attività</button>
            <ul class="rv-subs" hidden></ul>
            <p class="rv-note" hidden></p>
          </li>`).join('');
        updateCount();
    }

    input.addEventListener('input', () => { analyze.disabled = input.value.trim().length === 0; });
    backdropEl.addEventListener('click', closeSheet);
    q('[data-close]').addEventListener('click', closeSheet);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
    q('[data-back]').addEventListener('click', () => { showView('input'); input.focus(); });

    analyze.addEventListener('click', async () => {
        const text = input.value.trim();
        if (!text) return;
        analyze.disabled = true;
        label.textContent = 'Analisi in corso…';
        try {
            renderReview(await analyzeText(text));
            showView('review');
        } finally {
            label.textContent = 'Analizza con AI';
            analyze.disabled = input.value.trim().length === 0;
        }
    });

    list.addEventListener('change', (e) => { if (e.target.closest('.rv-inc')) updateCount(); });

    list.addEventListener('click', async (e) => {
        const btn = e.target.closest('.rv-sub-btn');
        if (!btn) return;
        const li = btn.closest('.rv-item');
        const title = li.querySelector('.rv-title').value.trim();
        if (!title) return;
        btn.disabled = true;
        btn.textContent = 'Cerco suggerimenti…';
        const { items, source } = await suggestSubtasks(title);
        const subs = li.querySelector('.rv-subs');
        subs.innerHTML = items
            .map((s) => `<li><label><input type="checkbox" checked><span>${esc(s)}</span></label></li>`).join('');
        subs.hidden = false;
        const note = li.querySelector('.rv-note');
        note.hidden = source !== 'base';
        note.textContent = 'Suggerimenti generici: il modello IA non era ancora pronto.';
        btn.hidden = true;
    });

    confirmBtn.addEventListener('click', async () => {
        const rows = [...list.querySelectorAll('.rv-item')].filter((li) => li.querySelector('.rv-inc').checked);
        confirmBtn.disabled = true;

        // I task già salvati escono dall'elenco; se qualcuno fallisce resta lì per riprovare
        await Promise.all(rows.map(async (li) => {
            const title = li.querySelector('.rv-title').value.trim();
            if (!title) return;
            const d = drafts[Number(li.dataset.i)];
            try {
                await addTask({
                    title,
                    category: li.querySelector('.rv-cat').value,
                    priority: li.querySelector('.rv-prio').value,
                    type: d.type,
                    date: li.querySelector('.rv-date').value || d.date,
                    subtasks: [...li.querySelectorAll('.rv-subs input:checked')]
                        .map((box) => box.parentElement.querySelector('span').textContent)
                });
                li.remove();
            } catch (err) { /* il messaggio è già mostrato da addTask */ }
        }));

        if (list.querySelector('.rv-item')) { updateCount(); return; }
        input.value = '';
        analyze.disabled = true;
        showView('input');
        closeSheet();
    });
}

export function mountNav(active) {
    const link = (key, text, href) =>
        `<a href="${href}" ${active === key ? 'aria-current="page"' : ''}>${ICONS[key]}<span>${text}</span></a>`;

    const nav = document.createElement('nav');
    nav.className = 'ff-nav';
    nav.setAttribute('aria-label', 'Navigazione principale');
    nav.innerHTML =
        link('calendario', 'Calendario', 'calendario.html') +
        link('oggi', 'Oggi', 'oggi.html') +
        `<button class="ff-fab" type="button" aria-label="Nuovo task">${ICONS.plus}</button>` +
        link('sospeso', 'In sospeso', 'sospeso.html') +
        link('giardino', 'Giardino', 'giardino.html');
    document.body.appendChild(nav);

    buildSheet();
    nav.querySelector('.ff-fab').addEventListener('click', openSheet);
}
