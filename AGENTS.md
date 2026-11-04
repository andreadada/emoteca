# Emoteca — istruzioni per agenti e nuove chat

**Prima di intervenire sul progetto, leggere nell'ordine:**

1. [docs/PROJECT-HANDOFF.md](docs/PROJECT-HANDOFF.md) — **fonte canonica dello stato attuale, roadmap e limiti**.
2. [docs/DEPLOY-COOLIFY.md](docs/DEPLOY-COOLIFY.md) — pubblicazione e diagnostica Coolify.
3. [docs/CATALOG-V3.md](docs/CATALOG-V3.md) — provider, API e vincoli delle licenze.
4. `README.md` e **codice attuale del branch `main`**.

## Invarianti da preservare

- Emoteca 3.0 è HTML/CSS/JS con Nginx su porta interna 80 e un proxy Node sulla sola loopback 8787. Non presupporre React/Next.js o un DB server.
- **Catalogo mondiale remoto ≠ libreria personale**; la libreria rimane nel browser (IndexedDB `afterframe-catalog-v1`, backup JSON `afterframe-catalog`), senza account o sync.
- Non cancellare, sovrascrivere o migrare dati locali senza backup verificabile, piano e richiesta esplicita.
- Il token TMDB vive in una variabile di ambiente **runtime** `TMDB_READ_TOKEN` dentro Coolify. Non esporlo in codice frontend, log, documentazione, screenshot o test.
- Non promettere “tutti i film” o “tutte le locandine”: TMDB e Wikidata hanno limiti di copertura/licenze. Test API attuali usano **mock**, non confermano accesso live TMDB.
- La scheda film è una pagina `?film=...`, non un dialog. La homepage consiglia solo titoli personali non visti.
- Mantenere l'UI cinema-first; evitare ritorno alla sidebar, quattro statistiche decorative, marketing generico o percentuali di affinità fittizie.

## Regole di sviluppo

- Prima di un cambiamento controllare repository, PR e CI e non assumere che Coolify sia online. Il deploy reale rimane da verificare.
- Preferire branch + PR per modifiche funzionali, testando con `node --test tests/*.test.mjs` e la workflow Chromium/Docker esistente.
- Testare i flussi di rating, note, backup JSON, ricerca globale, paginazione, browser Back/Forward e mobile dopo cambiamenti UI/API.
- Non aggiungere dipendenze o un nuovo backend utente senza una ragione e un piano di compatibilità.
- Aggiornare questo file, l'handoff e la guida di deploy dopo cambiamenti strutturali, ma **non registrare token**, IP privati, URL sensibili o dati personali.
- Trattare `docs/UX-REDESIGN-V2.md` e `docs/CATALOG-SOURCES-AND-DESIGN.md` come materiali **storici**.

## Prossima azione

Partire dal **P0** di [docs/PROJECT-HANDOFF.md](docs/PROJECT-HANDOFF.md): deployment su Coolify, verifica della variabile TMDB e test reale sul dominio pubblicato. **Non risultano verificati il dominio finale, il runtime Coolify e la validità del token di produzione.**
