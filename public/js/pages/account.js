import * as FF from '../app.js';

const passwordForm = document.getElementById('password-form');
const deleteForm = document.getElementById('delete-form');
const passwordError = document.getElementById('password-error');
const deleteError = document.getElementById('delete-error');

passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const current = document.getElementById('current').value;
    const next = document.getElementById('next').value;
    passwordError.textContent = '';
    if (next !== document.getElementById('repeat').value) {
        passwordError.textContent = 'Le due password nuove non coincidono.';
        return;
    }
    const button = passwordForm.querySelector('button');
    button.disabled = true;
    try {
        await FF.auth.changePassword(current, next);
        passwordForm.reset();
        FF.toast('Password cambiata. Le altre sessioni sono state chiuse.');
    } catch (err) {
        passwordError.textContent = err.message;
    } finally {
        button.disabled = false;
    }
});

deleteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    deleteError.textContent = '';
    if (!confirm('Eliminare davvero l\'account e tutti i dati?')) return;
    const button = deleteForm.querySelector('button');
    button.disabled = true;
    try {
        await FF.auth.deleteAccount(document.getElementById('delete-password').value);
        location.replace(FF.LOGIN_PAGE);
    } catch (err) {
        deleteError.textContent = err.message;
        button.disabled = false;
    }
});

await FF.boot('giardino');

document.getElementById('who').textContent = FF.session.user();
const real = FF.getMode() === 'api';
document.getElementById('panels').hidden = !real;
document.getElementById('demo').hidden = real;
