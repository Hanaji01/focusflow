import * as FF from '../app.js';

window.FF = FF;
await FF.boot('giardino');

const W = 360;          // larghezza della scena
const PER_ROW = 9;      // fiori per fascia d'erba
const ROW_H = 140;      // altezza di una fascia con i suoi fiori
const STRIP_TOP = 108;  // y della fascia d'erba dentro la riga
const STRIP_H = 30;

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

function strip(row) {
    const top = row * ROW_H + STRIP_TOP;
    const blades = Array.from({ length: 28 }, (_, i) => {
        const bx = 6 + i * (W - 12) / 27 + (hash('b' + row + i) - 0.5) * 4;
        const bh = 7 + hash('h' + row + i) * 14;
        return `<ellipse cx="${bx.toFixed(1)}" cy="${(top + STRIP_H - bh / 2 - 2).toFixed(1)}" rx="2" ry="${(bh / 2).toFixed(1)}"/>`;
    }).join('');
    return `<rect x="0" y="${top}" width="${W}" height="${STRIP_H}" fill="#D7DDCC"/>
            <g fill="#ACC095">${blades}</g>`;
}

function scene(days) {
    const rows = Math.max(1, Math.ceil(days.length / PER_ROW));
    const H = rows * ROW_H;
    const spacing = (W - 40) / PER_ROW;

    let strips = '';
    let flowers = '';
    for (let r = 0; r < rows; r++) {
        strips += strip(r);
        const group = days.slice(r * PER_ROW, (r + 1) * PER_ROW);
        group.forEach((day, i) => {
            const x = W / 2 + (i - (group.length - 1) / 2) * spacing;
            const y = r * ROW_H + STRIP_TOP + 4;
            flowers += drawFlower(Math.round(x * 10) / 10, y, 34 + hash(day.date) * 44, day.tasks.length);
        });
    }

    const label = days.length === 0 ? 'Giardino vuoto'
        : `Giardino con ${days.length} ${days.length === 1 ? 'fiore' : 'fiori'}`;
    // le fasce vengono disegnate prima dei fiori: gli steli restano davanti all'erba
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${strips}${flowers}</svg>`;
}

function render() {
    const tasks = FF.getTasks();
    const done = tasks.filter((t) => t.done);
    const days = FF.flowers();

    document.getElementById('n-flowers').textContent = days.length;
    document.getElementById('n-done').textContent = done.length;
    document.getElementById('n-total').textContent = tasks.length;
    document.getElementById('meadow').innerHTML = scene(days);
    document.getElementById('note').hidden = days.length > 0;
}

window.addEventListener('ff:change', render);
render();
