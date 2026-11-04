# Emoteca — Sorgenti cinematografiche e direzione di design

## Obiettivo

Distinguere il **catalogo mondiale consultabile** dalla **libreria personale** salvata dall'utente. La libreria continua a risiedere in IndexedDB (fallback localStorage) nel singolo browser: nessun backend, nessun login, nessuna sincronizzazione tra dispositivi.

### Il catalogo mondiale non viene copiato sul dispositivo

Il pulsante **Esplora film** avvia ricerche on-demand presso un provider esterno. L'utente sceglie quali titoli importare. Non esiste alcuna promessa di poter scaricare "tutti i film", né di completezza al 100%: disponibilità, lingua, qualità e aggiornamento dei metadati dipendono dal provider.

## Matrice delle fonti valutate (novembre 2026)

| Fonte | Apertura e licenza | Pro | Vincoli / utilizzo |
|---|---|---|---|
| [Wikidata](https://www.wikidata.org/wiki/Wikidata:Licensing) | Dati strutturati CC0 | Nessuna chiave; dati riutilizzabili; ID Q univoci | Copertura delle sinossi e dei poster non omogenea; API e limiti da rispettare. **Integrata come predefinita.** |
| [TMDB](https://developer.themoviedb.org/docs/faq) | API proprietaria, gratuita solo per progetti non commerciali con attribuzione | Ottimi risultati, poster, descrizioni localizzate, film e serie | Richiede token personale; per uso commerciale serve licenza. **Integrata come sorgente opzionale.** |
| [IMDb datasets](https://www.imdb.com/interfaces/) | Download quotidiani TSV.gz, restrizioni per uso personale/non commerciale | Catalogo enorme e ID diffusi | Non trasformare/ripubblicare come database pubblico senza autorizzazioni. **Non integrata.** |
| [Jikan](https://docs.api.jikan.moe/) | API non ufficiale MyAnimeList | Fonte specializzata per anime | Limiti d'uso, non un dump di cinema. **Già usata nel recupero poster.** |
| [TVmaze](https://www.tvmaze.com/api) | API per le serie | Utility per il recupero poster delle serie | Licenze e copertura da verificare caso per caso. **Già usata per poster.** |
| [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/index.html) | API proprietaria | Immagini per contenuti disponibili | Non un archivio libero, risultati condizionati dal mercato. **Già usata per poster.** |

**Importante:** "open source", "gratuito" e "riutilizzabile commercialmente" non sono sinonimi. La licenza CC0 vale per i dati strutturati Wikidata, non automaticamente per le immagini ottenute da Wikimedia Commons. Ciascuna immagine Commons ha una sua licenza. La navigazione TMDB richiede attribuzione dell'origine dei dati e dei poster; un eventuale uso commerciale richiede accordo con TMDB.

## Implementazione in questo branch

- `js/remote-catalog.js`: due adapter per la ricerca.
  - Wikidata Action API: `wbsearchentities` seguito da `wbgetentities`, con `origin=*` per CORS.
  - Tipi riconosciuti: film, lungometraggi animati, alcuni corti/documentari e serie; vengono esclusi persone e pagine non audiovisive.
  - TMDB: `/3/search/multi` in italiano (solo movie/tv, contenuti adulti esclusi), paginazione tramite pulsante, token Bearer inserito dall'utente e mantenuto **solo in memoria nella pagina**.
- `window.AfterframeCatalog.addExternal` in `js/app.js`: valida con `validateFilm`, deduplica per ID e titolo/anno/formato, salva tramite il percorso atomico `CatalogDB.write`, aggiorna la UI.
- Il provider remoto usa l'ID stabile `wikidata-q...` oppure `tmdb-movie-...` / `tmdb-tv-...`.
- Metadati importati: titolo, anno, tipo, descrizione se disponibile, poster se disponibile, link alla fonte. Se manca l'anno, il record non viene importato automaticamente: niente anni inventati.
- `match=0` e `scores=0` per i titoli importati: non attribuire loro un'affinità o un profilo emotivo che nessuno ha valutato.
- L'importazione **non modifica i film già presenti**, compresi voti personali, preferiti e note.
- Non viene salvato alcun token TMDB nel progetto, nelle richieste a server Emoteca, in `localStorage` o in `IndexedDB`.

### Sicurezza e limiti

- I testi dei risultati remoti sono escaped prima di entrare nell'HTML; gli identificativi sono costruiti da ID normalizzati, non da input non affidabili.
- Il browser effettua le richieste direttamente ai provider, quindi questi vedono IP e termini cercati secondo le loro informative.
- Rate limiting e disponibilità dipendono dai servizi. Per uso pubblico di alto volume serve un backend di caching/proxy conforme ai termini, con controllo degli errori, retry e backoff.
- Evitare scaricamenti massivi con lo strumento di ricerca browser. Per un archivio locale realmente ampio usare dump Wikidata e pipeline backend, non lo SPARQL endpoint per batch globali.
- Le schede iniziali e i backup restano compatibili con il formato storico `afterframe-catalog` e i database IndexedDB `afterframe-catalog-v1`, intenzionalmente non rinominati per evitare perdita di dati.
- Il limite di import JSON (2 MB) e i limiti per operazioni batch restano invariati.

## Interfaccia aggiornata (UX v2)

La grafica descritta nella prima iterazione è stata sostituita integralmente dalla nuova architettura "cinema-first": non sono più presenti sidebar, card statistiche, hero con slogan o fogli CSS sovrapposti. La nuova interfaccia è documentata in [UX-REDESIGN-V2.md](UX-REDESIGN-V2.md).

L'integrazione dei provider descritta sopra resta invariata.

## Miglioramenti da valutare dopo la PR

- Migrazione facoltativa a Spring Boot + PostgreSQL per **catalogo indicizzato locale** (es. dump Wikidata filtrati, ricerca full-text e aggiornamenti incrementali), con cache e provider abstraction.
- Arricchimento dei dati tramite TMDB solo per utenti che lo configurano e nel rispetto dei termini.
- Indice multipiattaforma/autenticazione per la **libreria personale** senza confondere i dati pubblici con note private.
- Verifica E2E nel browser su desktop/iOS/Android, inclusi fallimenti di rete, caching, popup, tastiera e licenze immagini.

## Verifiche consigliate

1. Su una installazione già usata, il catalogo IndexedDB e le note personali sono ancora presenti.
2. "Esplora film" → Wikidata → cerca `Interstellar` → aggiungi → titolo visibile nella libreria senza duplicati.
3. Chiudi/riapri il browser: l'import resta, mentre il token TMDB non viene conservato.
4. Prova un titolo senza anno: import disabilitato (nessun anno inventato).
5. Filtri, ricerca locale, preferiti, valutazioni e import/export JSON continuano a funzionare.
6. Desktop e mobile: sidebar, popup, input, focus tastiera e copertine.
