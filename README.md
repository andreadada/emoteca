# Emoteca — La tua libreria cinematografica

Una libreria cinematografica personale in HTML, CSS e JavaScript puro. Parte da **34 titoli iniziali**, mantiene valutazioni, preferiti, note e filtri nel browser, e ora permette di **cercare nuovi film da Wikidata o TMDB** e aggiungerli selettivamente alla raccolta.

## Interfaccia — esperienza cinema-first

La UI 2.0 non è un restyling CSS della dashboard precedente: la navigazione è orizzontale e non esiste più una sidebar permanente o una griglia di statistiche.

- **In evidenza** mostra un titolo reale della collezione con sinossi e locandina, più una selezione orizzontale dei film ancora da guardare.
- **Libreria**, **Da guardare**, **Visti**, **Preferiti** sono viste dedicate. La ricerca locale consulta tutti i titoli salvati, anche quelli già visti.
- Le copertine sono card con pulsanti distinti per aprire la scheda e aggiungere ai preferiti.
- Le **schede film** separano informazioni e link esterni dal diario personale (reazione, valutazione e note).
- **Trova un film** apre la ricerca Wikidata/TMDB; **+** crea un titolo a mano; **Backup dei dati** permette import/export JSON.
- Su mobile la navigazione diventa una riga orizzontale scorrevole senza menu laterale.

La compatibilità con la struttura storica IndexedDB e con i backup JSON è intenzionalmente preservata. Vedi [UX DESIGN V2](docs/UX-REDESIGN-V2.md).

## Novità — Esplora il catalogo cinematografico

**Trova un film** nella barra superiore apre la ricerca tra archivi esterni, separata dalla libreria personale.

- **Wikidata** è la fonte predefinita: metadati strutturati con licenza CC0, nessuna chiave API necessaria. La ricerca è online, non un download di tutte le opere esistenti.
- **TMDB** è facoltativo: richiede un **API Read Access Token (Bearer)** personale e offre poster e sinossi più ricchi. Il token è usato esclusivamente in memoria nella pagina e non viene registrato, salvato nel database o inserito nel codice. L'uso gratuito richiede finalità non commerciali e attribuzione; per scopi commerciali occorre una licenza.
- Per ogni risultato sono mostrati titolo, anno (quando presente), descrizione, poster disponibile, link alla fonte e **Aggiungi**. Se manca l'anno non vengono inventati metadati e l'importazione automatica è disabilitata.
- I film importati sono salvati nella **biblioteca locale**, non sostituiscono i titoli esistenti e non ricevono percentuali di affinità fittizie. Titoli già presenti non vengono duplicati.
- I poster da Wikimedia Commons sono soggetti alle **licenze individuali** dei file, distinte dalla licenza CC0 sui dati strutturati.
- Non viene verificata la disponibilità dei film sulle piattaforme streaming.

Per la valutazione approfondita delle fonti, i limiti dei cataloghi e il nuovo design system vedi [Sorgenti catalogo e design](docs/CATALOG-SOURCES-AND-DESIGN.md).

## Avvio rapido

1. Estrai lo ZIP.
2. Apri `index.html` in Chrome, Edge o Firefox. **Consigliato:** avvia un server locale per una compatibilità migliore:
   - Windows: doppio clic su `avvia-windows.bat` (serve Python installato).
   - Mac/Linux: `./avvia-mac-linux.sh`.
   - Manuale: nella cartella, esegui `python -m http.server 8000`, poi visita `http://localhost:8000`.
3. Nessuna libreria JS esterna né chiave richiesta per la libreria personale e Wikidata. La ricerca esterna richiede rete; TMDB richiede un token personale.

## Funzionalità

- **Catalogo iniziale personalizzato**: 34 titoli precompilati, a cui aggiungere film e serie dagli archivi esterni o manualmente.
- **Cover**: URL immagini impostati su alcune schede; per altre il browser cerca immagini pubbliche tramite Jikan (anime), TVmaze (serie) e, dove applicabile, iTunes Search (film). Ricerca asincrona, senza chiavi. Se un sito esterno è irraggiungibile o blocca la richiesta, viene mostrata una copertina tipografica, **non una foto inventata**. Le copertine necessitano di Internet e appartengono ai rispettivi proprietari. Se vuoi garantire una copertina precisa, inserisci manualmente il relativo URL HTTPS dalla modifica della scheda o dal JSON. I browser possono bloccare richieste cross-origin o immagini remote: è previsto un fallback. Alcuni endpoint hanno limiti di richieste.
- **Ricerca** per titolo, genere, trama, anno e tag, filtri per tipo di opera e temi, ordinamento.
- **Stati**: da guardare, in corso, visto; filtraggio automatico delle raccomandazioni già viste.
- **Preferiti** con pulsante dedicato; **reazione personale** (non visto / ho pianto / mi ha commosso / non mi ha colpito).
- **Voto personale** 1–10 e **note private** (che possono contenere spoiler). Le schede pubbliche iniziali non spoilerano.
- **Profilo editoriale opzionale** 0–5: emozione, commedia, azione, romanticismo, tensione. Il campo storico `match` 0–100 è mantenuto per compatibilità, ma non compare come valutazione inventata nelle schede dei titoli importati.
- **Dove cercare**: link a ricerca su JustWatch Italia, Prime Video, Netflix e, per gli anime, Crunchyroll. Sono pulsanti di **ricerca**, non affermazioni sulla disponibilità; verificare sempre sul sito e nella propria area. È possibile impostare collegamenti personalizzati per ciascun titolo nel JSON.
- **CRUD completo** (aggiungi/modifica/elimina dalla UI) e **import JSON con anteprima prima dell'applicazione**; esportazione di backup JSON, recupero del catalogo iniziale.
- **Responsive**: desktop/tablet/mobile, supporto tastiera, schermate modali.

## Dove sono i dati?

In **IndexedDB**, nel browser e nell'origine da cui hai aperto la pagina. In contesti dove IndexedDB non è disponibile viene provato `localStorage` come fallback. **Non è un database remoto/condiviso**: se cancelli i dati del sito, cambi browser, dispositivo, dominio o URL di accesso, puoi perdere/isolarti dai dati locali. Esegui periodicamente **Esporta backup**. I file JSON rimangono sul tuo dispositivo finché non scegli di importarli.

**Non è presente nessun backend o account**. Per condividere modifiche fra telefoni o utenti, servirà in futuro una API e un DB server (per esempio Spring Boot + PostgreSQL): questo ZIP offre già un modello dati e uno schema d'importazione comodi da riutilizzare.

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

Incluso `Dockerfile` con Nginx e `.dockerignore`. Carica la cartella in una repository Git e su Coolify crea una **Application** con build Dockerfile. È un sito statico senza endpoint API: conserva ancora i dati **nel browser del visitatore**, non sul server. Se passi da localhost a dominio, importa il backup JSON per migrare il tuo catalogo.

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
- `js/remote-catalog.js` — ricerca Wikidata / TMDB, preview, importazione selettiva
- `examples/*.json` — esempi di import
- `database/catalogo-iniziale.json` — catalogo iniziale esportabile/modificabile
- `schema/afterframe-import.schema.json` — schema storico compatibile per importazioni
- `docs/CATALOG-SOURCES-AND-DESIGN.md` — fonti, licenze, limiti e design system
- `tests/smoke.test.mjs` — test JavaScript senza dipendenze
- `tests/ui-e2e.mjs` — test di interazione Chromium e screenshot con Playwright

## Note su streaming e contenuti

JustWatch è il primo punto di controllo della disponibilità legale in Italia. I pulsanti di Prime Video, Netflix e Crunchyroll sono **ricerche**: non indicano che il titolo sia effettivamente incluso in un abbonamento. I contenuti, i poster e i marchi appartengono ai rispettivi titolari. I metadati sono catalogati per uso personale. L'import di URL esterni non equivale a verifica della fonte.
