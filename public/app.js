/* FocusFlow — base condivisa da tutte le pagine
   - dati dei task (localStorage, in attesa del backend Node/Express/MySQL)
   - sessione demo
   - barra di navigazione e pannello "Nuovo task"
   Uso nelle pagine:  <script type="module"> import * as FF from './app.js'; ... </script> */

export const PRIORITIES = ['alta', 'media', 'bassa'];
export const MAX_TASKS_PER_DAY = 8;   // stesso valore in server/lib/validate.js: un petalo per task

const KEY_TASKS = 'ff_tasks';
const KEY_USER = 'ff_user';
const KEY_CAT = 'ff_cat_day';   // demo: ultimo giorno in cui il gattino ha consegnato il fiore

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
   { id, title, priority,
     date, created, done, doneOn, subtasks: [{ id, title, done }] }
   ============================================================ */
const uid = () => Math.random().toString(36).slice(2, 10);

function seed() {
    const t = todayISO();
    const sub = (titles, doneCount) => titles.map((title, i) => ({ id: uid(), title, done: i < doneCount }));
    return [
        { id: uid(), title: 'Preparare presentazione Q3', priority: 'alta',
          date: t, created: t, done: false, doneOn: null,
          subtasks: sub(['Raccogliere i dati', 'Creare le slide', 'Provare il discorso'], 1) },
        { id: uid(), title: 'Comprare frutta e verdura', priority: 'bassa',
          date: t, created: t, done: false, doneOn: null,
          subtasks: sub(['Fare la lista', 'Andare al mercato', 'Sistemare la spesa'], 0) },
        { id: uid(), title: 'Leggere 30 pagine', priority: 'media',
          date: t, created: t, done: false, doneOn: null, subtasks: [] },
        { id: uid(), title: 'Yoga mattutino', priority: 'bassa',
          date: t, created: t, done: true, doneOn: t, subtasks: [] },
        { id: uid(), title: 'Chiamare il dentista', priority: 'alta',
          date: addDaysISO(t, -3), created: addDaysISO(t, -4), done: false, doneOn: null, subtasks: [] },
        { id: uid(), title: 'Revisione codice collega', priority: 'media',
          date: addDaysISO(t, -2), created: addDaysISO(t, -5), done: false, doneOn: null, subtasks: [] },
        { id: uid(), title: 'Pagare bolletta luce', priority: 'media',
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
let loadFailed = false;    // sessione valida ma task non caricati dal server

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

            // Chi ha una sessione vera non deve mai finire sui dati d'esempio
            if (mode === 'local' && session.token()) mode = 'api';

            if (mode === 'api') {
                if (session.token()) {
                    try { cache = await http('GET', '/tasks'); }
                    catch (err) { loadFailed = true; }
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
    if (loadFailed) showLoadError();
    syncFlowerSoon();
}

function showLoadError() {
    const el = document.createElement('p');
    el.className = 'ff-banner';
    el.setAttribute('role', 'alert');
    el.innerHTML = 'Non riesco a caricare i tuoi task: il server non risponde. <button type="button">Riprova</button>';
    el.querySelector('button').addEventListener('click', () => location.reload());
    const app = document.querySelector('.ff-app');
    app.classList.add('ff-load-failed');
    app.prepend(el);
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
    },
    async changePassword(current, next) {
        const { token, user } = await http('POST', '/auth/password', { current, next });
        session.set(user.username, token);
    },
    async deleteAccount(password) {
        await http('DELETE', '/auth/account', { password });
        session.clear();
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
    if (mode !== 'api') { checkLocalDelivery(); return; }
    clearTimeout(flowerTimer);
    flowerTimer = setTimeout(async () => {
        try {
            const flower = await http('PUT', `/flowers/${todayISO()}/sync`);
            window.dispatchEvent(new CustomEvent('ff:flower', { detail: flower }));
            if (flower.justDelivered) showCat();
        } catch (e) { /* si riallinea alla prossima modifica */ }
    }, 600);
}

/* Demo: stessa regola del server. Il fiore è completo quando non resta nulla da fare oggi */
function checkLocalDelivery() {
    const today = todayISO();
    if (store.get(KEY_CAT) === today) return;
    const day = cache.filter((t) => (t.done ? t.doneOn === today : t.date === today));
    if (day.length === 0 || !day.every((t) => t.done)) return;
    store.set(KEY_CAT, today);
    showCat();
}

/* Il gattino arriva con in bocca il fiore di oggi */
function showCat() {
    if (document.querySelector('.ff-cat')) return;
    const today = flowers().find((f) => f.date === todayISO());
    const petals = today ? today.tasks.length : 0;
    const el = document.createElement('div');
    el.className = 'ff-cat';
    el.setAttribute('role', 'status');
    const cat = ART_READY
        ? `<span class="ff-cat-art" aria-hidden="true"><img src="img/gattino.png" alt=""><img src="${flowerArt(petals || 1)}" alt=""></span>`
        : `
      <svg viewBox="0 0 120 84" aria-hidden="true">
        <path d="M24 52c-14-4-18-18-10-27" fill="none" stroke="var(--gold)" stroke-width="7" stroke-linecap="round"/>
        <g class="ff-cat-legs" stroke="var(--gold)" stroke-width="7" stroke-linecap="round">
          <path d="M34 62v14"/><path d="M46 62v14"/><path d="M62 62v14"/><path d="M74 62v14"/>
        </g>
        <ellipse cx="52" cy="52" rx="32" ry="17" fill="var(--gold)"/>
        <path d="M71 28l2-15 11 9zM95 22l11-9 2 15z" fill="var(--gold)"/>
        <circle cx="89" cy="36" r="18" fill="var(--gold)"/>
        <circle cx="84" cy="33" r="2" fill="var(--ink)"/>
        <circle cx="96" cy="33" r="2" fill="var(--ink)"/>
        <path d="M90 39l-2 3M90 39l2 3" stroke="var(--ink)" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M91 43L108 22" stroke="#90A970" stroke-width="2.5" stroke-linecap="round"/>
        ${flowerHead(108, 22, petals)}
      </svg>`;
    el.innerHTML = `
      ${cat}
      <p><strong>Consegna speciale!</strong>Hai finito tutto: il fiore di oggi è nel tuo giardino.</p>
      <button type="button">Grazie</button>`;
    el.querySelector('button').addEventListener('click', () => el.remove());
    document.body.appendChild(el);
}

/* ---------- Task ---------- */
export const getTasks = () => cache;

/* Task previsti in un giorno */
export function dueOn(iso) {
    return getTasks().filter((t) => t.date === iso);
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

/* Disegni in public/img: fiore-1.png ... fiore-8.png e gattino.png.
   Da mettere a true quando ci sono tutti; fino ad allora si usano i segnaposto disegnati qui. */
export const ART_READY = false;
export const flowerArt = (n) => `img/fiore-${Math.min(n, MAX_TASKS_PER_DAY)}.png`;

/* Corolla del fiore: n petali dall'alto in senso orario, con i colori della palette a rotazione */
const PETAL_COLORS = ['--rose', '--lav', '--gold', '--blue', '--coral', '--green'];

export function flowerHead(x, y, n) {
    const petals = Array.from({ length: n }, (_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / MAX_TASKS_PER_DAY;
        return `<circle cx="${(x + Math.cos(a) * 8).toFixed(1)}" cy="${(y + Math.sin(a) * 8).toFixed(1)}" r="4.4" style="fill: var(${PETAL_COLORS[i % PETAL_COLORS.length]})"/>`;
    }).join('');
    return `<g fill-opacity="0.92">${petals}</g><circle cx="${x}" cy="${y}" r="3.6" fill="#F5CFDA"/>`;
}

/* Applica subito la modifica all'interfaccia; con il server la salva in seguito e,
   se fallisce, annulla la modifica e avvisa. */
function persistChange(remote, rollback) {
    if (mode !== 'api') { saveLocal(); syncFlowerSoon(); return; }
    remote().then(syncFlowerSoon).catch((err) => {
        rollback();
        toast(err.message || 'Modifica non salvata');
    });
}

export async function addTask(draft) {
    const created = todayISO();
    const fields = {
        title: draft.title,
        priority: PRIORITIES.includes(draft.priority) ? draft.priority : 'media',
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

/* Modifica campi del task; changes contiene solo quelli cambiati */
export function editTask(id, changes) {
    const task = cache.find((x) => x.id === id);
    if (!task) return false;
    if (changes.date && isDayFull(changes.date)) { toast(DAY_FULL); return false; }
    const before = Object.fromEntries(Object.keys(changes).map((k) => [k, task[k]]));
    Object.assign(task, changes);
    notify();
    persistChange(
        () => http('PATCH', `/tasks/${id}`, changes),
        () => { Object.assign(task, before); notify(); });
    return true;
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
        ? `<button class="sub-toggle" type="button" data-toggle-subs="${t.id}" aria-expanded="${openSubs.has(t.id)}" aria-controls="subs-${t.id}"><span class="sub-arrow" aria-hidden="true">▸</span> ${subDone}/${t.subtasks.length} sotto-attività</button>
           <ul class="subtasks" id="subs-${t.id}" data-subs="${t.id}" ${openSubs.has(t.id) ? '' : 'hidden'}>
             ${t.subtasks.map((s) => `<li class="${s.done ? 'done' : ''}"><input type="checkbox" data-sub="${t.id}:${s.id}" aria-label="${esc(s.title)}" ${s.done ? 'checked' : ''} ${lock}><span>${esc(s.title)}</span></li>`).join('')}
           </ul>`
        : '';
    const date = showDate ? `<span>${shortDate(t.date)}</span>` : '';
    // I task completati restano fissi: fanno parte del fiore della loro giornata
    const edit = t.done ? '' : `<button class="task-edit" type="button" data-edit="${t.id}" aria-label="Modifica ${esc(t.title)}">${ICONS.edit}</button>`;
    return `
      <article class="task ${t.done ? 'done' : ''}" data-p="${t.priority}" data-id="${t.id}">
        <button class="task-check" type="button" data-check="${t.id}" ${lock} aria-label="${t.done ? 'Segna come da fare' : 'Completa'}: ${esc(t.title)}">${ICONS.check}</button>
        <div class="task-body">
          <div class="task-title">${esc(t.title)}</div>
          <div class="task-meta">
            <span class="prio" data-p="${t.priority}">${t.priority}</span>
            ${date}
          </div>
          ${subs}
        </div>
        ${edit}
      </article>`;
}

/* Collega i click di una lista di card (spunta, sotto-attività, apri/chiudi) */
export function wireTaskList(root) {
    root.addEventListener('click', (e) => {
        const check = e.target.closest('[data-check]');
        if (check) {
            const id = check.dataset.check;
            toggleTask(id);
            document.querySelector(`[data-check="${id}"]`)?.focus();   // la card è stata ridisegnata
            return;
        }
        const edit = e.target.closest('[data-edit]');
        if (edit) { openEdit(edit.dataset.edit); return; }
        const tog = e.target.closest('[data-toggle-subs]');
        if (tog) {
            const list = root.querySelector(`[data-subs="${tog.dataset.toggleSubs}"]`);
            if (list) {
                list.hidden = !list.hidden;
                tog.setAttribute('aria-expanded', String(!list.hidden));
                if (list.hidden) openSubs.delete(tog.dataset.toggleSubs);
                else openSubs.add(tog.dataset.toggleSubs);
            }
        }
    });
    root.addEventListener('change', (e) => {
        const sub = e.target.closest('[data-sub]');
        if (sub) {
            const key = sub.dataset.sub;
            const [id, subId] = key.split(':');
            toggleSub(id, subId);
            document.querySelector(`[data-sub="${key}"]`)?.focus();
        }
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
    edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13 7l4 4"/>'),
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
    return [{ title: label || text.trim(), priority, date }];
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
let editEl = null;
let editingId = null;
let lastFocus = null;     // elemento da cui si è aperto il pannello

/* Con un pannello aperto, Tab non deve finire sulla pagina sotto */
function setPageInert(value) {
    document.querySelector('.ff-app')?.toggleAttribute('inert', value);
    document.querySelector('.ff-nav')?.toggleAttribute('inert', value);
}

const options = (items, selected) => items
    .map(([value, text]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${text}</option>`).join('');
const PRIORITY_OPTIONS = PRIORITIES.map((p) => [p, p]);

export function openSheet() {
    if (!sheetEl) return;
    lastFocus = document.activeElement;
    setPageInert(true);
    backdropEl.classList.add('open');
    sheetEl.classList.add('open');
    sheetEl.setAttribute('aria-hidden', 'false');
    sheetEl.inert = false;
    const first = sheetEl.querySelector('[data-view="review"]').hidden
        ? sheetEl.querySelector('textarea')
        : sheetEl.querySelector('.rv-title');
    if (first) first.focus();
    getNlp().catch(() => {});   // mostra subito lo stato dell'IA avanzata
}

export function closeSheet() {
    if (!sheetEl || !backdropEl.classList.contains('open')) return;
    const editedId = editingId;
    backdropEl.classList.remove('open');
    sheetEl.classList.remove('open');
    sheetEl.setAttribute('aria-hidden', 'true');
    sheetEl.inert = true;
    if (editEl) {
        editEl.classList.remove('open');
        editEl.setAttribute('aria-hidden', 'true');
        editEl.inert = true;
        editingId = null;
    }
    setPageInert(false);
    // Se l'elenco è stato ridisegnato si torna al task modificato, o al pulsante +
    const back = lastFocus?.isConnected ? lastFocus : document.querySelector(`[data-edit="${editedId}"]`);
    (back || document.querySelector('.ff-fab'))?.focus();
}

export function openEdit(id) {
    const t = cache.find((x) => x.id === id);
    if (!t || !editEl) return;
    editingId = id;
    const q = (sel) => editEl.querySelector(sel);
    q('.ed-title').value = t.title;
    q('.ed-prio').innerHTML = options(PRIORITY_OPTIONS, t.priority);
    q('.ed-date').value = t.date;
    q('[data-save]').disabled = false;
    lastFocus = document.activeElement;
    setPageInert(true);
    backdropEl.classList.add('open');
    editEl.classList.add('open');
    editEl.setAttribute('aria-hidden', 'false');
    editEl.inert = false;
    q('.ed-title').focus();
}

/* Stato del modello sul dispositivo, mostrato in fondo al pannello */
function renderStatus(s) {
    const el = sheetEl && sheetEl.querySelector('.ff-ai-status');
    if (!el) return;
    const action = (name, text) => `<button type="button" data-ai="${name}">${text}</button>`;
    if (s.state === 'off') el.innerHTML = `${action('on', 'Attiva IA avanzata')}: circa 780 MB da scaricare, meglio in Wi-Fi`;
    else if (s.state === 'loading') el.innerHTML = `Modello IA in caricamento… ${s.progress}% ${action('off', 'Annulla')}`;
    else if (s.state === 'failed') el.innerHTML = `Modello IA non disponibile: uso le regole di base. ${action('on', 'Riprova')}`;
    else el.innerHTML = `IA avanzata attiva ${action('off', 'Disattiva')}`;
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
    sheetEl.inert = true;
    sheetEl.innerHTML = `
      <div class="ff-sheet-handle"></div>
      <header class="ff-sheet-head">
        <h2 id="ff-sheet-title">Nuovo task</h2>
        <button class="ff-icon-btn" type="button" data-close aria-label="Chiudi">${ICONS.close}</button>
      </header>

      <div data-view="input">
        <p class="ff-sheet-lead">Scrivi il task in modo naturale — l'AI lo strutturerà per te</p>
        <textarea rows="3" placeholder="Es. Chiamare il dentista domani, urgente"></textarea>
        <p class="ff-hint">Suggerimento: puoi indicare data (oggi/domani/lunedì) e priorità (urgente/importante)</p>
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

    function renderReview(items) {
        drafts = items;
        list.innerHTML = items.map((d, i) => `
          <li class="rv-item" data-i="${i}">
            <div class="rv-head">
              <input class="rv-inc" type="checkbox" checked aria-label="Includi nel salvataggio">
              <input class="rv-title" type="text" value="${esc(d.title)}" aria-label="Titolo del task">
            </div>
            <div class="rv-fields">
              <select class="rv-prio" aria-label="Priorità">${options(PRIORITY_OPTIONS, d.priority)}</select>
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

    q('.ff-ai-status').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-ai]');
        if (!btn) return;
        const nlp = await getNlp();
        if (btn.dataset.ai === 'on') nlp.enableModel();
        else nlp.disableModel();
    });

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
        note.textContent = "Suggerimenti generici: l'IA avanzata non è attiva o non è ancora pronta.";
        btn.hidden = true;
    });

    confirmBtn.addEventListener('click', async () => {
        const rows = [...list.querySelectorAll('.rv-item')].filter((li) => li.querySelector('.rv-inc').checked);
        confirmBtn.disabled = true;

        // I task già salvati escono dall'elenco; se qualcuno fallisce resta lì per riprovare
        await Promise.all(rows.map(async (li) => {
            const title = li.querySelector('.rv-title').value.trim();
            if (!title) return;
            try {
                await addTask({
                    title,
                    priority: li.querySelector('.rv-prio').value,
                    date: li.querySelector('.rv-date').value || drafts[Number(li.dataset.i)].date,
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

function buildEditSheet() {
    editEl = document.createElement('section');
    editEl.className = 'ff-sheet';
    editEl.setAttribute('role', 'dialog');
    editEl.setAttribute('aria-modal', 'true');
    editEl.setAttribute('aria-labelledby', 'ff-edit-title');
    editEl.setAttribute('aria-hidden', 'true');
    editEl.inert = true;
    editEl.innerHTML = `
      <div class="ff-sheet-handle"></div>
      <header class="ff-sheet-head">
        <h2 id="ff-edit-title">Modifica task</h2>
        <button class="ff-icon-btn" type="button" data-close aria-label="Chiudi">${ICONS.close}</button>
      </header>
      <label class="ed-field"><span>Titolo</span><input class="ed-title" type="text" maxlength="200"></label>
      <div class="ed-grid">
        <label class="ed-field"><span>Priorità</span><select class="ed-prio"></select></label>
        <label class="ed-field"><span>Data</span><input class="ed-date" type="date"></label>
      </div>
      <div class="rv-actions">
        <button class="btn ghost" type="button" data-delete>Elimina</button>
        <button class="btn" type="button" data-save>Salva</button>
      </div>`;
    document.body.append(editEl);

    const q = (sel) => editEl.querySelector(sel);
    const title = q('.ed-title');
    const date = q('.ed-date');
    const validate = () => { q('[data-save]').disabled = !title.value.trim() || !date.value; };

    q('[data-close]').addEventListener('click', closeSheet);
    title.addEventListener('input', validate);
    date.addEventListener('input', validate);

    q('[data-save]').addEventListener('click', () => {
        const task = cache.find((x) => x.id === editingId);
        if (!task) return;
        const values = {
            title: title.value.replace(/\s+/g, ' ').trim(),
            priority: q('.ed-prio').value,
            date: date.value
        };
        const changes = Object.fromEntries(Object.entries(values).filter(([k, v]) => v !== task[k]));
        if (Object.keys(changes).length === 0 || editTask(editingId, changes)) closeSheet();
    });

    q('[data-delete]').addEventListener('click', () => {
        const task = cache.find((x) => x.id === editingId);
        if (task && confirm(`Eliminare "${task.title}"?`)) { removeTask(task.id); closeSheet(); }
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
    buildEditSheet();
    nav.querySelector('.ff-fab').addEventListener('click', openSheet);
}
