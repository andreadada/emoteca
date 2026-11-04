# Deploy Emoteca 3.0 su Coolify (runbook operativo)

**Ultimo controllo documentale:** 4 novembre 2026. **Repository:** [andreadada/emoteca](https://github.com/andreadada/emoteca), branch di produzione `main`. **Sorgente canonica sullo stato:** [PROJECT-HANDOFF.md](PROJECT-HANDOFF.md).

> Questa è una guida, non la conferma che il sito sia già pubblicato. Il deploy reale, il dominio scelto e la disponibilità con un token TMDB valido devono ancora essere verificati dall'operatore. Non pubblicare mai token in repository, screenshot, chat, log o comandi condivisi.

## 1. Che cosa viene eseguito

**Un'unica Application Dockerfile su Coolify**, non un progetto Static/Nixpacks/Railpack, non due applicazioni distinte.

```text
Utente -> HTTPS / dominio -> Coolify Proxy (Traefik/Caddy)
                                    |
                                    v
                           Container Emoteca
                         Nginx :80 (pubblico)
                            |            |
                            |            +--> HTML, CSS, JavaScript
                            |
                            +--> /api/catalog/* -> Node.js 127.0.0.1:8787
                                                       |
                                                       v
                                                 TMDB API HTTPS
```

- `Dockerfile` parte da `nginx:stable-alpine`, installa `nodejs`, copia l'app e avvia `server/start.sh`.
- `nginx.conf` espone internamente **porta 80**. Le richieste `/api/catalog/*` sono inoltrate all'API Node sulla sola interfaccia loopback **8787**. La porta 8787 **non deve essere pubblicata o mappata da Coolify**.
- `server/catalog-api.mjs` carica `TMDB_READ_TOKEN` **a runtime**. Senza token l'endpoint `/api/catalog/status` risponde ma segnala `enabled: false`; la ricerca frontend passa a Wikidata.
- Nessun database PostgreSQL/MySQL, volume persistente o servizio Redis è richiesto dall'attuale implementazione. Valutazioni, preferiti, reazioni e note sono salvati nell'**IndexedDB del browser**, con fallback localStorage.
- Sito e API utilizzano lo stesso dominio: non configurare un sottodominio API separato e non esporre una chiave nel frontend.

## 2. Se non hai ancora una Application Emoteca

Repository pubblico verificato il 4/11/2026: `https://github.com/andreadada/emoteca`.

1. In Coolify apri **Projects → progetto desiderato → ambiente (es. production) → + New**.
2. Scegli **Public Repository**, seleziona il server di destinazione e incolla l'URL HTTPS del repository. Clicca **Check Repository**.
3. Scegli il branch **`main`** e **Build pack: `Dockerfile`** (in alcune UI: *Build strategy*).
4. Imposta la directory base del repository a **`/`**, la posizione Dockerfile a **`/Dockerfile`** e la porta interna **Ports Exposes = `80`**.
5. Salva/Continua e apri **Environment Variables**; configura il token come indicato nel paragrafo seguente.
6. Aggiungi un dominio (o usa il dominio di prova generato), salva e premi **Deploy**.
7. In **Deployment Logs** verifica quale commit `main` è stato scaricato e che il build Docker termini correttamente.

**Per test iniziale senza DNS** puoi usare il dominio temporaneo `sslip.io` generato da Coolify, se disponibile nel tuo server. Per la produzione usa un tuo sottodominio HTTPS.

Guida ufficiale: [Coolify – Public GitHub repository](https://coolify.io/docs/applications/sources/github/public-repository), [Dockerfile build](https://coolify.io/docs/applications/builds/dockerfile).

## 3. Se hai già una Application Emoteca

**Non creare un secondo servizio** se vuoi semplicemente aggiornare quello che esiste.

1. Apri l'app Emoteca in Coolify → **General / Build pipeline**.
2. Conferma repository, **branch `main`**, **Dockerfile**, base **`/`**, Dockerfile **`/Dockerfile`**, **Ports Exposes `80`**.
3. Se in precedenza hai usato il build pack Static/Nixpacks, cambia a Dockerfile: Emoteca 3.0 usa anche Node per l'accesso a TMDB.
4. Verifica il dominio e l'assenza di host-port mappings manuali non necessari.
5. Aggiungi la variabile TMDB (paragrafo 4), salva e usa **Redeploy**. Controlla i deployment logs.

Non eliminare l'app precedente prima di aver esportato eventuali dati locali dal suo dominio/browser.

## 4. Variabili d'ambiente

| Nome | Necessaria? | Valore | Ambito |
| --- | --- | --- | --- |
| `TMDB_READ_TOKEN` | **Sì**, per la ricerca TMDB globale completa | API Read Access Token TMDB, senza la stringa `Bearer ` | **Runtime ON**, **Build-time OFF**, segreta/locked |
| `CATALOG_PORT` | No | Default già incluso: `8787` | Runtime; **non modificarla** senza aggiornare Nginx |

1. Ottieni la credenziale dalle [impostazioni API TMDB](https://www.themoviedb.org/settings/api). Occorre un account TMDB. Se la licenza d'uso della tua app è commerciale, fermati e valuta l'accordo necessario.
2. Coolify → Emoteca → **Environment Variables** → **Normal view** → Add:
   - **Name:** `TMDB_READ_TOKEN`
   - **Value:** il token (non aggiungere virgolette, `Bearer` né spazi finali)
   - **Build-time** disattivato; **Runtime** attivo; se disponibile, valore **Secret/Locked**.
3. Salva e **Redeploy**. Una modifica runtime potrebbe poter essere applicata con Restart, ma in questa release è consigliabile il redeploy della build più recente.

**Non** usare `NEXT_PUBLIC_*`, `VITE_*`, build args, repository secrets trasformati in file JS o variabili accessibili al browser. Non inserire token nei report di diagnostica.

Guida ufficiale: [Coolify – Environment Variables](https://coolify.io/docs/applications/configuration/environment-variables).

## 5. Dominio e SSL

- Configura il record **DNS A** del sottodominio scelto verso l'IP del server su cui è deployata Emoteca (e AAAA solo se l'IPv6 è configurato correttamente). L'indirizzo reale non è documentato qui perché non è stato verificato.
- Nel menu **Domains** dell'Application: **Add domain**, protocollo **HTTPS**, hostname desiderato, porta di destinazione **80**.
- Il firewall del server deve permettere traffico verso il **proxy Coolify** sulle porte pubbliche 80/443. **Non** aprire pubblicamente 8787.
- Dopo salvataggio dei domini esegui **Redeploy** e verifica certificato e sito.

Guida: [Coolify – Domains](https://coolify.io/docs/core/networking/domains).

## 6. Verifiche dopo il deploy

Usa il **tuo** indirizzo HTTPS al posto di `TUO-DOMINIO`. Verifica il tutto prima di dichiarare la pubblicazione riuscita:

```bash
curl -i https://TUO-DOMINIO/api/catalog/status
curl -i "https://TUO-DOMINIO/api/catalog/search?q=Interstellar&page=1&type=movie"
curl -i "https://TUO-DOMINIO/api/catalog/discover?page=1&type=all"
```

Con token TMDB funzionante, il primo endpoint dovrebbe essere HTTP 200 e restituire qualcosa come:

```json
{"provider":"tmdb","enabled":true,"message":"Catalogo TMDB disponibile."}
```

Questo **conferma solo che la variabile è presente**, non che TMDB la accetti: il secondo e terzo endpoint devono restituire risultati validi con `items` e `totalPages`. Non loggare mai il token.

### Checklist di accettazione manuale

- [ ] Sito HTTPS raggiungibile e senza errori console critici.
- [ ] `/api/catalog/status` risponde; `enabled: true` con token impostato.
- [ ] Cerca `Interstellar`, `Your Name`, `La dolce vita` e un film italiano poco noto: titoli, descrizioni e locandine corrette **ove presenti nella fonte**.
- [ ] Cambia tra film, serie, film+serie e usa **Mostra altri film**.
- [ ] Apri una scheda film: **è una pagina con URL `?film=...`**, non un popup; prova refresh, avanti/indietro.
- [ ] Aggiungi un film, segna come visto, imposta voto e note, ricarica: stato e note restano.
- [ ] Il film consigliato in homepage cambia tra visite/refresh ed esclude i visti; le immagini non si rompono.
- [ ] Controlla mobile (390 px circa): nessun overflow, navigazione e scheda accessibili.
- [ ] Esegui **Esporta backup JSON**; su un'altra origine/browser importa esplicitamente la copia. **Non** eseguire Ripristina catalogo iniziale per fare test se ci sono dati reali.

### Dati salvati su un altro dominio

IndexedDB è legato a **origine + browser + profilo**: un nuovo hostname, anche sullo stesso server Coolify, non vedrà automaticamente i vecchi voti. Esporta/importa il backup dalla UI. Cambiare immagine Docker o fare rollback non recupera dati cancellati nel browser.

## 7. Errori tipici e ripristino

| Sintomo | Controllo | Azione |
| --- | --- | --- |
| Build fallisce | Deployment Logs | Assicurati che il build pack sia **Dockerfile**, percorso `/Dockerfile`, repo radice. |
| Sito non raggiungibile / 502 | Domain, proxy, Ports Exposes | In Coolify il target è **80**, non 8787; controlla DNS e proxy. |
| Homepage funziona, `/api/catalog/status` restituisce 502 | Container API interna non pronta o non avviata | Leggi **Runtime Logs**; subito dopo lo start può esserci un breve intervallo prima che Node ascolti. Se persiste, controlla processo Node e avvio `server/start.sh`. |
| `enabled: false` | Runtime env | Verifica il nome esatto `TMDB_READ_TOKEN`, scope Runtime e riavvio/redeploy. |
| `enabled: true`, ricerca fallisce | Token TMDB / API | Verifica con `/api/catalog/search`; una variabile presente non garantisce un token valido; possibili rate limit/errori upstream. |
| Nessun risultato, poche locandine | Ricerca in modalità Wikidata | Connetti TMDB o usa il titolo originale. Nessun provider ha tutte le locandine. |
| Voti o preferiti scomparsi | Origine/Browser | Torna al browser/dominio originario ed esporta il JSON. Non cancellare i dati del sito. |
| Deploy regressivo | Coolify → Rollback | Ripristina **una vecchia immagine** se disponibile, controllando che la configurazione runtime sia compatibile. Il rollback dell'immagine **non** ripristina IndexedDB. |

**Automatic deploy:** una Public Repository configurata con URL HTTPS non attiva automaticamente i webhook. Per i deploy su push usa l'integrazione GitHub App o configura un webhook e **Advanced → Deployment → Deploy on push (webhooks)**. Non assumere che il merge su `main` deployi automaticamente. Guide: [Auto deploy](https://coolify.io/docs/applications/sources/github/auto-deploy), [Rollbacks](https://coolify.io/docs/applications/deployments/rollbacks).

## 8. CI e come testare localmente

- `node --test tests/*.test.mjs`: test sintattici, API mock, compatibilità dati.
- `.github/workflows/smoke.yml`: esegue la suite a ogni push su `main`/feature branch e PR.
- `.github/workflows/ui-e2e.yml`: su PR/manuale costruisce **lo stesso Dockerfile**, avvia il container su porta locale **8000 → 80**, verifica `/api/catalog/status` e usa Chromium desktop/mobile. I risultati esterni Wikidata sono *simulati*: non equivalgono a un test live TMDB.
- Test locale opzionale:

```bash
docker build -t emoteca-local .
docker run --rm -p 127.0.0.1:8080:80 -e TMDB_READ_TOKEN=IL_TUO_TOKEN emoteca-local
```

L'ultimo comando è **solo illustrativo**: evita di inserire token veri in shell history. Preferisci un file ambiente locale escluso da Git o un secret manager. Il sito sarebbe su `http://localhost:8080`, e `/api/catalog/status` sulla stessa origine.

## 9. Documenti collegati

- [PROJECT-HANDOFF.md](PROJECT-HANDOFF.md): stato, architettura e roadmap per la prossima chat.
- [CATALOG-V3.md](CATALOG-V3.md): dettagli fonti/endpoints/limiti.
- [UX-REDESIGN-V2.md](UX-REDESIGN-V2.md): scelte storiche UI; la v3 prevale quando ci sono conflitti.

Documentazione Coolify consultata il 4/11/2026; le etichette possono variare leggermente con la versione installata.
