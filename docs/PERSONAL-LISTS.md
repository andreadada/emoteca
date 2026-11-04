# Emoteca — Liste personali multiple

**Versione:** 4 novembre 2026. **Stato:** implementazione unita a `main` con [PR #9](https://github.com/andreadada/emoteca/pull/9), commit funzionale `2b787e5`. Il deploy e la prova in produzione su Coolify restano da verificare.

## Modello del prodotto

- **Tutti i film** è il catalogo mondiale remoto TMDB con fallback Wikidata.
- **Le mie liste** è il punto in cui organizzare i titoli personali in raccolte con nomi liberamente scelti. La prima lista si chiama **La mia lista** e contiene *tutti i film già salvati al momento dell'aggiornamento*: nessuna eliminazione.
- Le sezioni **Da guardare**, **Visti** e **Preferiti** sono viste degli stati/contrassegni della libreria personale, **non** raccolte separate.
- Un titolo può appartenere a più liste, senza copie della scheda: voto, note, stato visto, preferito, locandina e metadati sono unici.

## Funzionalità

1. Clic su **Le mie liste**: appare barra con raccolte e relativo conteggio. Cliccando una raccolta si vedono solo le sue opere, con i precedenti filtri per formato/tema/ricerca.
2. **Nuova lista**: modal compatta per il nome (1–60 caratteri). Massimo 30 liste; nomi duplicati non ammessi.
3. **Rinomina lista**: cambia soltanto il nome; non gli identificativi o la composizione.
4. **Elimina lista**: richiesta di conferma. La prima lista non può essere eliminata. Le schede film, stati, voti e note rimangono nel database personale.
5. **Scheda di un film**: i chip con i nomi delle liste permettono di aggiungere/togliere quel titolo da più liste. Nella griglia della lista selezionata è presente **Rimuovi dalla lista**, che non elimina la scheda.
6. **Film esterno nuovo**: scegli la lista nel campo «Salva nella lista» della pagina film prima di aggiungerlo. L'azione rapida '+' nella griglia globale usa l'ultima lista attiva (o la prima di default). Se il film è già stato salvato, non si genera un duplicato: puoi aggiungere altre membership dalla scheda.
7. Le liste restano disponibili dopo un refresh; i link delle liste personalizzate sono `#list:<id>`, il link `#all` apre la lista corrente o quella iniziale.

## Persistenza e migrazione

**Regola primaria:** non cambiare la struttura dei film esistenti né il DB `afterframe-catalog-v1`. I film sono ancora nell'array IndexedDB `state/all-films`, con la forma precedente.

Le liste vivono separatamente nella **stessa** IndexedDB `state/personal-lists-v1`, come array:

```json
[
  {
    "id": "mia-lista",
    "name": "La mia lista",
    "filmIds": ["warrior-2011", "your-name-2016"]
  },
  {
    "id": "lista-<uuid>",
    "name": "Serata horror",
    "filmIds": ["warrior-2011"]
  }
]
```

L'esempio mostra solo alcuni titoli. Nel primo avvio dopo l'aggiornamento, se la chiave delle liste non è presente, viene creata la lista iniziale con **tutti gli ID dei film salvati**, compresi i 35 o più già presenti nel browser. Gli ID film locali non vengono riscritti. Se il record liste è presente ma invalido, **non** viene sovrascritto automaticamente: mostrata una notifica di errore e fallback in memoria.

Il fallback quando IndexedDB non è disponibile usa `localStorage/emoteca-personal-lists-v1`. Un salvataggio simultaneo di film+liste usa la transazione `CatalogDB.writeSnapshot` nel medesimo object store, per prevenire aggiornamenti parziali del database IndexedDB.

### Backup e importazione

Il pulsante esistente **Backup dei dati → Esporta** genera ancora un JSON `format:'afterframe-catalog'`, `version:1` con i campi `films` **e** `lists`. I vecchi backup con soli `films` sono compatibili: durante una sostituzione si crea automaticamente la lista iniziale con tutte le opere importate.

Le importazioni `replace` sostituiscono **film e liste** e richiedono doppia attenzione al backup; l'anteprima indica la sostituzione. Le importazioni per operazioni aggiornano i film in modo coerente, ripulendo riferimenti a film eliminati e assegnando nuovi titoli alla lista attiva. Non esiste un server di sincronizzazione fra dispositivi: tutto resta nello stesso browser e origine.

### Vincoli

- Fino a 30 liste con un massimo di 3000 titoli per lista, nomi massimi 60 caratteri.
- Un film può essere rimosso da tutte le liste, ma mantenere il proprio diario personale: non si effettua cancellazione implicita del film.
- Per cancellare una **scheda** e i suoi dati esiste il precedente comando esplicito **Elimina scheda**: mantiene la conferma e toglie gli ID dalle liste.
- Le funzioni di ricerca globale, TMDB/Wikidata, filtri dei generi e paginazione non sono toccate.

## Verifiche

La CI `node --test tests/*.test.mjs` verifica immutabilità della libreria, deduplicazione membership, nomi non duplicati, normalizzazione e backup. Playwright Chromium (Docker) verifica migrazione dei seed, nuova lista, aggiunta di un film esistente tramite scheda, rimozione, rinomina, eliminazione, persistenza dopo refresh e navigazione mobile.

**Smoke test manuale dopo il deploy Coolify:** sullo stesso browser del sito `film.ddone.it` apri Le mie liste: il numero di film della prima lista deve corrispondere alla precedente libreria. Crea una seconda lista, aggiungi un film da Tutti i film, modifica una nota, sposta la membership, esporta il backup JSON e verifica che nessuna scheda o nota sia scomparsa. Non resettare IndexedDB per testare la migrazione. Esegui **Redeploy** dal branch `main` solo dopo CI verde e merge.
