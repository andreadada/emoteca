# Emoteca — collegamento dei 34 titoli iniziali al catalogo mondiale

**Aggiornamento:** 4 novembre 2026. Implementazione: `js/catalog-identity.js`, `js/app.js`, `js/remote-catalog.js`.

## Obiettivo

I 34 titoli editoriali iniziali non sono 34 opere diverse dai film/serie del catalogo globale. Un titolo della libreria con stato `watched` deve comparire su **Tutti i film** come **Già visto**, e un titolo `watchlist` come **Da guardare**. Aprire il risultato globale deve condurre alla **scheda personale esistente** e non presentare l'azione "Aggiungi alla libreria".

**Due identità:**
- `id`: identificativo stabile locale (`code-geass-2006`, `your-name-2016`, ecc.). Mantenerlo garantisce compatibilità URL, note, voti e backup.
- `catalogId`: ID canonico esterno verificato, ad esempio `tmdb-tv-123` o `tmdb-movie-456`. È **opzionale** finché il titolo non viene associato con sicurezza.

Non rinominare `id` di vecchi film in `tmdb-...`: si perderebbero la continuità di link e associazioni locali, e si rischierebbe di creare duplicati.

## Come viene associata una scheda

1. I film già salvati sono riconosciuti dal medesimo `catalogId`; se il titolo non è ancora associato, la ricerca usa **anno esatto**, **stesso medium movie/TV** e **titolo o alias esatto** (`title` / `posterQuery` / `originalTitle`) prima di considerarlo lo stesso.
2. Il formato personale `anime` è trattato come **TV** su TMDB e `film-anime`/`film-animazione` come **movie**. Non confrontare `anime` con `serie` come stringhe distinte.
3. Quando TMDB è disponibile sul server, un job **non bloccante** risolve progressivamente i seed privi di `catalogId`: per ciascuno interroga TMDB tramite il proxy, filtra per anno e medium, accetta una corrispondenza esatta/unica sicura e, se possibile, recupera i dettagli con `/detail`.
4. I metadati confermati vengono copiati nelle schede seed solo dove non risultano modifiche dell'utente: **descrizione, genere, durata, locandina ufficiale, sfondo e collegamento TMDB**. Vengono aggiunti `catalogSource`, `catalogTitle`, `backdrop` e `catalogId`.
5. **Mai toccare** con la sincronizzazione `status`, `reaction`, `rating`, `notes`, `favorite`, `why`, `tags`, `match`, `scores`, `year` o `id`. I campi editoriali mantengono il loro significato personale.
6. La scrittura locale è serializzata e usa lo stato più recente al momento del salvataggio, per non sovrascrivere una nota inserita mentre arrivano risultati API. La riconciliazione non chiude la scheda aperta e non cancella input in corso.
7. I risultati globali indicano visivamente **Già visto**, **Da guardare** o **In corso**; il pulsante di importazione è disabilitato se il film è già salvato.

## Cosa succede senza TMDB

Wikidata resta una fonte aperta senza token e il matching titolo/anno/medium continua a funzionare quando ci sono metadati sufficienti. La sincronizzazione automatica massiva dei seed richiede TMDB configurato: non si devono inventare ID né dichiarare 34/34 collegati senza averlo verificato sul dominio finale.

TMDB può restituire titoli localizzati o alternativi e potrebbe non identificare automaticamente alcune opere. Un mancato match **non crea una nuova scheda**, non sovrascrive quella originale e non viene forzato in base a una semplice somiglianza del titolo. Sono disponibili i link a TMDB quando il titolo è stato verificato.

**Caso particolare:** `Naruto / Naruto Shippuden` è una singola scheda personale storica che aggrega due serie TMDB diverse; il resolver può associare la serie `Naruto` (2002), ma questo **non equivale** ad associare automaticamente anche `Naruto Shippuden` (2007). Va eventualmente separato con consenso e migrazione del diario personale.

## Test e verifica post-deploy

La suite Node include matching semantico e sicurezza dei campi personali. Il test Chromium con TMDB simulato copre `Code Geass`, `Your Name` e un film esterno non salvato, verificando badge, URL locale stabile, assenza di duplicati e note persistenti.

Dopo il deploy su Coolify (con `TMDB_READ_TOKEN`):
- Fare backup JSON dalla UI **prima di aggiornamenti manuali ai dati**.
- Controllare `/api/catalog/status` e una ricerca reale.
- Cercare `Code Geass` in **Tutti i film**: deve aprire la scheda già salvata (`?film=code-geass-2006`), **non** proporre di aggiungerlo.
- Cercare `Your Name`: deve mostrare **Già visto** senza cambiare la reazione personale.
- Cercare `Resident Evil` (2026): deve restare non salvato se non è già in libreria.
- Verificare numero di titoli invariato, voto/note dopo refresh e link TMDB sulle schede effettivamente riconciliate.
- Verificare eventuali titoli non riconosciuti: **non esiste garanzia di 34/34 match automatici**; richiedono revisione dei metadati/corrispondenza specifica.

Non è stato testato il dominio di produzione con un token TMDB reale in questa sessione. I test CI usano risposte fittizie per non condividere credenziali.
