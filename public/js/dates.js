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
