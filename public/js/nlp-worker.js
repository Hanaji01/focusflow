/* FocusFlow — modello di testo in un thread separato, così l'interfaccia resta fluida.
   Gira sul processore (WASM): su un telefono con 4 GB di RAM WebGPU fa chiudere la pagina. Le richieste vengono eseguite una alla volta.
   Messaggi in ingresso: { type: 'load', url, model, dtype }, { type: 'generate', id, messages, maxTokens }
   e { type: 'cancel', id }, che toglie dalla coda una richiesta scaduta
   Messaggi in uscita:   progress, ready, failed, result, error */

let generator = null;
let queue = Promise.resolve();
const cancelled = new Set();

async function load({ url, model, dtype }) {
    const { pipeline } = await import(url);

    const files = new Map();
    const progress_callback = (p) => {
        if (p.status !== 'progress' || !p.total) return;
        files.set(p.file, { loaded: p.loaded, total: p.total });
        let loaded = 0;
        let total = 0;
        files.forEach((f) => { loaded += f.loaded; total += f.total; });
        self.postMessage({ type: 'progress', progress: Math.min(99, Math.round((loaded / total) * 100)) });
    };

    generator = await pipeline('text-generation', model, { dtype, device: 'wasm', progress_callback });
    return 'wasm';
}

async function handle(msg) {
    if (msg.type === 'load') {
        try {
            self.postMessage({ type: 'ready', device: await load(msg) });
        } catch (err) {
            self.postMessage({ type: 'failed', error: String(err?.message || err) });
        }
    } else if (msg.type === 'generate') {
        await new Promise((resolve) => setTimeout(resolve));   // legge gli annullamenti arrivati durante il calcolo
        if (cancelled.delete(msg.id)) return;
        try {
            const out = await generator(msg.messages, { max_new_tokens: msg.maxTokens, do_sample: false });
            self.postMessage({ type: 'result', id: msg.id, text: out?.[0]?.generated_text?.at(-1)?.content ?? '' });
        } catch (err) {
            self.postMessage({ type: 'error', id: msg.id, error: String(err?.message || err) });
        }
    }
}

self.addEventListener('message', (e) => {
    if (e.data.type === 'cancel') cancelled.add(e.data.id);
    else queue = queue.then(() => handle(e.data));
});
