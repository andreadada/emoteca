# Emoteca — Temi, nuova scheda film e account Google

**Implementazione:** PR #11 (`feat/dark-backdrop-google-accounts`), 4 novembre 2026. Google login **non funziona in produzione finché non sono configurate le credenziali e PostgreSQL su Coolify**. Il dominio non è stato modificato da questa chat.

## Aspetto e scheda film

- Tema **Scuro** predefinito, **Chiaro** opzionale. Selezione nell'header via `js/theme.js`, salvata sul dispositivo in `localStorage/emoteca-color-theme` (non è un dato sensibile e non viene inviato a Google).
- `styles-personalization.css` contiene i token e override dark e il layout dettaglio, caricato dopo `styles-reframe.css`. Docker lo copia in Nginx.
- La scheda film mostra **`backdrop_path` di TMDB** come sfondo esteso all'intero viewport della pagina, con gradiente per il contrasto del testo e fallback grafico se non è disponibile. Il backdrop è un'immagine decorativa (alt vuoto). La locandina rimane separata.
- `GET /api/catalog/detail` ora usa `append_to_response=credits,videos`, quindi restituisce **regia, sceneggiatura, cast (max 8), voto TMDB e link al trailer YouTube ufficiale** ove disponibili. Il frontend presenta questi dati come sezioni editoriali (non inventa dati quando l'API non li fornisce).
- Per i film preesistenti il collegamento `catalogId` permette di recuperare i dettagli remoti senza alterare i voti e le note.

## Accesso Google: architettura

**Non usare un Google access token in localStorage per le sessioni.**

`js/cloud.js` usa il pulsante ufficiale Google Identity Services, che restituisce un **ID token** al backend. Il backend:
1. Controlla **CSRF double-submit e Origin** della richiesta.
2. Verifica firma RS256 dell'ID token con le chiavi pubbliche Google (JWKS), audience `GOOGLE_CLIENT_ID`, issuer, scadenza, email verificata e `sub`. L'email **non** è la chiave primaria: si usa il `sub` di Google.
3. Crea sessione casuale lunga 256 bit, ne memorizza solo l'hash SHA-256 in PostgreSQL; invia un cookie sessione **HttpOnly, Secure, SameSite=Lax** valido 14 giorni.
4. Partiziona tutti i documenti per `google_sub`, individuato esclusivamente dalla sessione autenticata.
5. Usa versioni ottimistiche su `/api/user/data`: se due dispositivi salvano la stessa revisione, il secondo riceve `409` e **non sovrascrive** il primo.

I dati dell'utente vengono archiviati in PostgreSQL con tabelle `emoteca_users`, `emoteca_sessions` e `emoteca_documents`. Quest'ultima conserva JSONB `films` e `lists`. Non è necessario salvare JWT Google nel database. Non sono richiesti scope di Google Drive, Gmail o altri dati Google.

## Configurazione Coolify

### 1. Database

Crea un servizio **PostgreSQL persistente**, con volume/backups, e collega Emoteca mediante una stringa di connessione interna di Coolify.

Variabile da impostare sul container Emoteca:

```text
DATABASE_URL=postgresql://<utente>:<password>@<host-interno>:5432/<database>
```

La password è un **segreto di ambiente**, mai nel repository. Backup e ripristino del database restano responsabilità della configurazione Coolify. Non usare il filesystem effimero del container per memorizzare gli account.

### 2. Google Cloud Console

Crea un progetto Google, configura **Google Auth Platform / schermata di consenso OAuth** e un **Client ID di tipo Applicazione web**. Imposta esattamente l'origine JavaScript autorizzata:

```text
https://film.ddone.it
```

Google Identity Services opera con popup e callback JavaScript: questo flusso non richiede una redirect URI sul sito. Per l'utilizzo pubblico, configura il pubblico e gli eventuali requisiti di branding, informativa privacy e verifica previsti da Google.

Variabile sul container Emoteca:

```text
GOOGLE_CLIENT_ID=<client-id>.apps.googleusercontent.com
```

Nessuna variabile `GOOGLE_CLIENT_SECRET` è necessaria per questo flusso di autenticazione. **Non configurare token o password Google nel frontend.**

### 3. Deployment

- Branch `main`, dopo merge PR #11 e CI verde.
- Lascia `TMDB_READ_TOKEN` configurato come prima; non è collegato al login.
- Esegui Redeploy sul servizio Emoteca. `server/package.json` installa `pg` durante il Docker build; server e account API utilizzano la stessa porta interna 8787, con proxy Nginx per `/api/user/` e `/api/catalog/`.
- Verifica `https://film.ddone.it/api/user/config`: `enabled:true` e `googleClientId` pubblico devono comparire **solo se PostgreSQL e Client ID sono impostati**. La risposta contiene un token CSRF per il browser.
- Verifica `/api/user/session` (senza accesso restituisce `user:null`), quindi prova l'accesso in un browser e il refresh con sessione persistente.
- Controlla che `/styles-personalization.css` risponda HTTP 200.

## Migrazione da IndexedDB locale

**Mai cancellare automaticamente dati del browser.**

L'accesso crea un archivio cloud personale inizialmente vuoto. Se questo è **vuoto e alla revisione 0**, mentre nel browser esistono titoli locali, si propone **Importa dati locali** / **Continua senza importare**. Solo dopo click esplicito su Importa viene inviata una copia di film e liste al server. Il database locale non viene cancellato.

Se il documento cloud contiene già dati, **non compare la migrazione automatica** e il cloud viene caricato come fonte autorevole per quell'account. Dopo logout il browser continua a contenere la precedente copia locale. Le modifiche fatte da account Google **non sono replicate automaticamente nel guest**.

Il client di storage `js/db.js` instrada le letture e scritture in base alla sessione, senza modificare il formato dei film, dei voti, delle note e delle liste. I backup JSON restano disponibili.

Il sistema **non implementa ancora merge intelligente tra due librerie non vuote**. Per importare una libreria quando il cloud è già popolato serve un flusso di merge con anteprima e conferma, da sviluppare separatamente; non sovrascrivere automaticamente il documento cloud.

## API utente

| Endpoint | Metodo | Risultato |
| --- | --- | --- |
| `/api/user/config` | GET | Disponibilità, Client ID pubblico e CSRF browser |
| `/api/user/session` | GET | Profilo dell'account autenticato o null |
| `/api/user/login` | POST | Verifica ID token e crea sessione |
| `/api/user/logout` | POST | Revoca sessione e cancella cookie |
| `/api/user/data` | GET | Snapshot di film, liste, versione personale |
| `/api/user/data` | PUT | Salva lo snapshot, solo con versione attuale e CSRF |

Con auth non configurato gli endpoint privati rispondono `503`, senza fingere che il login sia disponibile.

## Test e vincoli prima del rilascio

1. `node --test tests/*.test.mjs`: API TMDB e OAuth disabilitato, validazione asset/JS, migrazione e privacy cloud.
2. Test Chromium desktop e mobile: prima visita dark, passaggio a light, refresh, backdrop a tutta larghezza, film con cast/trailer, assenza di overflow, login non configurato dichiarato come tale.
3. Test **manuale reale** (richiede credenziali e PostgreSQL): sign-in, consenso importazione locale, 35 film/memorie, aggiunta lista, voto e note, browser secondo/dispositivo, logout e controllo dati guest invariati.
4. Test concorrenza: due tab account devono ricevere un `409` se un documento più recente è già stato salvato. Nessun merge o overwrite automatico.
5. Verificare backup PostgreSQL, HTTPS, log di produzione e domini Google autorizzati.

## Handoff

Se la UI è pronta ma il login mostra «Per attivare Google configura le credenziali su Coolify», **non è un errore del frontend**: mancano almeno una delle variabili obbligatorie. Non dichiarare che gli account cloud funzionino in produzione se non sono stati provati realmente. Non chiedere all'utente un client secret per inserirlo in git.
