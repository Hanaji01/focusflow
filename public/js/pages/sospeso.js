import * as FF from '../app.js';

window.FF = FF;
await FF.boot('sospeso');

const today = FF.todayISO();
const listEl = document.getElementById('list');
const picker = document.getElementById('picker');
picker.min = today;
let movingId = null;

const GROUPS = [['alta', 'Priorità alta'], ['media', 'Priorità media'], ['bassa', 'Priorità bassa']];

function card(t) {
    return `
      <article class="task" data-p="${t.priority}" data-id="${t.id}">
        <button class="task-check" type="button" data-check="${t.id}" aria-label="Segna come completato">${FF.ICONS.check}</button>
        <div class="task-body">
          <div class="task-title">${FF.esc(t.title)}</div>
          <div class="task-meta">
            <span>Scaduto: ${FF.shortDate(t.date)}</span>
          </div>
          <div class="task-actions">
            <button type="button" data-other="${t.id}">Altro giorno</button>
            <button type="button" data-edit="${t.id}">Modifica</button>
            <button type="button" class="danger" data-delete="${t.id}">Elimina</button>
          </div>
        </div>
        <div class="task-side"><button class="link-btn" type="button" data-today="${t.id}">Oggi →</button></div>
      </article>`;
}

function render() {
    const tasks = FF.overdue(today).sort((a, b) => a.date.localeCompare(b.date));
    document.getElementById('count').textContent =
        tasks.length === 1 ? '1 task in attesa' : `${tasks.length} task in attesa`;

    if (tasks.length === 0) {
        listEl.innerHTML = `<div class="ff-empty"><strong>Niente in sospeso</strong>I task non completati dei giorni passati compariranno qui.</div>`;
        return;
    }
    listEl.innerHTML = GROUPS
        .map(([p, label]) => {
            const items = tasks.filter((t) => t.priority === p);
            return items.length
                ? `<h2 class="ff-section group" data-p="${p}">${label}</h2>${items.map(card).join('')}`
                : '';
        })
        .join('');
}

listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const { check, today: toToday, other, edit, delete: del } = btn.dataset;
    if (check) FF.toggleTask(check);
    else if (toToday) FF.moveTask(toToday, today);
    else if (edit) FF.openEdit(edit);
    else if (other) {
        movingId = other;
        picker.value = '';
        if (picker.showPicker) picker.showPicker(); else picker.click();
    } else if (del) {
        const task = FF.getTasks().find((t) => t.id === del);
        if (task && confirm(`Eliminare "${task.title}"?`)) FF.removeTask(del);
    }
    // l'elenco è stato ridisegnato: il focus resta dentro la pagina
    if (document.activeElement === document.body) listEl.querySelector('button')?.focus();
});

picker.addEventListener('change', () => {
    if (movingId && picker.value) FF.moveTask(movingId, picker.value);
    movingId = null;
});

window.addEventListener('ff:change', render);
render();
