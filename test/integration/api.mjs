import { pool } from '../../server/database/db.js';

const API = (process.env.API_URL || 'http://localhost:3000') + '/api';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${name} ${cond ? '' : extra}`); };

async function call(method, path, body, token) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}
const p = (n) => String(n).padStart(2, '0');
const iso = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const today = iso();
const stamp = Date.now().toString(36);

// --- account
ok('health', (await call('GET', '/health')).data?.ok === true);
const pw = 'prova-' + stamp;
const a = await call('POST', '/auth/register', { username: 'a_' + stamp, password: pw });
const b = await call('POST', '/auth/register', { username: 'b_' + stamp, password: pw });
ok('registrazione', a.status === 201 && b.status === 201, JSON.stringify(a));
const T = a.data.token, T2 = b.data.token;
ok('login corretto', (await call('POST', '/auth/login', { username: 'a_' + stamp, password: pw })).status === 200);
ok('login errato 401', (await call('POST', '/auth/login', { username: 'a_' + stamp, password: 'sbagliata1' })).status === 401);
ok('senza token 401', (await call('GET', '/tasks')).status === 401);

// --- tetto
const D = iso(20), D2 = iso(21), D3 = iso(22);
const mk = (title, date, extra = {}) => call('POST', '/tasks', { title, date, created: today, ...extra }, T);
const ids = [];
for (let i = 0; i < 8; i++) ids.push((await mk('T' + i, D)).data.id);
ok('8 task accettati', ids.every(Boolean));
const ninth = await mk('Nono', D);
ok('nono rifiutato 409', ninth.status === 409, JSON.stringify(ninth));
console.log('     messaggio:', ninth.data?.error);

const par = await Promise.all(Array.from({ length: 12 }, (_, i) => mk('P' + i, D2)));
const created = par.filter((r) => r.status === 201).length, refused = par.filter((r) => r.status === 409).length;
ok('12 simultanei: 8 creati, 4 rifiutati', created === 8 && refused === 4, `creati ${created}, rifiutati ${refused}, stati ${par.map((r) => r.status)}`);

const other = (await mk('Altro', D3)).data;
const mv = await call('PATCH', `/tasks/${other.id}`, { date: D }, T);
ok('spostamento su giorno pieno 409', mv.status === 409, JSON.stringify(mv));
ok('data invariata', (await call('GET', '/tasks', undefined, T)).data.find((t) => t.id === other.id).date === D3);

const bx = await call('POST', '/tasks', { title: 'Altro utente', date: D, created: today }, T2);
ok('il tetto è per utente', bx.status === 201, JSON.stringify(bx));

// --- modifica ed eliminazione
const ed = await call('PATCH', `/tasks/${other.id}`, { title: 'Nuovo titolo', priority: 'alta' }, T);
const D4 = iso(23);
ok('cambio data', (await call('PATCH', `/tasks/${other.id}`, { date: D4 }, T)).data.date === D4);
const [hist] = await pool.query('SELECT action, from_date, to_date FROM task_reschedules WHERE task_id = ?', [other.id]);
ok('storico spostamento', hist.length === 1 && hist[0].action === 'postponed' && hist[0].to_date === D4, JSON.stringify(hist));
ok('altro utente non modifica (404)', (await call('PATCH', `/tasks/${other.id}`, { title: 'x' }, T2)).status === 404);
ok('altro utente non elimina (404)', (await call('DELETE', `/tasks/${other.id}`, undefined, T2)).status === 404);
ok('eliminazione 204', (await call('DELETE', `/tasks/${ids[0]}`, undefined, T)).status === 204);
ok('posto liberato', (await mk('Rientra', D)).status === 201);
ok('task eliminato sparito', !(await call('GET', '/tasks', undefined, T)).data.some((t) => t.id === ids[0]));

// --- fiori (utente pulito per oggi)
const sync = (body) => call('PUT', `/flowers/${today}/sync`, body, T);
const far = (await mk('Scadenza lontana', iso(10))).data;
const ev1 = (await mk('Evento 1', today)).data;
const ev2 = (await mk('Evento 2', today)).data;
let f = (await sync()).data;
ok('scadenza lontana non pesa', f.petalsTotal === 2 && f.petalsCompleted === 0, JSON.stringify(f));
await call('PATCH', `/tasks/${ev1.id}`, { done: true, doneOn: today }, T);
f = (await sync()).data;
ok('1 petalo su 2', f.petalsCompleted === 1 && f.petalsTotal === 2 && !f.justDelivered, JSON.stringify(f));
await call('PATCH', `/tasks/${ev2.id}`, { done: true, doneOn: today }, T);
f = (await sync()).data;
ok('fiore completo: gattino consegna', f.petalsCompleted === 2 && f.justDelivered === true, JSON.stringify(f));
f = (await sync()).data;
ok('consegna una volta sola', f.delivered === true && f.justDelivered === false, JSON.stringify(f));
await call('PATCH', `/tasks/${far.id}`, { done: true, doneOn: today }, T);
f = (await sync()).data;
ok('scadenza anticipata: petalo e bonus', f.petalsCompleted === 3 && f.bonusPetals === 1, JSON.stringify(f));
await call('PATCH', `/tasks/${ev2.id}`, { done: false }, T);
f = (await sync()).data;
ok('togliere la spunta toglie il petalo', f.petalsCompleted === 2, JSON.stringify(f));
const list = (await call('GET', `/flowers?from=${today}&to=${today}`, undefined, T)).data;
ok('lettura fiori', list.length === 1 && list[0].petalsCompleted === 2, JSON.stringify(list));
ok('giornata chiusa 409', (await call('PUT', `/flowers/${iso(-5)}/sync`, {}, T)).status === 409);
ok('giorno futuro 400', (await call('PUT', `/flowers/${iso(5)}/sync`, {}, T)).status === 400);

// Modifica delle sotto-attività
const st = (await mk('Con sotto-attività', iso(9), { subtasks: ['Uno', 'Due', 'Tre'] })).data;
const [s1, s2, s3] = st.subtasks;
await call('PATCH', `/subtasks/${s1.id}`, { done: true }, T);
let edited = await call('PATCH', `/tasks/${st.id}`, { subtasks: [{ id: s3.id, title: 'Tre rinominata' }, { id: s1.id, title: 'Uno' }, { title: 'Nuova' }] }, T);
ok('sotto-attività rinominate, riordinate, tolte e aggiunte',
  edited.status === 200 && edited.data.subtasks.map((s) => s.title).join() === 'Tre rinominata,Uno,Nuova', JSON.stringify(edited));
ok('la spunta resta dopo la modifica', edited.data.subtasks[1].done === true && edited.data.subtasks[2].done === false);
ok('sotto-attività tolta sparita', !edited.data.subtasks.some((s) => s.id === s2.id));
const foreign = (await call('POST', '/tasks', { title: 'Altrui', date: iso(9), created: today, subtasks: ['Sua'] }, T2)).data;
ok('sotto-attività di un altro task rifiutata',
  (await call('PATCH', `/tasks/${st.id}`, { subtasks: [{ id: foreign.subtasks[0].id, title: 'Rubata' }] }, T)).status === 400);
ok('task di un altro utente 404', (await call('PATCH', `/tasks/${foreign.id}`, { subtasks: [] }, T)).status === 404);
ok('titolo vuoto rifiutato', (await call('PATCH', `/tasks/${st.id}`, { subtasks: [{ title: '   ' }] }, T)).status === 400);
ok('duplicato rifiutato', (await call('PATCH', `/tasks/${st.id}`, { subtasks: [{ id: s1.id, title: 'A' }, { id: s1.id, title: 'B' }] }, T)).status === 400);
ok('elenco vuoto toglie tutte', (await call('PATCH', `/tasks/${st.id}`, { subtasks: [] }, T)).data.subtasks.length === 0);

console.log(`\n${pass} superate, ${fail} fallite`);
await pool.end();
process.exit(fail ? 1 : 0);
