# Emoteca — handoff canonico per nuove chat / agenti

**Aggiornato:** 4 novembre 2026. **Progetto:** [github.com/andreadada/emoteca](https://github.com/andreadada/emoteca). **Branch stabile:** `main`.

> **LEGGI QUESTO FILE PER PRIMO** se ricevi la richiesta di continuare il progetto in una nuova chat. Poi consulta [DEPLOY-COOLIFY.md](DEPLOY-COOLIFY.md) e [CATALOG-V3.md](CATALOG-V3.md). Usa il **codice attuale di `main`** come fonte definitiva, non descrizioni di chat precedenti. In caso di discrepanze con documenti di v1/v2, prevalgono questo handoff e il codice v3.

## 1. Missione e requisiti

**Emoteca** è una libreria cinematografica personale con un **catalogo mondiale consultabile online**. L'utente vuole:

1. Cercare quanti più film e serie internazionali possibile, **non soltanto i 34 titoli iniziali**.
2. Vedere locandine vere, descrizioni e metadati, rispettando licenze e disponibilità delle fonti; non generare immagini finte.
3. Aprire ogni film in una **pagina dedicata**, non dentro un modal.
4. Vedere sulla homepage un **film consigliato che cambia** e **non è mai già visto**.
5. Salvare film nella propria libreria, contrassegnarli come visti, assegnare voti, reazioni, preferiti e note.
6. Avere una UI/UX **premium cinematografica**, senza grafica generica da dashboard SaaS / “AI slop”: i contenuti devono guidare layout e gerarchia.
7. Deploy affidabile su **Coolify** tramite GitHub, senza perdere dati locali e senza esporre il token TMDB.

**Chiarimento del requisito "tutti i film":** nessun archivio pubblico garantisce letteralmente l'intera filmografia del mondo, né la copertina di ogni film. Attualmente TMDB è il catalogo primario ampio; Wikidata è fallback aperto con copertura limitata. Non confondere il catalogo remoto con la libreria IndexedDB privata.

## 2. Stato effettivo verificato al 4/11/2026

| Area | Stato | Evidenza / limite |
| --- | --- | --- |
| Redesign cinema-first | **Implementato** | PR [#2](https://github.com/andreadada/emoteca/pull/2), `styles-cinema.css`, nav orizzontale, card e responsive. |
| Catalogo globale e ricerca | **Implementato** | PR [#3](https://github.com/andreadada/emoteca/pull/3): ricerca `/api/catalog/search`, browse `/api/catalog/discover`, paginazione TMDB; Wikidata fallback. |
| Scheda film in pagina | **Implementato** | Route `?film=...`, `#detail-screen` in `index.html`, `showDetail()` in `js/app.js`. Nessun dettaglio modal. |
| Homepage consigliato | **Implementato** | Scelta casuale tra titoli personali non visti, evitando il titolo precedente salvato in `sessionStorage`; non è un modello ML. |
| Locandine | **Implementato con limiti** | TMDB titolo/anno, seed/manuale e fallback Jikan/TVmaze/iTunes; possono mancare per opere rare o link esterni rotti. |
| Libreria privata | **Implementato** | IndexedDB `afterframe-catalog-v1`, fallback localStorage; backup/import JSON compatibile. |
| Container + API | **Implementato e testato in CI** | Dockerfile unico; Nginx 80 + Node loopback 8787; test Docker/Chromium su PR #3 riusciti; smoke test su `main` riusciti. |
| Credenziale reale TMDB | **NON verificata in produzione** | Nessun token è stato configurato da questa chat in Coolify. Test TMDB eseguiti con un provider mock locale; richiesta reale da verificare post-deploy. |
| Deploy Coolify / dominio / SSL | **NON verificato** | Non ci sono prove che il sito sia live; la successiva azione richiesta è seguire il runbook e fare smoke test sul dominio effettivo. |
| Sincronizzazione multi-dispositivo | **Non implementata** | Non esistono account, backend di profilo né DB condiviso. |

**Riferimenti verificati:** ultimo merge funzionale `d082d6fdad53b4d4e92b565830a2fe0a123271c1` su `main`; PR #3 merged, workflow smoke su quel commit riuscita. Le successive modifiche di documentazione non sono una release funzionale e aggiorneranno il commit di `main`.

**Non dichiarare:** “tutti i film sono importati”, “tutti i poster sono disponibili”, “Coolify è online”, “TMDB funziona già con token reale”, “dati salvati sul server”. Sono false o non verificate.

## 3. Stack, deployment e flusso dati

```text
GitHub (main)
  └─ Coolify Application → Dockerfile → Container
                               ├─ Nginx :80 → index.html + JS/CSS
                               └─ /api/catalog/* → Node :8787 solo localhost
                                                        └─ TMDB HTTPS (se token configurato)

Browser
  ├─ Ricerca globale → proxy TMDB o Wikidata (nessuna importazione massiva)
  ├─ Scheda film → URL condivisibile, senza richiedere salvataggio
  └─ Libreria personale → IndexedDB / localStorage fallback
                               └─ backup/import JSON manuale
```

Tecnologie: **HTML5**, CSS puro, JavaScript puro; **Node.js** API HTTP senza dipendenze runtime esterne; **Nginx**; **Dockerfile**; **GitHub Actions / Node test / Chromium Playwright CI**. Nessun React/Next/Vite, nessuna dipendenza npm di produzione, nessun database PostgreSQL/Redis.

### File importanti

| File | Responsabilità |
| --- | --- |
| `index.html` | Shell dell'app e sezioni per homepage, catalogo mondiale, pagina film, modali ancora usati per edit/JSON. |
| `styles-cinema.css` | Unico stylesheet runtime; layout responsive, cinematografico, dialog secondari, detail page. |
| `js/app.js` | Navigazione, catalogo locale, scelta consigliato, pagina film, diario, import/export e integrazione con explorer. |
| `js/remote-catalog.js` | Adapter TMDB server/direct token/Wikidata, ricerca, paginazione, copertine, mappatura dati esterni. |
| `js/db.js` | IndexedDB con fallback localStorage e scrittura atomica. |
| `js/data.js` | Dati seed, **34 titoli iniziali**; non sono il catalogo mondiale. |
| `server/catalog-api.mjs` | Proxy TMDB con credenziale da ambiente, API tipizzate, cache bounded, validazione input. |
| `server/start.sh` | Avvia Node interno e Nginx nello stesso container. |
| `Dockerfile` | Immagine Nginx Alpine + Node; pubblica solo porta 80. |
| `nginx.conf` | Serve contenuti statici e inoltra `/api/catalog/*` a 127.0.0.1:8787. |
| `tests/smoke.test.mjs` | Validazione JS/HTML, struttura UI e compatibilità dei dati. |
| `tests/api.test.mjs` | Test API usando un server TMDB locale fittizio; NON serve token reale. |
| `tests/ui-e2e.mjs` | Flussi browser desktop/mobile con dati remoti fittizi; cattura screenshot. |
| `.github/workflows/smoke.yml` | CI su `main`/feature e PR. |
| `.github/workflows/ui-e2e.yml` | CI su PR/manuale: build Docker e test Chromium. |
| `docs/DEPLOY-COOLIFY.md` | Runbook operativo per pubblicare, controllare e ripristinare. |
| `docs/CATALOG-V3.md` | Specifiche catalogo mondiale, API, licenze e limiti. |
| `docs/UX-REDESIGN-V2.md` | Documento di design **storico**: alcune interazioni sono superate dalla v3. |
| `docs/CATALOG-SOURCES-AND-DESIGN.md` | Valutazione storica delle sorgenti; non usare il suo vecchio elenco UI come stato corrente. |

### API e credenziali

- `GET /api/catalog/status` → indica se è presente `TMDB_READ_TOKEN`, senza mostrarne il valore. **`enabled:true` NON prova che il token sia valido**.
- `GET /api/catalog/search?q=...&page=1&type=all|movie|tv` → ricerca nel catalogo.
- `GET /api/catalog/discover?page=1&type=all|movie|tv` → scoperta; per tutti i formati usa feed trending misto.
- `GET /api/catalog/detail?type=movie&id=...` → dettagli.
- `GET /api/catalog/poster?title=...&year=...&type=movie` → lookup copertina con corrispondenza controllata.

Token TMDB deve stare in **Coolify Runtime Environment Variables**, nome esatto `TMDB_READ_TOKEN`, non in frontend, URL pubblico, codice o output della chat. Per una credenziale assente il provider fallback è **Wikidata CC0**, che ha meno risultati, non permette la navigazione completa senza termini di ricerca e può non avere locandine.

Nota legale: TMDB richiede attribuzione ed ha un utilizzo gratuito previsto per progetti non commerciali; un'attività monetizzata necessita verifica/licenza commerciale. I file multimediali Commons hanno licenze individuali; non ripubblicare in massa IMDb TSV senza diritti.

### Semantica di salvataggio

- DB IndexedDB: `afterframe-catalog-v1`, store `state`, chiave `all-films`.
- Fallback localStorage: `afterframe-local-backup-v1`; cache copertine `afterframe-poster-cache`.
- Backup JSON: formato `afterframe-catalog` versione 1. **Non rinominare** nomi di DB/chiavi/formati senza migrazione esplicita.
- Salvataggio titoli esterni tramite `window.AfterframeCatalog.addExternal`, con validazione e deduplicazione. Aggiunta di titolo senza anno impedita finché non viene completato manualmente.
- Operazione di import `replace` / `films:[]` può **sostituire completamente** la libreria: verificare e chiedere conferma. I dati non sono su Coolify e non vengono sincronizzati automaticamente.

## Hotfix locandine — 4 novembre 2026

**Segnalazione visiva in produzione:** su `https://film.ddone.it`, dopo il caricamento delle locandine esterne, un'immagine enorme con il testo grafico di una locandina occupava la homepage e copriva le card. Screenshot dell'utente disponibile nella conversazione dell'intervento, non incluso nel repository.

**Causa nel codice:** in `js/app.js`, `pumpPosters()` aggiornava ogni nodo con `[data-open]` o `[data-poster]`. `[data-open]` è utilizzato sia dai veri poster sia dai pulsanti di navigazione e dai titoli. Inserire un'immagine `position:absolute; inset:0; width:100%; height:100%` dentro un pulsante senza contenitore posizionato poteva farla espandere sull'intero viewport.

**Correzione:** la modifica della copertina ora interessa soltanto `.poster-wrap[data-open]`, `.feature-poster[data-poster]`, `.detail-poster[data-poster]`; il CSS per `.poster-image` è vincolato ai contenitori effettivi. `index.html` imposta un parametro di versione agli asset CSS/JS per evitare cache obsolete dopo il deploy. Test Chromium dedicato simula un proxy TMDB configurato e controlla sia la locandina in evidenza sia quelle nel reel, verificando che nessuna immagine venga inserita nei pulsanti generici.

**Stato:** fix incluso nella PR del branch `fix/poster-image-layout-overflow`; controllare esito CI/merge sul repository prima di assumere che sia in `main`. **Redeploy Coolify e verifica sul dominio finale non automatici né confermati.** Dopo il deploy ricaricare `https://film.ddone.it` e controllare homepage, poster, CTA, reel e browser mobile; se necessario fare hard refresh. Non cancellare cache IndexedDB né dati personali per risolvere un bug CSS.

## 4. Cosa fare ADESSO — roadmap prioritaria

### P0 — Portare online e validare

- [ ] Scegliere o verificare l'Application già esistente in Coolify. Evitare due deploy sullo stesso dominio.
- [ ] Deploy dal branch `main` con Dockerfile e porta interna 80; configurare DNS, HTTPS e log.
- [ ] Configurare `TMDB_READ_TOKEN` **runtime-only e secret**. Verificare `/api/catalog/status` e poi **richiesta reale** `/api/catalog/search?q=Interstellar&type=movie&page=1`.
- [ ] Controllare risultati, poster, dettaglio e ricerca anche con titoli italiani, anime e serie. Verificare link diretti alla scheda e browser Back.
- [ ] Prima di cambiare dominio, esportare backup dei dati dal vecchio browser/origine. Provare import dati su nuovo sito senza distruggere la libreria.
- [ ] Registrare nella documentazione il **dominio effettivo**, il commit deployato, le configurazioni non segrete, il risultato dei controlli e la data. Non scrivere segreti.
- [ ] Controllare la conformità di attribuzioni e condizioni d'uso TMDB per l'uso previsto.

**Criterio P0 completo:** pagina raggiungibile in HTTPS, `status.enabled=true`, almeno una ricerca e un dettaglio reali TMDB riusciti con immagini ove presenti, e diario personale persistente dopo refresh sul dominio finale.

### P1 — Stabilizzazione dopo il deploy

- [ ] Verificare la qualità/copertura delle copertine della libreria (titoli iniziali e importati), gestire URL rotti/rate limits dei fallback.
- [ ] Testare ricerca e navigazione su schermi piccoli, tastiera, refresh `?film=...`, avanti/indietro, assenza di overflow.
- [ ] Testare provider non disponibile/token errato, anno mancante e omonimi con anno diverso: nessuna scheda errata, niente dati personali sovrascritti.
- [ ] Migliorare healthcheck: ora Dockerfile controlla la homepage HTTP, **non** la salute del servizio API; quando Node cade il sito statico potrebbe restare healthy.
- [ ] Aggiungere limiti anti-abuso/rate limit alla API pubblica e monitoraggio senza registrare token o note. La cache attuale è solo in memoria (300 keys, TTL 10 minuti).
- [ ] Valutare process supervision e chiusura pulita di Nginx+Node nel container, oppure separare API e statico in servizi solo se necessario.
- [ ] Raffinare paginazione, ranking/localizzazione dei titoli e handling delle fonti, verificando limiti TMDB per pagine/risultati.
- [ ] Aggiungere controlli con un token TMDB reale su ambiente sicuro/staging (la CI attuale usa **solo mock**).
- [ ] Rivedere e aggiornare docs di v1/v2 incoerenti con la v3.

### P2 — Evoluzioni di prodotto (non implementate)

- [ ] Account, sincronizzazione sicura della libreria tra dispositivi e backup server, **solo dopo una proposta di migrazione dati**; oggi nessun backend utente.
- [ ] Discovery/recommendations più ricche: per ora il titolo in evidenza è casuale fra quelli personali non visti, non un algoritmo che conosce preferenze.
- [ ] Un indice di metadati gestito lato server o una fonte open addizionale, se serve miglior copertura, con verifica licenze e aggiornamenti incrementali.
- [ ] Ricerca più evoluta per regista, cast, temi e lingue; metadata enrichment e schede con attribuzione immagini per fonte.
- [ ] Migliorare accessibilità e performance mobile, Core Web Vitals, caching e gestione fallback immagini.
- [ ] Valutare licenza commerciale TMDB **prima di monetizzare**; non dichiarare dati completamente open source se arrivano da TMDB.

## 5. Test e criteri per dire “finito”

Da repository:

```bash
node --test tests/*.test.mjs
```

La CI **ha passato** test automatici, mock TMDB e test Chromium Docker prima del merge PR #3; su `main` il workflow smoke ha avuto successo sul commit funzionale `d082d6f`. **Questo non prova che Coolify sia configurato o che la API live TMDB funzioni**, e non sostituisce i controlli manuali in produzione.

Controllo importante prima di ulteriori merge: evitare regressioni su import/export JSON, marcatura visto, note, URL schede, ricerca globale, selezione casuale, mobili e immagini, oltre ai test esistenti. Documentare ogni cambiamento e aggiornare questo file.

## 6. Come riprendere in una nuova chat

Prompt consigliato:

> Lavora sulla repository GitHub `andreadada/emoteca`. Prima leggi `docs/PROJECT-HANDOFF.md`, `docs/DEPLOY-COOLIFY.md`, `docs/CATALOG-V3.md`, il README e verifica l'ultima versione di `main` e le GitHub Actions. Emoteca 3.0 usa HTML/CSS/JS, Nginx+Node in Docker e catalogo TMDB con fallback Wikidata. I dati privati rimangono in IndexedDB. Dimmi lo stato reale del deploy e riprendi dalla roadmap P0 senza rifare l'interfaccia da zero, senza sostituire dati locali e senza inserire credenziali nel repository. Aggiorna documentazione e test dopo ogni modifica.

**Modalità di lavoro per il prossimo agente:** controlla i tool collegati e la repository prima di assumere che un deploy o un test sia avvenuto; crea feature branch e PR per cambiamenti non documentali, esegui test, non inventare copertura catalogo o dati. Prima di toccare la persistenza, pianifica backup/migrazione; non riscrivere UI, struttura e CSS senza necessità motivata.

## 7. Fonti e riferimenti

- Repo: https://github.com/andreadada/emoteca
- PR redesign v2: https://github.com/andreadada/emoteca/pull/2
- PR catalogo v3: https://github.com/andreadada/emoteca/pull/3
- Coolify Dockerfile: https://coolify.io/docs/applications/builds/dockerfile
- Coolify environment variables: https://coolify.io/docs/applications/configuration/environment-variables
- Coolify domains: https://coolify.io/docs/core/networking/domains
- TMDB licensing: https://developer.themoviedb.org/docs/faq

**Questa documentazione descrive codice e verifiche fino al 4/11/2026. Non è una dashboard live di deployment:** aggiornare quando l'utente conferma dominio, servizi, token configurato (mai il suo valore), esito test e nuovi requisiti.
