# Emoteca 3.0 — Worldwide catalog architecture

> **Stato canonico e operazioni (4/11/2026):** [PROJECT-HANDOFF.md](PROJECT-HANDOFF.md) · [DEPLOY-COOLIFY.md](DEPLOY-COOLIFY.md). Questa pagina documenta il funzionamento tecnico; deploy live e credenziale TMDB reale non risultano verificati.

## User goals

The previous implementation only searched 34 locally saved titles, showed an external-search modal and had no guarantee of poster coverage. The new architecture introduces a dedicated browse/search page, linked film pages, rotating recommendations and server-side metadata access.

### Distinguish two datasets

1. **Worldwide browse catalog**: remote, never stored in the browser in bulk; provider-aware, paginated when supported.
2. **Personal library**: persisted via existing IndexedDB `afterframe-catalog-v1` with JSON import/export; statuses, reactions, favorites, votes, and notes stay on the user's device.

**Coverage statement:** there is no database containing literally every film or every poster ever produced. TMDB covers many international titles but has missing/incorrect entries; Wikidata is open, but its MediaWiki search and image completeness are limited. Do not claim universal completeness.

## Data providers

| Provider | Authentication | Browse | Search | Posters | Notes |
|---|---|---|---|---|---|
| TMDB via Emoteca proxy | `TMDB_READ_TOKEN` server env | `/discover/movie`, `/discover/tv`, pages 1–500 | `/search/multi` or movie/tv | `image.tmdb.org` if present | Requires attribution and noncommercial developer license |
| TMDB direct, personal token | Token in runtime memory only | Same | Same | Same | Browser makes requests directly to TMDB. Personal use only, subject to TMDB policies |
| Wikidata | None | No complete browsing through API | `wbsearchentities` + `wbgetentities` | Commons files on individual licences | Up to 50 candidate matches from search API; CC0 structured data |

Avoid crawling IMDb's public website or redistributing their non-commercial TSV datasets in a public catalog.

## Production deployment (Coolify)

Existing public port **80** remains unchanged. **Coolify build strategy must be Dockerfile**, base `/`, Dockerfile `/Dockerfile`, Ports Exposes `80`. Runtime secret `TMDB_READ_TOKEN` (Build-time OFF). Deployment instructions: [DEPLOY-COOLIFY.md](DEPLOY-COOLIFY.md).

- Docker image: `nginx:stable-alpine` with `nodejs` installed.
- `/opt/emoteca/catalog-api.mjs` listens on `127.0.0.1:8787`.
- Nginx serves HTML/CSS/JS and reverse proxies `/api/catalog/*` to Node.
- Add **`TMDB_READ_TOKEN`** in Coolify environment variables. Do not commit the token, expose it as a frontend variable, or pass it to external clients.
- `GET /api/catalog/status` reports whether the proxy is configured but does not reveal the token.
- If missing, the proxy returns 503 on protected endpoints; the frontend uses Wikidata fallback and shows its limits.

## Filtri globali (v3.1)

Le schede del catalogo mondiale sono `all`, `movie`, `tv`, `anime`. `anime` include **sia film sia serie** il cui genere TMDB contiene `16` (animazione) e la lingua originale è `ja`. È una selezione convenzionale di anime giapponesi, non un indice esaustivo.

Entrambi gli endpoint `search` e `discover` accettano `genres` opzionale (es. `genres=horror,azione`), selezione OR sui generi disponibili per medium. L'API valida i nomi e il numero massimo dei tag. `/discover` usa `with_genres` direttamente in TMDB e combina movie/tv se necessario; `/search` filtra i risultati ritornati dalla pagina di ricerca, **non il database mondiale completo**, mantenendo paginazione e senza inventare totali filtrati.

`Horror` esiste come genere TMDB film 27, non come genere televisivo. Non approssimare le serie Mystery/Sci-Fi come Horror. Nel fallback Wikidata i temi non sono filtrabili in modo attendibile e la UI ne indica il limite. Controllare sempre post-deploy che le query reali rispondano con il token TMDB di Coolify.

## Endpoints

- `GET /api/catalog/status` — `{provider,enabled,message}`.
- `GET /api/catalog/search?q=...&page=1&type=all|movie|tv` — normalizes international search results, omits people/adult entries.
- `GET /api/catalog/discover?page=1&type=all|movie|tv` — il valore `all` usa il feed TMDB `trending/all/week` (film e serie); movie/tv usano `/discover/{type}` ordinato per popolarità, paginato.
- `GET /api/catalog/detail?type=movie|tv&id=123` — metadata and backdrop.
- `GET /api/catalog/poster?title=...&year=2016&type=movie` — requires exact title/original-title and matching year for poster enrichment (avoid incorrect artwork).

Properties returned: stable provider ID, title, original title, year, film/TV type, synopsis, poster/backdrop URLs, genre/duration when available, canonical TMDB link. Blank values are left blank; no fabricated plots, posters or release dates.

## UX

- **Home recommendation** chosen from `watchlist`/`watching` with `reaction=unseen`, random among eligible, excluding the previous featured ID stored only in `sessionStorage`. A watched title is never selected, and home hides the feature if every title was watched.
- **Header search** enters the global catalog after two characters rather than only the local library.
- **Catalog search** shows local matches in a separate horizontal rail, then the external results. The provider is labeled and missing covers use a typography fallback.
- **Film page** has a navigable URL `?film=<id>` and an explicit back action. Unadded films display facts and the **add to library** action, without pretending to have local ratings/notes. Added films display status, reaction, rating, private notes and editing.
- **Favorites and ratings** are persisted only after saving a film to the local library.
- **Film images** prioritize TMDB when configured; if legacy image URLs are broken, the app tries a provider lookup and specialized fallbacks. The UI must never guarantee poster coverage for unindexed titles.

## Performance, privacy, and security

- No full movie database download at runtime.
- API endpoint allowlist, input validation, bounded in-memory TTL cache (300 keys, 10 minutes) and request timeouts.
- Browser does not receive `TMDB_READ_TOKEN`; it only calls same-origin `/api/catalog/*`.
- Personal watch history, ratings, and notes never go to the server. Only search terms and public film identifiers go to TMDB or Wikidata.
- Provider credentials are never saved in IndexedDB, localStorage, sessionStorage, the repository, or export files.
- External UI text is HTML escaped; URL schemes for images/links are validated.
- Posters from TMDB and Commons require proper attribution; production or monetized deployments must satisfy each provider's license terms.

## Verification

Node syntax, smoke and mock TMDB integration tests:

```bash
node --test tests/*.test.mjs
```

GitHub Actions `ui-e2e.yml` builds the actual Dockerfile, boots Nginx and the API proxy, runs Chromium desktop/mobile flows with simulated Wikidata results (to avoid flaky external dependencies), and uploads screenshots.

Manual production acceptance checks **still pending** after deploying with a real token:
- `/api/catalog/status` shows `enabled:true`.
- Search `Your Name`, `La dolce vita`, `Interstellar` and obscure Italian titles. Confirm localized and original titles work.
- Change film/TV filter and page through results.
- Confirm TMDB posters show, and no generated covers are used when metadata lacks imagery.
- Open a film in a separate tab by its URL and return via the explicit back action.
- Mark a film as watched, refresh, and ensure it cannot appear in the homepage recommendation.
- Export local JSON backup and reimport; verify no data loss.

## Known limitations

- Wikidata text search is not a complete catalog dump and may omit films/years/posters; missing year blocks automatic import.
- TMDB free usage is restricted to non-commercial use with attribution; commercial projects need a negotiated license.
- TMDB caps certain result sets to 500 pages and results are ranked/filtered by API; no provider can return absolutely every movie.
- Personal library stays browser-local: no accounts/sync until implemented separately.
- The Nginx/Docker healthcheck currently confirms that the homepage responds, **not** that the Node catalog proxy can answer live requests; improve this as a P1 task.
- Frontend-only local development uses Wikidata unless a personal token is supplied; production TMDB requires server configuration.
