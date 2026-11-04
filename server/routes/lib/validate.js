export const PRIORITIES = ['alta', 'media', 'bassa'];
export const MAX_TASKS_PER_DAY = 8;   // stesso valore in public/js/app.js: un petalo per task

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

export function isISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;  // scarta 2025-02-30
}

/** Testo obbligatorio, ripulito dagli spazi; errore se vuoto o troppo lungo. */
export function cleanText(value, label, max = 200) {
  if (typeof value !== 'string') throw httpError(400, `${label} non valido`);
  const s = value.replace(/\s+/g, ' ').trim();
  if (!s) throw httpError(400, `${label} mancante`);
  if (s.length > max) throw httpError(400, `${label} troppo lungo (massimo ${max} caratteri)`);
  return s;
}

export function oneOf(value, list, label) {
  if (!list.includes(value)) throw httpError(400, `${label} non valido`);
  return value;
}

export function dateField(value, label) {
  if (!isISODate(value)) throw httpError(400, `${label} non valida (formato AAAA-MM-GG)`);
  return value;
}

export function idParam(value) {
  if (!/^\d{1,18}$/.test(String(value))) throw httpError(400, 'Identificativo non valido');
  return String(value);
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function serverToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
