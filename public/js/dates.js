/* FocusFlow — date sempre in ora locale, formato YYYY-MM-DD */

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
/* Aggiunge i giorni passati con task previsti ma nessuno completato (tasks vuoto).
   I giorni liberi restano senza fiore; un task finito in anticipo non conta come mancato. */
export function addBareDays(days, tasks, today) {
    const known = new Set(days.map((d) => d.date));
    const missed = tasks.filter((t) => t.date < today && !known.has(t.date) && (!t.done || t.doneOn > t.date));
    const bare = [...new Set(missed.map((t) => t.date))].map((date) => ({ date, tasks: [] }));
    return [...days, ...bare].sort((a, b) => a.date.localeCompare(b.date));
}

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
