import crypto from 'node:crypto';
const BASE = process.env.API_URL || 'http://localhost:3000';
const API = BASE + '/api';
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
const stamp = Date.now().toString(36);
const pw = () => 'prova-' + crypto.randomUUID();

// header
const page = await fetch(BASE + '/pages/oggi.html');
const csp = page.headers.get('content-security-policy') || '';
ok('CSP presente', csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'none'"));
ok('script inline assenti dalla CSP', !/script-src[^;]*'unsafe-inline'/.test(csp));
ok('nessuno script inline nelle pagine', !/<script(?![^>]*src=)/.test(await page.text()));

// token e password
const p1 = pw(), p2 = pw(), name = 'sec_' + stamp;
const reg = await call('POST', '/auth/register', { username: name, password: p1 });
let T = reg.data.token;
ok('token funziona', (await call('GET', '/auth/me', undefined, T)).status === 200);
const secondo = (await call('POST', '/auth/login', { username: name, password: p1 })).data.token;

const wrong = await call('POST', '/auth/password', { current: 'sbagliata-1', next: p2 }, T);
ok('password attuale errata: 403, sessione viva', wrong.status === 403 && (await call('GET', '/auth/me', undefined, T)).status === 200, JSON.stringify(wrong));
ok('nuova password corta 400', (await call('POST', '/auth/password', { current: p1, next: 'corta' }, T)).status === 400);
const ch = await call('POST', '/auth/password', { current: p1, next: p2 }, T);
ok('cambio password', ch.status === 200 && !!ch.data.token, JSON.stringify(ch));
ok('vecchio token invalidato', (await call('GET', '/auth/me', undefined, T)).status === 401);
ok('altra sessione invalidata', (await call('GET', '/tasks', undefined, secondo)).status === 401);
T = ch.data.token;
ok('nuovo token valido', (await call('GET', '/auth/me', undefined, T)).status === 200);
ok('vecchia password rifiutata', (await call('POST', '/auth/login', { username: name, password: p1 })).status === 401);
ok('nuova password accettata', (await call('POST', '/auth/login', { username: name, password: p2 })).status === 200);

// eliminazione
await call('POST', '/tasks', { title: 'Da cancellare', date: '2030-01-01' }, T);
ok('eliminazione con password errata 403', (await call('DELETE', '/auth/account', { password: 'sbagliata-1' }, T)).status === 403);
ok('eliminazione account 204', (await call('DELETE', '/auth/account', { password: p2 }, T)).status === 204);
ok('token di account eliminato 401', (await call('GET', '/tasks', undefined, T)).status === 401);
ok('login dopo eliminazione 401', (await call('POST', '/auth/login', { username: name, password: p2 })).status === 401);

// limiti
let st = 0;
for (let i = 0; i < 10; i++) st = (await call('POST', '/auth/login', { username: 'ignoto_' + stamp, password: 'x'.repeat(9) })).status;
ok('10 errori consentiti', st === 401);
ok('11esimo bloccato 429', (await call('POST', '/auth/login', { username: 'ignoto_' + stamp, password: 'x'.repeat(9) })).status === 429);
ok('nome lunghissimo non rompe', [401, 429].includes((await call('POST', '/auth/login', { username: 'a'.repeat(5000), password: 'x'.repeat(9) })).status));
let ipBlocked = 0;
for (let i = 0; i < 45; i++) ipBlocked = (await call('POST', '/auth/login', { username: `u${i}_${stamp}`, password: 'x'.repeat(9) })).status;
ok('molti utenti dallo stesso IP: 429', ipBlocked === 429, String(ipBlocked));
let rs = 0;
for (let i = 0; i < 12; i++) rs = (await call('POST', '/auth/register', { username: 'x', password: 'y' })).status;
ok('registrazioni a raffica: 429', rs === 429, String(rs));

console.log(`\n${pass} superate, ${fail} fallite`);
process.exit(fail ? 1 : 0);
