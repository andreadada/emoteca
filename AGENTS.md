# Emoteca — istruzioni per agenti e nuove chat

**Prima di intervenire sul progetto, leggere nell'ordine:**

1. [docs/PROJECT-HANDOFF.md](docs/PROJECT-HANDOFF.md) — **fonte canonica dello stato attuale, roadmap e limiti**.
2. [docs/DEPLOY-COOLIFY.md](docs/DEPLOY-COOLIFY.md) — pubblicazione e diagnostica Coolify.
3. [docs/CATALOG-V3.md](docs/CATALOG-V3.md) — provider, API e vincoli delle licenze.
4. [docs/PERSONAL-LISTS.md](docs/PERSONAL-LISTS.md) — liste personali multiple, migrazione e backup.
5. [docs/DESIGN-REFRAME-2026.md](docs/DESIGN-REFRAME-2026.md) — linguaggio UI/UX aggiornato, pattern film-first, motion e verifiche.
6. [docs/GOOGLE-THEMES-BACKDROP.md](docs/GOOGLE-THEMES-BACKDROP.md) — Google Identity Services, DB cloud, backup/consenso import, tema e backdrop.
7. `README.md` e **codice attuale del branch `main`**.

## Invarianti da preservare

- Emoteca 3.0 è HTML/CSS/JS con Nginx su porta interna 80 e un proxy Node sulla sola loopback 8787. Non presupporre React/Next.js o un DB server.
- **Catalogo mondiale remoto ≠ liste personali**: il catalogo TMDB/Wikidata è globale; le raccolte personali sono in IndexedDB `afterframe-catalog-v1`, con film in `state/all-films` e membership in `state/personal-lists-v1`. Il backup JSON `afterframe-catalog` contiene `films` e `lists`. Nessun account o sync.
- Non cancellare, sovrascrivere o migrare dati locali senza backup verificabile, piano e richiesta esplicita.
- Il token TMDB vive in una variabile di ambiente **runtime** `TMDB_READ_TOKEN` dentro Coolify. Non esporlo in codice frontend, log, documentazione, screenshot o test.
- Non promettere “tutti i film” o “tutte le locandine”: TMDB e Wikidata hanno limiti di copertura/licenze. Test API attuali usano **mock**, non confermano accesso live TMDB.
- La scheda film è una pagina `?film=...`, non un dialog. La homepage consiglia solo titoli personali non visti.
- Mantenere il linguaggio UX **Emoteca / Reframe 01** (`styles-reframe.css` sopra `styles-cinema.css`): locandine come contenuto, ricerca prioritaria, superfici chiare, navigazione e liste semplici, niente dashboard decorative, glassmorphism o effetti non funzionali. Le animazioni rispettano `prefers-reduced-motion`.

## Regole di sviluppo

- Prima di un cambiamento controllare repository, PR e CI e non assumere che Coolify sia online. Il deploy reale rimane da verificare.
- Preferire branch + PR per modifiche funzionali, testando con `node --test tests/*.test.mjs` e la workflow Chromium/Docker esistente.
- Testare i flussi di rating, note, backup JSON, ricerca globale, paginazione, browser Back/Forward e mobile dopo cambiamenti UI/API.
- Non aggiungere dipendenze o un nuovo backend utente senza una ragione e un piano di compatibilità.
- Aggiornare questo file, l'handoff e la guida di deploy dopo cambiamenti strutturali, ma **non registrare token**, IP privati, URL sensibili o dati personali.
- Trattare `docs/UX-REDESIGN-V2.md` e `docs/CATALOG-SOURCES-AND-DESIGN.md` come materiali **storici**.

## Prossima azione

Partire dal **P0** di [docs/PROJECT-HANDOFF.md](docs/PROJECT-HANDOFF.md): redeploy da `main` della funzione **Le mie liste** (PR #9), verifica non distruttiva della migrazione e dei backup, quindi controllo TMDB e del dominio pubblicato. **Non risultano verificati il dominio finale, il runtime Coolify e la validità del token di produzione.**

- L’accesso Google è **opzionale** e si attiva soltanto con `GOOGLE_CLIENT_ID` e `DATABASE_URL` in Coolify; non esporre mai password o token negli asset pubblici, non importare dati browser senza consenso, non sovrascrivere cloud non vuoto. Conservare revisioni/versioni e protezione CSRF.
- Tema **scuro** predefinito e opzione **chiaro**; la pagina film usa il backdrop TMDB a schermo intero quando disponibile. Mantenere il contrasto, il fallback e i test.
