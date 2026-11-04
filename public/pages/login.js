import * as FF from '../app.js';

const form = document.getElementById('login-form');
const error = document.getElementById('login-error');
const submit = document.getElementById('submit-btn');
const switcher = document.getElementById('switch-mode');
let registering = false;

function setMode(register) {
    registering = register;
    submit.textContent = register ? 'Crea account' : 'Accedi';
    switcher.textContent = register ? 'Hai già un account? Accedi' : 'Non hai un account? Registrati';
    document.getElementById('password').autocomplete = register ? 'new-password' : 'current-password';
    error.textContent = '';
}
switcher.addEventListener('click', () => setMode(!registering));

// Collegato prima di attendere il server: un invio immediato non deve diventare un invio nativo del form
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('user').value.trim();
    const password = document.getElementById('password').value;
    if (!user || !password) { error.textContent = 'Inserisci utente e password per accedere.'; return; }

    submit.disabled = true;
    error.textContent = '';
    try {
        await FF.init();
        if (registering) await FF.auth.register(user, password);
        else await FF.auth.login(user, password);
        location.href = 'oggi.html';
    } catch (err) {
        error.textContent = err.message;
        submit.disabled = false;
    }
});

await FF.init();
if (FF.session.ok()) location.replace('oggi.html');   // già autenticato

if (FF.getMode() === 'api') switcher.hidden = false;
else document.getElementById('demo-note').hidden = false;
