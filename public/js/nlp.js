/* FocusFlow — comprensione del testo sul dispositivo
   ------------------------------------------------------------------
   - Segmentazione in più task   modello (Transformers.js) con tempo massimo, altrimenti regole
   - Data                        chrono-node + regole di ripiego per l'italiano
   - Priorità                    regole (il modello zero-shot è previsto in una fase successiva)
   - Sotto-attività              modello, altrimenti modello di testo generico

   Il modello (Qwen2.5-0.5B-Instruct, ~780 MB) si scarica solo se l'utente lo attiva dal pannello
   "Nuovo task", poi resta nella cache del browser. Gira in nlp-worker.js, quindi non blocca
   l'interfaccia: se non è attivo o non è pronto in pochi secondi si usano le regole. */

import { todayISO, addDaysISO, toISO } from './dates.js';

let track = () => {};
export function setTracker(fn) { track = fn; }

const CHRONO_URL = 'https://cdn.jsdelivr.net/npm/chrono-node@2.10.1/dist/esm/index.js';
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1';
export const MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct';
const MODEL_DTYPE = 'q4';
const KEY_MODEL = 'ff_ai_model';
const MODEL_CACHE = 'transformers-cache';   // cache del browser usata da Transformers.js

/* Tempi massimi (ms) */
export const limits = {
    loadingMs: 4000,        // segmentazione mentre il modello si sta ancora caricando
    readyMs: 25000,         // segmentazione con il modello già pronto
    breakdownWaitMs: 30000  // sotto-attività: azione esplicita, si aspetta di più
};

/* ============================================================
   Stato del modello
   ============================================================ */
const listeners = new Set();

export function modelAllowed() {
    try { return localStorage.getItem(KEY_MODEL) === 'on'; } catch (e) { return false; }
}

let status = { state: modelAllowed() ? 'idle' : 'off', progress: 0 };

export const getStatus = () => status;
export function onStatus(fn) {
    listeners.add(fn);
    fn(status);
    return () => listeners.delete(fn);
}
function setStatus(next) {
    status = next;
    listeners.forEach((fn) => fn(status));
}

let modelPromise = null;
let worker = null;
let nextId = 1;
const pending = new Map();   // richieste in attesa di risposta dal worker

function rejectPending(reason) {
    pending.forEach(({ reject }) => reject(new Error(reason)));
    pending.clear();
}

export function loadModel() {
    if (modelPromise) return modelPromise;
    if (!modelAllowed()) return Promise.reject(new Error('modello non attivo'));

    const t0 = performance.now();
    setStatus({ state: 'loading', progress: 0 });
    const current = new Worker(new URL('./nlp-worker.js', import.meta.url), { type: 'module' });
    worker = current;

    modelPromise = new Promise((resolve, reject) => {
        const fail = (reason) => {
            console.warn('[FocusFlow] modello non disponibile, si usano le regole di base.', reason);
            track('model_load_failed', Math.round(performance.now() - t0), { model: MODEL_ID });
            current.terminate();
            worker = null;
            rejectPending('modello non disponibile');
            setStatus({ state: 'failed', progress: 0 });
            reject(new Error('modello non disponibile'));
        };

        current.addEventListener('error', (e) => fail(e.message));
        current.addEventListener('message', ({ data }) => {
            if (data.type === 'progress') {
                setStatus({ state: 'loading', progress: data.progress });
            } else if (data.type === 'ready') {
                const ms = Math.round(performance.now() - t0);
                console.info(`[FocusFlow][telemetria] modello "${MODEL_ID}" pronto in ${ms} ms (${data.device})`);
                track('model_load_ms', ms, {
                    model: MODEL_ID,
                    device: data.device,
                    device_memory_gb: navigator.deviceMemory ?? null
                });
                setStatus({ state: 'ready', progress: 100 });
                resolve();
            } else if (data.type === 'failed') {
                fail(data.error);
            } else if (data.type === 'result' || data.type === 'error') {
                const request = pending.get(data.id);
                if (!request) return;
                pending.delete(data.id);
                if (data.type === 'result') request.resolve(data.text);
                else request.reject(new Error(data.error));
            }
        });
    });

    current.postMessage({ type: 'load', url: TRANSFORMERS_URL, model: MODEL_ID, dtype: MODEL_DTYPE });
    modelPromise.catch(() => {}); // il fallimento è già gestito: evita l'avviso "unhandled rejection"
    return modelPromise;
}

/* Scelta dell'utente: attiva il modello e avvia il download */
export function enableModel() {
    try { localStorage.setItem(KEY_MODEL, 'on'); } catch (e) { /* vale solo per questa pagina */ }
    if (status.state === 'failed') modelPromise = null;
    return loadModel().catch(() => {});
}

/* Scelta dell'utente: interrompe il download e libera lo spazio occupato */
export async function disableModel() {
    try { localStorage.removeItem(KEY_MODEL); } catch (e) { /* ignora */ }
    if (worker) worker.terminate();
    worker = null;
    modelPromise = null;
    rejectPending('modello disattivato');
    setStatus({ state: 'off', progress: 0 });
    try { await caches.delete(MODEL_CACHE); } catch (e) { /* cache non disponibile */ }
}

function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('tempo scaduto')), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/* Allo scadere del tempo la richiesta esce dalla coda del worker, così non rallenta le successive */
async function generate(system, user, maxTokens, ms) {
    let id = null;
    let expired = false;
    const run = (async () => {
        await loadModel();
        if (expired) throw new Error('tempo scaduto');
        id = nextId++;
        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            worker.postMessage({
                type: 'generate',
                id,
                maxTokens,
                messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
            });
        });
    })();
    run.catch(() => {});
    try {
        return await withTimeout(run, ms);
    } catch (err) {
        expired = true;
        if (id !== null) {
            pending.delete(id);
            worker?.postMessage({ type: 'cancel', id });
        }
        throw err;
    }
}

/* Estrae un elenco di stringhe da una risposta che dovrebbe essere un array JSON */
function parseList(raw) {
    const match = String(raw || '').match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
        const parsed = JSON.parse(match[0]);
        if (!Array.isArray(parsed)) return [];
        const seen = new Set();
        return parsed
            .filter((x) => typeof x === 'string')
            .map((x) => x.replace(/\s+/g, ' ').trim())
            .filter((x) => x.length > 0 && x.length <= 120 && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
    } catch (e) {
        return [];
    }
}

/* Il modello piccolo può inventare: ogni frase deve poggiare sul testo originale */
function faithful(segment, text) {
    const words = segment.toLowerCase().match(/\p{L}{4,}/gu) || [];
    if (words.length === 0) return true;
    const source = text.toLowerCase();
    const hits = words.filter((w) => source.includes(w.slice(0, 4))).length;
    return hits / words.length >= 0.6;
}

/* ============================================================
   1. Segmentazione
   ============================================================ */
const SEGMENT_PROMPT =
    "Scomponi il testo dell'utente nelle singole attività distinte che contiene. " +
    'Rispondi SOLO con un array JSON di stringhe in italiano, una per attività, senza altro testo. ' +
    "Se il testo descrive una sola attività, restituisci un array con un solo elemento. " +
    'Non inventare nulla che non sia nel testo.';

/* Nomi comuni che sembrano verbi all'infinito */
const NOT_VERBS = 'pere|more|mare|sere|cere|fiere|lire|zanzare|chitarre|bandiere|tastiere|barriere';

const BOUNDARY = new RegExp(
    '\\s*(?:[.;!?]|,|(?<!\\p{L})(?:e poi|e|ed|poi|inoltre)(?!\\p{L}))\\s+' +
    '(?=(?:devo|dovrei|vorrei|voglio|bisogna|ricordati|ricordarmi|ricordami|poi|anche)(?!\\p{L})|' +
    `(?!(?:${NOT_VERBS})(?!\\p{L}))` +
    '\\p{L}+(?:are|ere|ire|arre|orre|urre)(?:mi|ti|lo|la|li|le|ci|si|ne)?(?!\\p{L}))',
    'giu'
);

/* Divide solo dove inizia una nuova azione: "frutta e verdura" resta intero,
   "finire la relazione e chiamare il relatore" si divide. */
export function segmentHeuristic(text) {
    const parts = text.split(BOUNDARY).map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts : [text.trim()];
}

const wordCount = (s) => (s.match(/\p{L}+/gu) || []).length;

let lastSegmentSource = 'regole';

export async function segment(text) {
    lastSegmentSource = 'regole';
    const clean = text.replace(/\s+/g, ' ').trim();
    const heuristic = segmentHeuristic(clean);

    // Frase breve con una sola azione: il modello non serve (e non si scarica)
    if (heuristic.length <= 1 && wordCount(clean) < 12) return heuristic;

    if (!modelAllowed()) return heuristic;   // il download parte solo con il consenso dell'utente

    loadModel().catch(() => {}); // parte o prosegue in background
    const wait = status.state === 'ready' ? limits.readyMs : limits.loadingMs;
    try {
        const list = parseList(await generate(SEGMENT_PROMPT, clean, 200, wait));
        const grounded = list.filter((s) => faithful(s, clean));
        if (grounded.length > 0 && grounded.length === list.length && list.length <= 8) {
            lastSegmentSource = 'modello';
            return list;
        }
    } catch (err) {
        console.info(`[FocusFlow] segmentazione con regole di base (${err.message})`);
    }
    return heuristic;
}

/* ============================================================
   2. Data — chrono-node + regole di ripiego
   ============================================================ */
let chronoPromise = null;
function getChrono() {
    if (!chronoPromise) {
        chronoPromise = import(CHRONO_URL).catch((err) => {
            console.warn('[FocusFlow] chrono-node non caricato, si usano le regole di data di base.', err);
            return null;
        });
    }
    return chronoPromise;
}
export function __setChronoForTests(chrono) { chronoPromise = Promise.resolve(chrono); }

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NUM_WORDS = { un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10 };
const WEEKDAYS = { domenica: 0, lunedì: 1, lunedi: 1, martedì: 2, martedi: 2, mercoledì: 3, mercoledi: 3,
                   giovedì: 4, giovedi: 4, venerdì: 5, venerdi: 5, sabato: 6 };
const L = '(?<!\\p{L})';
const R = '(?!\\p{L})';

function nextWeekdayISO(target) {
    const d = new Date();
    d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7 || 7));
    return toISO(d);
}

function fallbackDate(text) {
    const today = todayISO();
    const num = (w) => NUM_WORDS[w.toLowerCase()] ?? parseInt(w, 10);
    const rules = [
        [new RegExp(`${L}dopodomani${R}`, 'iu'), () => addDaysISO(today, 2)],
        [new RegExp(`${L}domani${R}`, 'iu'), () => addDaysISO(today, 1)],
        [new RegExp(`${L}oggi${R}`, 'iu'), () => today],
        [new RegExp(`${L}tra\\s+(\\d+|${Object.keys(NUM_WORDS).join('|')})\\s+giorn[oi]${R}`, 'iu'), (m) => addDaysISO(today, num(m[1]))],
        [new RegExp(`${L}tra\\s+(\\d+|${Object.keys(NUM_WORDS).join('|')})\\s+settiman[ae]${R}`, 'iu'), (m) => addDaysISO(today, num(m[1]) * 7)],
        [new RegExp(`${L}(?:la\\s+)?prossima\\s+settimana${R}`, 'iu'), () => addDaysISO(today, 7)],
        [new RegExp(`${L}(?:il\\s+)?prossimo\\s+mese${R}`, 'iu'), () => { const d = new Date(); d.setMonth(d.getMonth() + 1); return toISO(d); }],
        [new RegExp(`${L}(?:nel\\s+)?(?:weekend|fine\\s+settimana)${R}`, 'iu'), () => nextWeekdayISO(6)],
        [new RegExp(`${L}(${Object.keys(WEEKDAYS).join('|')})${R}`, 'iu'), (m) => nextWeekdayISO(WEEKDAYS[m[1].toLowerCase()])]
    ];
    for (const [re, toDate] of rules) {
        const m = text.match(re);
        if (m) return { iso: toDate(m), matched: [m[0]] };
    }
    return { iso: null, matched: [] };
}

export function extractDate(text, chrono) {
    if (chrono && chrono.it) {
        const results = chrono.it.parse(text, new Date(), { forwardDate: true })
            // "30 pagine", "2 litri": un numero da solo non è una data
            .filter((r) => !/^\s*\d+\s*$/.test(r.text) && /\p{L}|[/.-]/u.test(r.text));
        if (results.length > 0) {
            return { iso: toISO(results[0].start.date()), matched: results.map((r) => r.text) };
        }
    }
    return fallbackDate(text);
}

/* ============================================================
   3. Priorità
   ============================================================ */
const HIGH = `${L}(?:urgente|urgentissimo|subito|asap|importante|fondamentale|critico|il prima possibile|priorità alta)${R}`;
const LOW = `${L}(?:non (?:è |e )?(?:urgente|importante)|con calma|quando ho tempo|se possibile|eventualmente|prima o poi|nessuna fretta|priorità bassa)${R}`;

export function classifyPriority(text) {
    if (new RegExp(LOW, 'iu').test(text)) return 'bassa';
    if (new RegExp(HIGH, 'iu').test(text)) return 'alta';
    return 'media';
}

/* ============================================================
   Titolo pulito: senza data, parole di priorità e formule come "devo"
   ============================================================ */
const PRIORITY_WORDS = new RegExp(`${L}(?:non (?:è |e )?(?:urgente|importante)|urgentissimo|urgente|subito|asap|importante|fondamentale|critico|il prima possibile|priorità alta|priorità bassa|con calma|quando ho tempo|se possibile|prima o poi)${R}`, 'giu');
const LEADING = /^(?:(?:devo ancora|devo|dovrei|dovrò|vorrei|voglio|bisogna|bisognerebbe|ricordati di|ricordarmi di|ricordami di|non dimenticare di|e poi|poi|prima|dopo|inoltre|anche|e|ed)\s+)+/iu;
const TRAILING = /(?:\s+(?:entro|per|il|lo|la|l'|di|a|alle|alla|nel|in|da|e|ed|tra|fra|su))+[\s,.;:!?-]*$/iu;

function cleanTitle(segment, matchedDates) {
    let t = segment;
    for (const m of matchedDates) t = t.replace(new RegExp(escapeRe(m), 'i'), ' ');
    t = t.replace(PRIORITY_WORDS, ' ').replace(/\s+/g, ' ').trim();
    t = t.replace(LEADING, '').replace(TRAILING, '').replace(/^[\s,.;:!?-]+|[\s,.;:!?-]+$/g, '');
    if (!t) t = segment.trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
}

/* ============================================================
   Analisi completa
   ============================================================ */
export async function analyze(text) {
    const t0 = performance.now();
    const segments = await segment(text);
    const chrono = await getChrono();
    track('nlp_analyze_ms', Math.round(performance.now() - t0), { source: lastSegmentSource, segments: segments.length });

    // "Domani X e Y": la data vale anche per i task seguenti.
    // "Urgente: X e Y": la priorità in apertura vale per tutti, quella detta a metà solo per il suo task.
    const opening = new RegExp(`^\\s*(?:${LOW}|${HIGH})`, 'iu');
    const sharedPriority = opening.test(segments[0]) ? classifyPriority(segments[0]) : null;
    let lastDate = null;

    return segments.map((seg) => {
        const { iso, matched } = extractDate(seg, chrono);
        if (iso) lastDate = iso;
        return {
            title: cleanTitle(seg, matched),
            priority: sharedPriority || classifyPriority(seg),
            date: lastDate || todayISO(),
            subtasks: []
        };
    }).filter((d) => d.title);
}

/* ============================================================
   Sotto-attività
   ============================================================ */
const BREAKDOWN_PROMPT =
    "Scomponi l'attività in 3-4 sotto-attività concrete e operative, in italiano, in ordine di esecuzione. " +
    'Rispondi SOLO con un array JSON di stringhe, senza altro testo.';

function breakdownTemplate(title) {
    const t = title.charAt(0).toLowerCase() + title.slice(1);
    return [`Preparare quello che serve per: ${t}`, `Svolgere: ${t}`, 'Controllare il risultato'];
}

/* Restituisce { items, source }: 'modello' oppure 'base' se il modello non era pronto */
export async function breakdown(title) {
    if (!modelAllowed()) return { items: breakdownTemplate(title), source: 'base' };
    try {
        const wait = status.state === 'ready' ? limits.readyMs : limits.breakdownWaitMs;
        const items = parseList(await generate(BREAKDOWN_PROMPT, title, 150, wait)).slice(0, 5);
        if (items.length >= 2) return { items, source: 'modello' };
    } catch (err) {
        console.info(`[FocusFlow] sotto-attività con modello di base (${err.message})`);
    }
    return { items: breakdownTemplate(title), source: 'base' };
}

