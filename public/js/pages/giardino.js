import * as FF from '../app.js';

window.FF = FF;
await FF.boot('giardino');

const SPACING = 48;     // distanza tra un fiore e l'altro
const PADDING = 26;     // margine ai lati della striscia
const ROW_H = 140;      // altezza di una striscia con i suoi fiori
const STRIP_TOP = 108;  // y della fascia d'erba dentro la striscia
const STRIP_H = 30;

const meadow = document.getElementById('meadow');

// Generatore deterministico: lo stesso giorno ha sempre lo stesso stelo
function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967295;
}

/* ------------------------------------------------------------
   Disegno del fiore — punto unico da sostituire con la tua grafica.
   (x, y) = base dello stelo; stemH = altezza; petals = numero di petali.
   ------------------------------------------------------------ */
function drawFlower(x, y, stemH, petals) {
    if (FF.ART_READY) {
        const size = 46;
        return `<image href="${FF.flowerArt(petals)}" x="${x - size / 2}" y="${y - size}" width="${size}" height="${size}"/>`;
    }
    const hy = y - stemH;
    return `
      <g>
        <line x1="${x}" y1="${y}" x2="${x}" y2="${hy}" stroke="#90A970" stroke-width="3"/>
        ${FF.flowerHead(x, hy, petals)}
      </g>`;
}

function grass(width, key) {
    const count = Math.round(width / 13);
    const blades = Array.from({ length: count }, (_, i) => {
        const bx = 6 + i * (width - 12) / (count - 1) + (hash('b' + key + i) - 0.5) * 4;
        const bh = 7 + hash('h' + key + i) * 14;
        return `<ellipse cx="${bx.toFixed(1)}" cy="${(STRIP_TOP + STRIP_H - bh / 2 - 2).toFixed(1)}" rx="2" ry="${(bh / 2).toFixed(1)}"/>`;
    }).join('');
    return `<rect x="0" y="${STRIP_TOP}" width="${width}" height="${STRIP_H}" fill="#D7DDCC"/>
            <g fill="#ACC095">${blades}</g>`;
}

/* Una striscia di prato: se i fiori non entrano nello schermo si scorre di lato */
function strip(days, key, label) {
    const content = days.length * SPACING + PADDING * 2;
    const width = Math.max(meadow.clientWidth, content);
    const first = (width - (days.length - 1) * SPACING) / 2;
    const flowers = days.map((day, i) =>
        drawFlower(first + i * SPACING, STRIP_TOP + 4, 34 + hash(day.date) * 44, day.tasks.length)).join('');
    // l'erba viene disegnata prima dei fiori: gli steli restano davanti
    return `<div class="month-strip" tabindex="0" role="img" aria-label="${label}">
              <svg width="${width}" height="${ROW_H}" viewBox="0 0 ${width} ${ROW_H}" aria-hidden="true">${grass(width, key)}${flowers}</svg>
            </div>`;
}

function monthTitle(month) {
    const s = FF.fromISO(`${month}-01`).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/* Un prato per mese, dal più recente; dentro il mese i fiori vanno dal primo all'ultimo giorno */
function scene(days) {
    if (days.length === 0) return strip([], 'vuoto', 'Giardino vuoto');
    const months = new Map();
    for (const day of days) {
        const month = day.date.slice(0, 7);
        if (!months.has(month)) months.set(month, []);
        months.get(month).push(day);
    }
    return [...months].reverse().map(([month, group]) => {
        const count = `${group.length} ${group.length === 1 ? 'fiore' : 'fiori'}`;
        const title = monthTitle(month);
        return `<h2 class="month-title">${title} · ${count}</h2>${strip(group, month, `${title}: ${count}`)}`;
    }).join('');
}

function render() {
    const tasks = FF.getTasks();
    const done = tasks.filter((t) => t.done);
    const days = FF.flowers();

    document.getElementById('n-flowers').textContent = days.length;
    document.getElementById('n-done').textContent = done.length;
    document.getElementById('n-total').textContent = tasks.length;
    meadow.innerHTML = scene(days);
    // ogni prato si apre sui fiori più recenti
    meadow.querySelectorAll('.month-strip').forEach((el) => { el.scrollLeft = el.scrollWidth; });
    document.getElementById('note').hidden = days.length > 0;
}

window.addEventListener('ff:change', render);
window.addEventListener('resize', render);
render();
