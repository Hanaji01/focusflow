# FocusFlow AI

Frontend (cartella `public/`) + backend Node/Express/MySQL (cartella `server/`).

## Struttura
```
progetto/
├── public/
│   ├── index.html      pagina di accesso
│   ├── pages/          pagine dell'app
│   ├── css/
│   ├── js/             logica, con js/pages/ per gli script delle pagine
│   └── assets/         disegni
├── server/
│   ├── server.js
│   ├── routes/         API, con routes/lib/ per le funzioni condivise
│   └── database/       connessione, schema e script di gestione
├── test/
├── package.json
└── README.md
```

## Avvio

1. Serve Node 20+ e un database MySQL 8 o MariaDB 10.5+.
2. Crea database e utente (da client MySQL, come amministratore):
   ```sql
   CREATE DATABASE focusflow CHARACTER SET utf8mb4;
   CREATE USER 'focusflow'@'localhost' IDENTIFIED BY 'una-password-robusta';
   GRANT ALL ON focusflow.* TO 'focusflow'@'localhost';
   ```
3. Nella cartella principale del progetto:
   ```
   npm install
   copy .env.example .env      (Windows)   |   cp .env.example .env   (Linux/macOS)
   ```
   Apri `.env` e imposta `DB_PASSWORD` e `JWT_SECRET` (almeno 32 caratteri casuali, vedi il comando nel file).
4. Crea le tabelle e avvia:
   ```
   npm run db:init
   npm start
   ```
5. Apri http://localhost:3000 — dalla pagina di accesso puoi registrarti.

Per creare un utente da terminale: `npm run user:create -- nome password` (con `ALLOW_REGISTER=false` la registrazione dal sito è chiusa).
Per cambiare una password dimenticata: `npm run user:password -- nome` (la nuova password si scrive al prompt).

## Senza server (modalità demo)
Se il server non risponde, il frontend funziona con dati d'esempio nel browser:
dalla cartella `public/` lancia `py -m http.server 8080` e apri http://localhost:8080.

## Test
Dalla cartella principale, senza server né database: `npm test`.
Con il server acceso e MySQL attivo: `npm run test:api` e `npm run test:security` (variabile `API_URL`, predefinita `http://localhost:3000`). Le prove di sicurezza vanno lanciate su un server appena avviato: fanno scattare i limiti ai tentativi.

## App Android
Conversione con Cordova, in una cartella separata: `public/` resta la web app di riferimento.
L'indirizzo del server è in `public/js/config.js`; l'app vi scrive il proprio e il server deve avere `CORS_ORIGIN=https://localhost`.
L'APK per il download dal sito è in `public/download/`: va ricompilato e sostituito quando cambia la web app.
Il promemoria mattutino in Account (`public/js/reminder.js`) compare solo nell'app e usa il plugin `cordova-plugin-local-notification`.

## Disegni
Fiori e gattino sono in `public/assets/`: `fiore-0.png` ... `fiore-8.png` (il numero indica i petali colorati; il fiore bianco segna i giorni passati con task previsti e nessuno completato) e `gattino.png`.
Hanno lo sfondo trasparente e il fiore si sovrappone esattamente a quello in mano al gattino.

## Note
- Il modello AI (SmolLM2-135M, ~180 MB, sul processore) è facoltativo: si scarica solo con "Attiva IA avanzata" nel pannello "Nuovo task" e resta nella cache del browser, finché non lo disattivi. Senza modello l'analisi usa le regole di base.
- Il fiore del giorno si ricalcola sul server a ogni modifica; le giornate passate sono chiuse (HTTP 409).
- Ogni giorno nasce un solo fiore, con un petalo per ogni task completato. Tetto di 8 task per data (`MAX_TASKS_PER_DAY` in `server/routes/lib/validate.js` e `public/js/app.js`): oltre, il server risponde 409.
- Servire il sito in HTTPS se lo si pubblica: il token di accesso viaggia nell'intestazione Authorization.
- Se il server sta dietro un proxy, impostare `TRUST_PROXY` in `.env`: i limiti ai tentativi si basano sull'IP del client.
- I limiti ai tentativi stanno in memoria: si azzerano al riavvio e valgono per una sola istanza del server.
