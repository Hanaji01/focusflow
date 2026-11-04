# FocusFlow AI

Frontend (cartella `public/`) + backend Node/Express/MySQL (cartella `server/`).

## Avvio

1. Serve Node 20+ e un database MySQL 8 o MariaDB 10.5+.
2. Crea database e utente (da client MySQL, come amministratore):
   ```sql
   CREATE DATABASE focusflow CHARACTER SET utf8mb4;
   CREATE USER 'focusflow'@'localhost' IDENTIFIED BY 'una-password-robusta';
   GRANT ALL ON focusflow.* TO 'focusflow'@'localhost';
   ```
3. Nella cartella `server/`:
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
5. Apri http://localhost:3000 — dalla pagina di login puoi registrarti.

Per creare un utente da terminale: `npm run user:create -- nome password` (con `ALLOW_REGISTER=false` la registrazione dal sito è chiusa).

## Senza server (modalità demo)
Se il server non risponde, il frontend funziona con dati d'esempio nel browser:
dalla cartella `public/` lancia `py -m http.server 8080` e apri http://localhost:8080/login.html.

## Note
- Il modello AI (Qwen2.5-0.5B, ~780 MB) è facoltativo: si scarica solo con "Attiva IA avanzata" nel pannello "Nuovo task" e resta nella cache del browser, finché non lo disattivi. Senza modello l'analisi usa le regole di base.
- Il fiore del giorno si ricalcola sul server a ogni modifica; le giornate passate sono chiuse (HTTP 409).
- Ogni giorno nasce un solo fiore, con un petalo per ogni task completato. Tetto di 8 task per data (`MAX_TASKS_PER_DAY` in `server/lib/validate.js` e `public/app.js`): oltre, il server risponde 409.
- Servire il sito in HTTPS se lo si pubblica: il token di accesso viaggia nell'intestazione Authorization.
