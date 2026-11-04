# AFTERFRAME — La tua cineteca emotiva

Una libreria web personalizzata (HTML, CSS, JavaScript puro), con **34 titoli iniziali**, valutazioni e reazioni già note, ricerca e filtri, link di ricerca streaming, copertine, gestione personale e database locale con import/export JSON.

## Avvio rapido

1. Estrai lo ZIP.
2. Apri `index.html` in Chrome, Edge o Firefox. **Consigliato:** avvia un server locale per una compatibilità migliore:
   - Windows: doppio clic su `avvia-windows.bat` (serve Python installato).
   - Mac/Linux: `./avvia-mac-linux.sh`.
   - Manuale: nella cartella, esegui `python -m http.server 8000`, poi visita `http://localhost:8000`.
3. Nessuna libreria JS esterna né chiave API richiesta. Funziona anche senza backend.

## Funzionalità

- **Catalogo iniziale personalizzato**: raccomandazioni da quanto hai raccontato (fratellanza, tradimenti, sacrifici, perdono, riconoscimento) e titoli già visti con la reazione indicata.
- **Cover**: URL immagini impostati su alcune schede; per altre il browser cerca immagini pubbliche tramite Jikan (anime), TVmaze (serie) e, dove applicabile, iTunes Search (film). Ricerca asincrona, senza chiavi. Se un sito esterno è irraggiungibile o blocca la richiesta, viene mostrata una copertina tipografica, **non una foto inventata**. Le copertine necessitano di Internet e appartengono ai rispettivi proprietari. Se vuoi garantire una copertina precisa, inserisci manualmente il relativo URL HTTPS dalla modifica della scheda o dal JSON. I browser possono bloccare richieste cross-origin o immagini remote: è previsto un fallback. Alcuni endpoint hanno limiti di richieste.
- **Ricerca** per titolo, genere, trama, anno e tag, filtri per tipo di opera e temi, ordinamento.
- **Stati**: da guardare, in corso, visto; filtraggio automatico delle raccomandazioni già viste.
- **Preferiti** con pulsante dedicato; **reazione personale** (non visto / ho pianto / mi ha commosso / non mi ha colpito).
- **Voto personale** 1–10 e **note private** (che possono contenere spoiler). Le schede pubbliche iniziali non spoilerano.
- **Profilo emotivo editoriale** 0–5: emozione, commedia, azione, romanticismo, tensione. Il valore `match` 0–100 è una **stima editoriale di affinità**, non un rating esterno né una previsione scientifica.
- **Dove cercare**: link a ricerca su JustWatch Italia, Prime Video, Netflix e, per gli anime, Crunchyroll. Sono pulsanti di **ricerca**, non affermazioni sulla disponibilità; verificare sempre sul sito e nella propria area. È possibile impostare collegamenti personalizzati per ciascun titolo nel JSON.
- **CRUD completo** (aggiungi/modifica/elimina dalla UI) e **import JSON con anteprima prima dell'applicazione**; esportazione di backup JSON, recupero del catalogo iniziale.
- **Responsive**: desktop/tablet/mobile, supporto tastiera, schermate modali.

## Dove sono i dati?

In **IndexedDB**, nel browser e nell'origine da cui hai aperto la pagina. In contesti dove IndexedDB non è disponibile viene provato `localStorage` come fallback. **Non è un database remoto/condiviso**: se cancelli i dati del sito, cambi browser, dispositivo, dominio o URL di accesso, puoi perdere/isolarti dai dati locali. Esegui periodicamente **Esporta backup**. I file JSON rimangono sul tuo dispositivo finché non scegli di importarli.

**Non è presente nessun backend o account**. Per condividere modifiche fra telefoni o utenti, servirà in futuro una API e un DB server (per esempio Spring Boot + PostgreSQL): questo ZIP offre già un modello dati e uno schema d'importazione comodi da riutilizzare.

## Gestione JSON

Apri **Gestisci database** → trascina un file `.json`, oppure incolla il testo. Clicca **Verifica JSON** per vedere esattamente quali record verranno aggiunti, modificati o cancellati. **Applica modifiche** salva il nuovo stato in un'unica transazione. Se anche una sola operazione è invalida, non viene modificato nulla.

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

## Organizzazione

- `index.html` — interfaccia e modali
- `styles.css` — design system responsive dark
- `js/data.js` — catalogo iniziale, con affinità e temi
- `js/db.js` — salvataggio IndexedDB/localStorage
- `js/app.js` — visualizzazione, filtri, rating, ricerca poster, operazioni JSON
- `examples/*.json` — esempi di import
- `database/catalogo-iniziale.json` — catalogo iniziale esportabile/modificabile
- `schema/afterframe-import.schema.json` — schema di riferimento per importazioni

## Note su streaming e contenuti

JustWatch è il primo punto di controllo della disponibilità legale in Italia. I pulsanti di Prime Video, Netflix e Crunchyroll sono **ricerche**: non indicano che il titolo sia effettivamente incluso in un abbonamento. I contenuti, i poster e i marchi appartengono ai rispettivi titolari. I metadati sono catalogati per uso personale. L'import di URL esterni non equivale a verifica della fonte.
#   e m o t e c a  
 