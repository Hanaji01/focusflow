import * as FF from '../app.js';

window.FF = FF;
await FF.boot('calendario');

const today = FF.todayISO();
const start = FF.fromISO(today);
let view = { y: start.getFullYear(), m: start.getMonth() };
let selected = null; // nessun giorno aperto: la pagina parte come nel video

const gridEl = document.getElementById('grid');
const listEl = document.getElementById('day-list');
const DOW = ['Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa', 'Do'];

function monthTitle() {
    const s = new Date(view.y, view.m, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function renderGrid() {
    document.getElementById('month-title').textContent = monthTitle();
    const first = new Date(view.y, view.m, 1);
    const offset = (first.getDay() + 6) % 7; // la settimana parte da lunedì
    const days = new Date(view.y, view.m + 1, 0).getDate();

    let html = DOW.map((d) => `<div class="cal-dow" aria-hidden="true">${d}</div>`).join('');
    html += '<div></div>'.repeat(offset);

    for (let d = 1; d <= days; d++) {
        const iso = FF.toISO(new Date(view.y, view.m, d));
        const due = FF.dueOn(iso);
        const dots = due.slice(0, 3)
            .map((t) => `<i class="${t.done ? 'done' : ''}" data-p="${t.priority}"></i>`).join('');
        html += `<button type="button" class="cal-day" data-iso="${iso}"
                    aria-label="${FF.longDate(iso)}${due.length ? `, ${due.length} task` : ''}" aria-pressed="${iso === selected}"
                    ${iso === today ? 'aria-current="date"' : ''}>
                    <span>${d}</span><span class="dots">${dots}</span></button>`;
    }
    gridEl.innerHTML = html;
    document.getElementById('go-today').hidden = view.y === start.getFullYear() && view.m === start.getMonth();
}

function renderDay() {
    const panel = document.getElementById('day-panel');
    panel.hidden = !selected;
    if (!selected) return;

    const tasks = FF.dueOn(selected);
    const done = tasks.filter((t) => t.done).length;
    document.getElementById('day-title').textContent = FF.longDate(selected);
    document.getElementById('day-sub').textContent = tasks.length === 0
        ? 'Nessun task per questo giorno'
        : `${tasks.length} task, ${done} ${done === 1 ? 'completato' : 'completati'}`;
    // i giorni passati sono chiusi: oggi e i giorni futuri si possono completare
    listEl.innerHTML = tasks.map((t) => FF.taskCardHTML(t, { readOnly: selected < today })).join('');
}

function render() { renderGrid(); renderDay(); }

function shiftMonth(delta) {
    const d = new Date(view.y, view.m + delta, 1);
    view = { y: d.getFullYear(), m: d.getMonth() };
    renderGrid();
}

gridEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-iso]');
    if (!btn) return;
    const iso = btn.dataset.iso;
    selected = selected === iso ? null : iso; // secondo tocco: chiude
    render();
    gridEl.querySelector(`[data-iso="${iso}"]`).focus();   // la griglia è stata ridisegnata
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (selected) document.getElementById('day-panel').scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'nearest' });
});
document.getElementById('prev').addEventListener('click', () => shiftMonth(-1));
document.getElementById('next').addEventListener('click', () => shiftMonth(1));
document.getElementById('go-today').addEventListener('click', () => {
    view = { y: start.getFullYear(), m: start.getMonth() };
    renderGrid();
});

FF.wireTaskList(listEl);
window.addEventListener('ff:change', render);
render();
