import * as FF from '../app.js';

window.FF = FF; // per prove dalla console: FF.session.logout(), FF.resetDemo()
await FF.boot('oggi');

const today = FF.todayISO();
const pendingEl = document.getElementById('pending');
const doneEl = document.getElementById('done');
const doneLabel = document.getElementById('done-label');

const card = (t) => FF.taskCardHTML(t);

function remainingText(n) {
    if (n === 0) return 'Nessun task rimasto';
    return n === 1 ? '1 task rimanente' : `${n} task rimanenti`;
}

function render() {
    const tasks = FF.dueOn(today);
    const pending = tasks.filter((t) => !t.done);
    const done = tasks.filter((t) => t.done);

    document.getElementById('date').textContent = FF.longDate(today);
    document.getElementById('remaining').textContent = remainingText(pending.length);

    if (tasks.length === 0) {
        pendingEl.innerHTML = `<div class="ff-empty"><strong>Giornata libera</strong>Tocca + per aggiungere il primo task.</div>`;
    } else if (pending.length === 0) {
        pendingEl.innerHTML = `<div class="ff-empty"><strong>Tutto fatto</strong>Hai completato i task di oggi.</div>`;
    } else {
        pendingEl.innerHTML = pending.map(card).join('');
    }

    doneEl.innerHTML = done.map(card).join('');
    doneLabel.hidden = done.length === 0;
}

FF.wireTaskList(pendingEl);
FF.wireTaskList(doneEl);
window.addEventListener('ff:change', render);
render();
