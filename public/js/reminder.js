/* Promemoria mattutino: una notifica locale ripetuta ogni giorno.
   Esiste solo nell'app Android, dove il plugin di Cordova la programma sul telefono;
   nel browser la sezione resta nascosta. */
const KEY = 'ff_reminder';
const ID = 1;
export const DEFAULT_TIME = '08:30';

const plugin = () => window.cordova?.plugins?.notification?.local ?? null;
const call = (name, ...args) => new Promise((resolve) => plugin()[name](...args, resolve));

export async function reminderAvailable() {
    if (!window.cordova) return false;
    await new Promise((resolve) => document.addEventListener('deviceready', resolve, { once: true }));
    return plugin() !== null;
}

export function reminderSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY));
        if (saved && /^\d\d:\d\d$/.test(saved.time)) return { on: !!saved.on, time: saved.time };
    } catch (e) { /* si usano i valori predefiniti */ }
    return { on: false, time: DEFAULT_TIME };
}

/* Applica la scelta. Restituisce false se l'utente nega il permesso per le notifiche */
export async function saveReminder({ on, time }) {
    await call('cancel', ID);
    if (on && !(await call('hasPermission')) && !(await call('requestPermission'))) {
        on = false;
        localStorage.setItem(KEY, JSON.stringify({ on, time }));
        return false;
    }
    if (on) {
        const [hour, minute] = time.split(':').map(Number);
        plugin().schedule({
            id: ID,
            title: 'Buongiorno!',
            text: 'Cosa vuoi fare oggi? Aggiungi i tuoi task.',
            trigger: { every: { hour, minute } },
            androidAllowWhileIdle: true
        });
    }
    localStorage.setItem(KEY, JSON.stringify({ on, time }));
    return true;
}
