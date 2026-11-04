# Emoteca — La tua libreria cinematografica

Una libreria cinematografica personale in HTML, CSS e JavaScript puro. Parte da **34 titoli iniziali**, mantiene valutazioni, preferiti, note e filtri nel browser, e ora permette di **cercare nuovi film da Wikidata o TMDB** e aggiungerli selettivamente alla raccolta.

## Da leggere per primi (stato aggiornato)

- **[Handoff per un'altra chat / agente](docs/PROJECT-HANDOFF.md)**: stato verificato, file chiave, architettura, decisioni, limiti, roadmap P0/P1/P2 e prompt di ripartenza.
- **[Guida alla pubblicazione su Coolify](docs/DEPLOY-COOLIFY.md)**: configurazione Dockerfile, branch `main`, porta 80, token TMDB a runtime, domini, test e rollback.
- **[Architettura catalogo v3](docs/CATALOG-V3.md)**: fonti TMDB/Wikidata, endpoint e restrizioni.

**Nota di stato (4/11/2026):** codice v3 e CI verificati su GitHub; **deploy reale, dominio e token TMDB di produzione non verificati**. Non confondere i test con provider simulato con una prova live.

## Modalità Scuro/Chiaro, scheda cinematografica e account Google

- **Tema Scuro** predefinito, **Chiaro** selezionabile dall'header; la preferenza resta sul dispositivo.
- **Scheda film immersiva:** l'immagine di sfondo TMDB riempie la pagina con un gradiente leggibile. La scheda mostra regia, sceneggiatori, cast, voto TMDB e trailer quando TMDB fornisce i dati.
- **Accesso Google opzionale:** dopo la configurazione del server puoi creare liste e salvare voti, note e stato delle visioni nel tuo account per recuperarli da altri dispositivi.
- **Modalità ospite preservata:** IndexedDB e backup JSON continuano a funzionare senza login. Al primo accesso Google è proposta una **copia esplicita dei dati locali** solo se il cloud è ancora vuoto. Non c'è importazione o cancellazione automatica.
- **Privacy:** server verifica il token di identità Google, cookie HttpOnly Secure e dati PostgreSQL isolati per utente. Salvataggi con controllo versione evitano overwrite accidentali da più dispositivi.

L'accesso Google **non è attivo finché non vengono configurati `GOOGLE_CLIENT_ID` e `DATABASE_URL` in Coolify**. Per ambiente, migrazione, API, sicurezza e test leggi [docs/GOOGLE-THEMES-BACKDROP.md](docs/GOOGLE-THEMES-BACKDROP.md).

## Emoteca / Reframe — nuova UX cinematografica

La nuova interfaccia non replica una dashboard: prende come riferimenti funzionali Letterboxd (diario, liste, watchlist), MUBI (locandine e selezione editoriale) e Trakt (stati di visione). È un prodotto personale con un'identità distinta, non una copia.

- **Scopri:** una proposta non ancora vista (diversa fra visite) con azioni «Scopri il film» e «Già visto»; più una striscia di altri titoli. Niente duplicazione dell'intera libreria nella stessa schermata.
- **Catalogo:** la ricerca globale è la prima azione, prima di Film/Serie/Anime e generi; tag su una sola riga scorrevole per evitare un muro di filtri.
- **Le mie liste:** navigazione per raccolte, card film coerenti e ricerca fra i propri titoli.
- **Scheda film:** poster contenuto, titolo leggibile, azioni esplicite, gestione liste e diario privato. I risultati globali già salvati offrono un'azione per gestire le liste anziché un pulsante disabilitato.
- **Identità visiva:** carta avorio, verde profondo, accento terracotta; Public Sans + Newsreader. L'opera cinematografica porta colore, non una grafica decorativa. Le animazioni CSS sono brevi, solo dove aiutano, e vengono rimosse quando è attivo `prefers-reduced-motion`.
- Nessuna nuova dipendenza JavaScript o modifica dei dati personali, degli endpoint TMDB, dei backup o delle liste.

**Design brief, criteri di accessibilità e verifica:** [docs/DESIGN-REFRAME-2026.md](docs/DESIGN-REFRAME-2026.md).

## Le mie liste — raccolte personali multiple

**La mia libreria** è stata sostituita da **Le mie liste**: il catalogo mondiale è già in **Tutti i film**. Ora la raccolta iniziale si chiama **La mia lista** e contiene tutti i titoli già salvati. Puoi creare più liste con nome personale, rinominarle ed eliminarle senza cancellare i film o le note. Un titolo può appartenere a più raccolte, con la stessa scheda, stesso voto e stato «visto».

Puoi rimuovere un film dalla lista corrente con **Rimuovi dalla lista**, assegnarlo a più liste tramite i chip nella pagina film o scegliere la lista destinazione quando importi un nuovo film dal catalogo mondiale. Il diario personale resta condiviso fra tutte le liste. **Da guardare**, **Visti** e **Preferiti** rimangono viste globali dei film già salvati.

Le liste sono memorizzate in una nuova chiave nella IndexedDB esistente, senza migrazione distruttiva. Il backup JSON ora include sia `films` sia `lists`; i backup vecchi rimangono importabili. Leggi [docs/PERSONAL-LISTS.md](docs/PERSONAL-LISTS.md) per architettura, limiti e test.

## Filtri della libreria personale

Sotto i formati (Tutti, Film, Serie, Anime, Film anime, Animazione), la libreria propone i **temi e i generi come mini-tag selezionabili**, incluso **Horror**. Puoi attivarne più di uno: all'interno dei temi la selezione è inclusiva (OR), mentre formato e ricerca locale restringono i risultati (AND). `Tutti i temi` deseleziona i tag; la **X** a fianco dell'ordinamento azzera formato, temi, testo cercato e ordinamento.

Il campo **Cerca nella tua libreria** filtra i soli titoli salvati. La ricerca in alto nella testata continua a consultare il **catalogo globale**: sono due funzionalità distinte. I filtri sono responsive e non modificano dati di visione o note.

## Filtri in “Tutti i film” (catalogo mondiale)

Il catalogo globale ha le schede **Film e serie, Film, Serie TV e Anime** e, subito sotto, temi e generi selezionabili come mini-tag, incluso **Horror**. Più tag sono inclusivi (OR); categorie e ricerca restringono (AND). Una barra di ricerca nel catalogo e una **X** permettono di cercare e resettare categorie, temi e testo. I filtri si applicano ai risultati di **TMDB** (non alla sola libreria locale).

**Anime** è una selezione di film e serie giapponesi animati secondo TMDB (lingua originale `ja` e genere `16`). La ricerca per titolo con filtri tema usa i risultati delle pagine TMDB (la fonte non restituisce il totale filtrato): proseguire con **Mostra altri film** per esaminare altre pagine. La discovery applica i generi lato API.

**Limite reale:** TMDB non ha un genere Horror per le serie TV; Horror è genere 27 per il cinema. Con fallback Wikidata non è disponibile una ricerca globale affidabile per genere: il sito informa l'utente e richiede TMDB per quei filtri.

## Collegamento fra i titoli iniziali e il catalogo mondiale

I **34 titoli precompilati** rimangono nella libreria personale con i loro stati di visione e le note. Quando cerchi una di queste opere in **Tutti i film**, Emoteca la riconosce tramite l'identità canonica (`catalogId`) oppure titolo/anno/formato, anche quando TMDB cataloga come **serie TV** un titolo che Emoteca classifica come **anime**. Nel catalogo compare quindi **Già visto**, **Da guardare** o **In corso** e il titolo non viene importato due volte.

Con il proxy TMDB attivo, le schede iniziali vengono associate progressivamente alle voci globali e arricchite con locandina, descrizione e metadati ufficiali, **senza sostituire voti, reazioni, preferiti o note**. Le associazioni incerte non sono forzate. Dettagli: [Seed → catalogo globale](docs/SEED-CATALOG-LINKING.md).

## Emoteca 3.0 — ricerca mondiale e pagine film

**La ricerca principale è globale.** Digitando almeno due caratteri nella barra superiore si apre la pagina **Tutti i film**, non un filtro limitato ai 34 titoli di partenza. La pagina mostra separatamente i titoli già salvati e i risultati del catalogo esterno. Ogni risultato può aprire una pagina film **anche prima di essere salvato**; da lì è possibile aggiungerlo alla libreria per registrare voto, stato e note.

**Catalogo principale:** [TMDB](https://developer.themoviedb.org/docs/finding-data), ricercabile per titolo originale/locale e sfogliabile a pagine, con copertine e sinossi dove disponibili. **Fallback aperto:** Wikidata CC0, senza credenziali, ma con una ricerca e una disponibilità di locandine significativamente più limitate. Nessuna delle fonti può garantire letteralmente tutti i film del mondo o tutte le locandine.

### Come attivare il catalogo TMDB su Coolify

1. Dal tuo account [TMDB](https://www.themoviedb.org/settings/api), ottieni la tua **API Read Access Token** (Bearer).
2. In Coolify, apri l'applicazione Emoteca → **Environment Variables** → aggiungi `TMDB_READ_TOKEN` con il valore del token, senza il prefisso `Bearer`.
3. Esegui un redeploy dell'applicazione con Dockerfile. Non inserire la credenziale in GitHub, frontend, build arguments o file JS pubblici.
4. Verifica `https://TUO-DOMINIO/api/catalog/status`: dovrebbe riportare `"enabled":true`. Non espone il token.

Il container mantiene **Nginx sulla porta 80**; un piccolo proxy Node.js interno espone `/api/catalog/search`, `/api/catalog/discover`, `/api/catalog/detail`, `/api/catalog/poster` e `/api/catalog/status`. Il catalogo TMDB è interrogato on-demand con una cache temporanea in memoria (non viene scaricato né redistribuito integralmente).

Senza questa variabile l'app **funziona comunque**: l'utente può cercare titoli su Wikidata e continuare a gestire la propria libreria. Per un utilizzo personale del browser è anche possibile inserire un token TMDB nel pannello di ricerca: resta soltanto in memoria fino alla chiusura della pagina. La ricerca TMDB pubblica destinata a molti utenti dovrebbe invece sempre usare la variabile server.

**Licenze:** TMDB richiede attribuzione; l'utilizzo gratuito dell'API è riservato a progetti non commerciali. Se monetizzi Emoteca occorre [una licenza commerciale](https://developer.themoviedb.org/docs/faq). I dati strutturati Wikidata sono CC0; le immagini Wikimedia Commons hanno licenze individuali. Non usare gli IMDb TSV per ripubblicare un database pubblico: i loro termini lo vietano.

### Nuove interazioni

- Home: un titolo casuale della libreria ancora da vedere, diverso dopo un refresh quando esistono più candidati; esclude i titoli marcati come già visti.
- Catalogo: ricerca mondiale immediata, filtro film/serie, paginazione TMDB, sinossi e locandine se disponibili.
- Scheda: pagina dedicata con URL condivisibile `?film=...`, non un modal. Il diario personale è disponibile **solo** dopo il salvataggio.
- Copertine: ricerca TMDB con corrispondenza titolo+anno, poi fallback Jikan/TVmaze/iTunes e copertina tipografica se nessuna immagine esiste. Non vengono generate locandine false.
- Dati personali: schema IndexedDB `afterframe-catalog-v1` e backup JSON `afterframe-catalog` invariati.

Vedi [ARCHITETTURA CATALOGO 3.0](docs/CATALOG-V3.md) per endpoints, limiti, sicurezza, checklist e test.

## Interfaccia e fonti attuali

- Navigazione orizzontale con **Tutti i film**, **La mia libreria**, **Da guardare**, **Visti**, **Preferiti**. La barra superiore cerca nel catalogo mondiale, non soltanto nei titoli salvati.
- Ricerca esterna su una **pagina**, non nel vecchio popup: TMDB attraverso API Node interna al container o token personale temporaneo; Wikidata come alternativa senza chiave (meno risultati/copertine).
- Pagina film indipendente con URL `?film=...`, distinta dalle modali rimaste solo per modifica e backup. I film esterni sono consultabili prima di salvarli.
- Homepage con titolo scelto tra quelli **non visti** della libreria privata, evitando il titolo precedente se ci sono candidati.
- UI cinematografica responsive, con poster veri o fallback tipografico; nessuna garanzia di possedere tutte le copertine.
- Limiti di licenza: TMDB non è un database open source; i dati strutturati Wikidata sono CC0 ma le immagini Commons hanno licenze proprie.

Per riferimenti storici al redesign consulta [UX v2](docs/UX-REDESIGN-V2.md) e [valutazione delle fonti](docs/CATALOG-SOURCES-AND-DESIGN.md): **questi due documenti descrivono anche passaggi precedenti e non sostituiscono lo stato v3**.

## Avvio rapido

1. Estrai lo ZIP.
2. Apri `index.html` in Chrome, Edge o Firefox. **Consigliato:** avvia un server locale per una compatibilità migliore:
   - Windows: doppio clic su `avvia-windows.bat` (serve Python installato).
   - Mac/Linux: `./avvia-mac-linux.sh`.
   - Manuale: nella cartella, esegui `python -m http.server 8000`, poi visita `http://localhost:8000`.
3. L'apertura del solo `index.html` o un server statico locale **non avvia l'API Node**: permette la libreria personale e la ricerca Wikidata, ma non il proxy TMDB. Per provare l'app v3 completa usa Docker (vedi runbook) oppure inserisci un token temporaneo nel frontend per una sessione personale non pubblica.

## Funzionalità

- **Catalogo iniziale personalizzato**: 34 titoli precompilati per la libreria personale, a cui aggiungere film e serie dal catalogo globale o manualmente.
- **Cover**: TMDB tramite proxy o token personale, con corrispondenza titolo/anno, integrata da eventuali URL manuali e ricerche Jikan (anime), TVmaze (serie), iTunes Search (film). Ricerca asincrona, senza chiavi. Se un sito esterno è irraggiungibile o blocca la richiesta, viene mostrata una copertina tipografica, **non una foto inventata**. Le copertine necessitano di Internet e appartengono ai rispettivi proprietari. Se vuoi garantire una copertina precisa, inserisci manualmente il relativo URL HTTPS dalla modifica della scheda o dal JSON. I browser possono bloccare richieste cross-origin o immagini remote: è previsto un fallback. Alcuni endpoint hanno limiti di richieste.
- **Due ricerche distinte**: globale TMDB/Wikidata per film e serie internazionali; filtri, temi e ordinamento nella libreria personale.
- **Stati**: da guardare, in corso, visto; filtraggio automatico delle raccomandazioni già viste.
- **Preferiti** con pulsante dedicato; **reazione personale** (non visto / ho pianto / mi ha commosso / non mi ha colpito).
- **Voto personale** 1–10 e **note private** (che possono contenere spoiler). Le schede pubbliche iniziali non spoilerano.
- **Profilo editoriale opzionale** 0–5: emozione, commedia, azione, romanticismo, tensione. Il campo storico `match` 0–100 è mantenuto per compatibilità, ma non compare come valutazione inventata nelle schede dei titoli importati.
- **Dove cercare**: link a ricerca su JustWatch Italia, Prime Video, Netflix e, per gli anime, Crunchyroll. Sono pulsanti di **ricerca**, non affermazioni sulla disponibilità; verificare sempre sul sito e nella propria area. È possibile impostare collegamenti personalizzati per ciascun titolo nel JSON.
- **CRUD completo** (aggiungi/modifica/elimina dalla UI) e **import JSON con anteprima prima dell'applicazione**; esportazione di backup JSON, recupero del catalogo iniziale.
- **Responsive**: desktop/tablet/mobile, supporto tastiera, schermate modali.

## Dove sono i dati?

In **IndexedDB**, nel browser e nell'origine da cui hai aperto la pagina. In contesti dove IndexedDB non è disponibile viene provato `localStorage` come fallback. **Non è un database remoto/condiviso**: se cancelli i dati del sito, cambi browser, dispositivo, dominio o URL di accesso, puoi perdere/isolarti dai dati locali. Esegui periodicamente **Esporta backup**. I file JSON rimangono sul tuo dispositivo finché non scegli di importarli.

**È presente soltanto un backend Node di metadati pubblici TMDB; non esistono backend utente, account o sincronizzazione**. Per condividere i dati tra dispositivi serve una soluzione separata di autenticazione e persistenza, con migrazione/backup. Il container Coolify non conserva voti e note.

## Gestione JSON

Apri **Backup dei dati** → trascina un file `.json`, oppure incolla il testo. Clicca **Verifica JSON** per vedere esattamente quali record verranno aggiunti, modificati o cancellati. **Applica modifiche** salva il nuovo stato in un'unica transazione. Se anche una sola operazione è invalida, non viene modificato nulla.

### 1. Aggiornamento di un solo campo

```json
{
  "op": "update",
  "id": "warrior-2011",
  "changes": {"scores": {"emotion": 5}}
}
```

Aggiorna **solo** `scores.emotion` di `warrior-2011`; gli altri score e campi restano invariati.

### 2. Più operazioni in un file

```json
{
  "version": 1,
  "operations": [
    {"op": "update", "id": "warrior-2011", "changes": {"match": 99, "favorite": true}},
    {"op": "delete", "id": "green-mile-1999"},
    {"op": "add", "film": {
      "id": "mio-film-2026",
      "title": "Il mio film",
      "year": 2026,
      "type": "film",
      "tags": ["sacrificio"],
      "scores": {"emotion": 5, "comedy": 1, "action": 2, "romance": 1, "tension": 3}
    }}
  ]
}
```

`add` aggiunge solo un ID non presente, `upsert` aggiunge **o sostituisce completamente** un ID, `update` modifica solo i campi passati, `delete` elimina l'ID (se assente non fa danni). Le operazioni vengono eseguite **nell'ordine indicato**. Per rinominare un `id`, usa `delete` e `add`; l'aggiornamento semplice non può cambiare l'ID.

### 3. Un solo film senza campo `op`

Un JSON con almeno `id`, `title`, `year`, `type` viene letto come `upsert`: se l'ID esiste, sostituisce **tutti** i campi non specificati con i valori di default; per modifiche parziali scegli sempre `update`.

### 4. Ripristino da backup

Un file esportato dalla libreria contiene `{"format":"afterframe-catalog","version":1,"films":[...]}`. Importandolo, l'app propone una **sostituzione completa del catalogo**, con richiesta di conferma. Lo stesso vale per qualunque oggetto con una proprietà array `films`: non è una fusione.

### Campi di un film

| Campo | Tipo | Significato |
|---|---|---|
| `id` | string | univoco, lettere minuscole, numeri, `-`, massimo 90 |
| `title` | string | obbligatorio, massimo 180 |
| `year` | integer | 1880–2100 |
| `type` | string | `film`, `film-anime`, `film-animazione`, `anime`, `serie` |
| `genre`, `description`, `why` | string | genere, sinossi, motivo del consiglio |
| `tags` | array di string | temi/emozioni: `fratellanza`, `sacrificio`, ecc. |
| `scores` | oggetto | `emotion`, `comedy`, `action`, `romance`, `tension`: interi 0–5 |
| `match` | integer | affinità stimata da 0 a 100 |
| `status` | string | `watchlist`, `watching`, `watched` |
| `reaction` | string | `unseen`, `cried`, `moved`, `nothing` |
| `rating` | integer/null | voto personale 1–10 o null |
| `favorite` | boolean | preferito |
| `notes` | string | note personali |
| `poster` | string | URL HTTPS immagine (facoltativo) |
| `posterQuery` | string | testo di ricerca per la copertina automatica |
| `duration`, `warnings` | string | durata, avvertenze contenuti |
| `links` | array di oggetti | collegamenti specifici, es. `[{"name":"Pagina ufficiale","url":"https://example.com"}]` |
| `featured` | boolean | indicatore riservato ai consigli in evidenza |

Ogni titolo nuovo riceve valori di default per i campi opzionali. `update` supporta la fusione parziale dell'oggetto `scores` (gli altri oggetti/array vengono sostituiti).

Sono forniti due esempi: `examples/aggiorna-un-titolo.json` e `examples/operazioni-miste.json`.

## Pubblicazione su Coolify

Guida completa e aggiornata: **[DEPLOY-COOLIFY.md](docs/DEPLOY-COOLIFY.md)**.

Configurazione rapida: repository `https://github.com/andreadada/emoteca`, branch `main`, build pack `Dockerfile`, base directory `/`, Dockerfile `/Dockerfile`, porta interna `80`. Impostare `TMDB_READ_TOKEN` come **Runtime secret**, non Build-time, poi deploy e verifica `/api/catalog/status` e una ricerca reale TMDB. Nessun database necessario per la v3.

Non è confermato in questa documentazione che esista già un'Application Coolify attiva o che sia stato effettuato un deploy. Se è già presente, aggiornare quella anziché duplicarla. Con un dominio nuovo serve esportare/importare manualmente il backup IndexedDB dal browser di origine.

## Verifiche automatiche

È disponibile una suite di test senza dipendenze esterne, eseguibile con Node.js 22+:

```bash
node --test tests/*.test.mjs
```

La pipeline GitHub Actions `.github/workflows/smoke.yml` verifica sintassi JS, collegamenti ai file, validazione e compatibilità del database locale. `.github/workflows/ui-e2e.yml` esegue inoltre flussi Chromium reali desktop/mobile e produce screenshot per la revisione del design.

## Organizzazione

- `index.html` — interfaccia e modali
- `styles-cinema.css` — unico design system editoriale cinematografico, desktop/mobile e modali
- `js/data.js` — catalogo iniziale, con affinità e temi
- `js/db.js` — salvataggio IndexedDB/localStorage
- `js/app.js` — visualizzazione, filtri, rating, ricerca poster, operazioni JSON e bridge per i titoli esterni
- `js/remote-catalog.js` — ricerca globale Wikidata / TMDB, paginazione, risultati, preview e copertine
- `server/catalog-api.mjs` — proxy TMDB lato server (Node senza dipendenze)
- `server/start.sh` — avvio API interna + Nginx, porta 80 invariata
- `examples/*.json` — esempi di import
- `database/catalogo-iniziale.json` — catalogo iniziale esportabile/modificabile
- `schema/afterframe-import.schema.json` — schema storico compatibile per importazioni
- `docs/PROJECT-HANDOFF.md` — **stato corrente**, roadmap e istruzioni per riprendere in una nuova chat
- `docs/DEPLOY-COOLIFY.md` — runbook di pubblicazione e diagnostica
- `docs/CATALOG-V3.md` — architettura del catalogo globale
- `docs/UX-REDESIGN-V2.md` — note storiche UX
- `docs/CATALOG-SOURCES-AND-DESIGN.md` — ricerca storica sulle fonti
- `tests/smoke.test.mjs` — smoke test e validazione UI
- `tests/api.test.mjs` — test del proxy TMDB con provider fittizio (nessun token reale)
- `tests/ui-e2e.mjs` — test Chromium della ricerca globale e delle pagine film, con screenshot

## Note su streaming e contenuti

JustWatch è il primo punto di controllo della disponibilità legale in Italia. I pulsanti di Prime Video, Netflix e Crunchyroll sono **ricerche**: non indicano che il titolo sia effettivamente incluso in un abbonamento. I contenuti, i poster e i marchi appartengono ai rispettivi titolari. I metadati sono catalogati per uso personale. L'import di URL esterni non equivale a verifica della fonte.
