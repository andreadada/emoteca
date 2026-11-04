/* Emoteca global film catalog: TMDB server proxy / personal token, with CC0 Wikidata fallback. */
(function () {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const safeImage = (value) => {
    try {
      const url = new URL(String(value));
      return url.protocol === 'https:' ? url.href : '';
    } catch { return ''; }
  };
  const fallbackTypes = new Map([
    ['Q11424', 'film'], ['Q202866', 'film-animazione'], ['Q24862', 'film'],
    ['Q506240', 'film'], ['Q9325864', 'film'], ['Q5398426', 'serie'],
    ['Q15416', 'serie'], ['Q21191270', 'serie'], ['Q1107', 'anime']
  ]);
  let token = '';
  let serverEnabled = false;
  let mode = 'wikidata';
  let query = '';
  let type = 'all';
  let page = 1;
  let pages = 1;
  let items = [];
  let request = null;
  let initPromise = null;
  let debouncer = null;
  let hasSearched = false;

  async function readJson(url, headers = {}, signal) {
    const response = await fetch(url, {
      method: 'GET', credentials: 'omit', headers: { Accept: 'application/json', ...headers }, signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || 'Il catalogo non è disponibile. Riprova più tardi.');
      error.status = response.status;
      throw error;
    }
    return payload;
  }
  function status(message, error = false) {
    const field = $('#catalog-feedback');
    if (field) {
      field.textContent = message;
      field.classList.toggle('error', error);
    }
  }
  function catalogMode() {
    return serverEnabled ? 'server' : token ? 'personal' : 'wikidata';
  }
  function tmdbItem(entry, selectedType) {
    const media = selectedType || entry.media_type;
    if (!['movie', 'tv'].includes(media) || entry.adult || !entry.id) return null;
    const title = media === 'tv' ? entry.name : entry.title;
    if (!title) return null;
    const date = media === 'tv' ? entry.first_air_date : entry.release_date;
    const year = /^\d{4}/.test(date || '') ? Number(date.slice(0, 4)) : null;
    const poster = /^\/[\w.-]+\.(jpg|jpeg|png|webp)$/i.test(entry.poster_path || '')
      ? 'https://image.tmdb.org/t/p/w500' + entry.poster_path : '';
    const backdrop = /^\/[\w.-]+\.(jpg|jpeg|png|webp)$/i.test(entry.backdrop_path || '')
      ? 'https://image.tmdb.org/t/p/w1280' + entry.backdrop_path : '';
    return {
      id: 'tmdb-' + media + '-' + entry.id, source: 'TMDB', sourceId: String(entry.id),
      provider: 'tmdb', media, title, originalTitle: media === 'tv' ? entry.original_name : entry.original_title,
      year, type: media === 'tv' ? 'serie' : 'film', description: entry.overview || '',
      poster, backdrop, sourceUrl: 'https://www.themoviedb.org/' + media + '/' + entry.id,
      duration: Number.isInteger(entry.runtime) && entry.runtime > 0 ? entry.runtime + ' min' : '',
      genre: Array.isArray(entry.genres) ? entry.genres.map((x) => x.name).filter(Boolean).join(' · ').slice(0, 100) : ''
    };
  }
  async function tmdbDirect(path, params, signal) {
    const url = new URL('https://api.themoviedb.org/3' + path);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    return readJson(url, { Authorization: 'Bearer ' + token }, signal);
  }
  async function remoteRequest(kind, args, signal) {
    const source = catalogMode();
    if (source === 'server') {
      const url = new URL('/api/catalog/' + kind, location.href);
      Object.entries(args).forEach(([key, value]) => url.searchParams.set(key, String(value)));
      return readJson(url, {}, signal);
    }
    if (source === 'personal') {
      if (kind === 'search') {
        const media = args.type === 'all' ? null : args.type;
        const result = await tmdbDirect(media ? '/search/' + media : '/search/multi',
          { query: args.q, page: args.page, language: 'it-IT', include_adult: 'false' }, signal);
        return { source: 'TMDB', items: (result.results || []).map((item) => tmdbItem(item, media)).filter(Boolean),
          page: result.page || 1, totalPages: Math.min(500, result.total_pages || 1), totalResults: result.total_results || 0 };
      }
      if (kind === 'discover') {
        const media = args.type === 'all' ? null : args.type === 'tv' ? 'tv' : 'movie';
        const result = await tmdbDirect(media ? '/discover/' + media : '/trending/all/week',
          { page: args.page, language: 'it-IT',
            ...(media ? { include_adult: 'false', sort_by: 'popularity.desc' } : {}) }, signal);
        return { source: 'TMDB', items: (result.results || []).map((item) => tmdbItem(item, media)).filter(Boolean),
          page: result.page || 1, totalPages: Math.min(500, result.total_pages || 1), totalResults: result.total_results || 0 };
      }
      if (kind === 'detail') {
        const result = await tmdbDirect('/' + args.type + '/' + args.id, { language: 'it-IT' }, signal);
        return { item: tmdbItem(result, args.type) };
      }
      if (kind === 'poster') {
        const media = args.type === 'tv' ? 'tv' : 'movie';
        const data = await tmdbDirect('/search/' + media, { query: args.title, page: 1,
          language: 'it-IT', include_adult: 'false', ...(args.year ? { year: args.year } : {}) }, signal);
        const clean = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .toLocaleLowerCase('it').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        const best = (data.results || []).map(x => tmdbItem(x, media)).filter(Boolean)
          .find(item => (clean(item.title) === clean(args.title) || clean(item.originalTitle) === clean(args.title))
            && (!args.year || item.year === Number(args.year)));
        return { item: best || null };
      }
    }
    throw Error('TMDB non configurato.');
  }

  function property(entity, id) {
    const claim = (entity.claims?.[id] || []).find(s => s.mainsnak?.snaktype === 'value');
    return claim?.mainsnak?.datavalue?.value || null;
  }
  function instances(entity) {
    return (entity.claims?.P31 || []).map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
  }
  function wikidataType(entity) {
    const all = instances(entity);
    for (const [id, filmType] of fallbackTypes) if (all.includes(id)) return filmType;
    return null;
  }
  function wikidataYear(date) {
    const value = String(date?.time || '');
    const m = value.match(/^[+-](\d{4})/);
    return m ? Number(m[1]) : null;
  }
  async function wikidataSearch(q, mediaType, signal) {
    const search = new URL('https://www.wikidata.org/w/api.php');
    Object.entries({ action: 'wbsearchentities', search: q, language: 'it', uselang: 'it',
      type: 'item', limit: '50', format: 'json', origin: '*' })
      .forEach(([key, value]) => search.searchParams.set(key, value));
    let found = await readJson(search, {}, signal);
    if (!(found.search || []).length) {
      search.searchParams.set('language', 'en');
      found = await readJson(search, {}, signal);
    }
    const ids = (found.search || []).map(x => x.id).filter(id => /^Q\d+$/.test(id));
    if (!ids.length) return { source: 'Wikidata', items: [], page: 1, totalPages: 1, totalResults: 0 };
    const details = new URL('https://www.wikidata.org/w/api.php');
    Object.entries({ action: 'wbgetentities', ids: ids.join('|'), props: 'labels|descriptions|claims',
      languages: 'it|en', format: 'json', origin: '*' })
      .forEach(([key, value]) => details.searchParams.set(key, value));
    const data = await readJson(details, {}, signal);
    const items = ids.flatMap(id => {
      const entity = data.entities?.[id];
      if (!entity || entity.missing !== undefined) return [];
      const kind = wikidataType(entity);
      if (!kind || (mediaType === 'movie' && kind === 'serie') || (mediaType === 'tv' && kind !== 'serie')) return [];
      const title = entity.labels?.it?.value || entity.labels?.en?.value || '';
      if (!title) return [];
      const filename = property(entity, 'P18');
      const poster = typeof filename === 'string' && filename.length < 190
        ? 'https://commons.wikimedia.org/wiki/Special:Redirect/file/' + encodeURIComponent(filename)
        : '';
      return [{
        id: 'wikidata-' + id.toLowerCase(), source: 'Wikidata', provider: 'wikidata',
        sourceId: id, media: kind === 'serie' ? 'tv' : 'movie', type: kind,
        title, originalTitle: title,
        description: entity.descriptions?.it?.value || entity.descriptions?.en?.value || '',
        year: wikidataYear(property(entity, 'P577')) || wikidataYear(property(entity, 'P571')),
        poster, backdrop: '', duration: '', genre: '',
        sourceUrl: 'https://www.wikidata.org/wiki/' + id
      }];
    });
    return { source: 'Wikidata', items, page: 1, totalPages: 1, totalResults: items.length };
  }
  async function wikidataDetail(id, signal) {
    if (!/^wikidata-q\d+$/.test(id)) return null;
    const key = id.slice(9).toUpperCase();
    const u = new URL('https://www.wikidata.org/w/api.php');
    Object.entries({ action: 'wbgetentities', ids: key,
      props: 'labels|descriptions|claims', languages: 'it|en', format: 'json', origin: '*' })
      .forEach(([k, v]) => u.searchParams.set(k, v));
    const response = await readJson(u, {}, signal);
    const entity = response.entities?.[key];
    if (!entity || !wikidataType(entity)) return null;
    const name = entity.labels?.it?.value || entity.labels?.en?.value;
    const filename = property(entity, 'P18');
    const poster = typeof filename === 'string' && filename.length < 190
      ? 'https://commons.wikimedia.org/wiki/Special:Redirect/file/' + encodeURIComponent(filename) : '';
    const kind = wikidataType(entity);
    return { id, source: 'Wikidata', provider: 'wikidata', sourceId: key,
      type: kind, media: kind === 'serie' ? 'tv' : 'movie', title: name,
      originalTitle: name,
      description: entity.descriptions?.it?.value || entity.descriptions?.en?.value || '',
      year: wikidataYear(property(entity, 'P577')) || wikidataYear(property(entity, 'P571')),
      poster, backdrop: '', duration: '', genre: '', sourceUrl: 'https://www.wikidata.org/wiki/' + key };
  }
  function displayLocal(q) {
    const section = $('#local-match-section');
    if (!section) return;
    const results = q.length >= 2 ? (window.AfterframeCatalog?.localMatches?.(q) || '') : '';
    section.hidden = !results;
    $('#local-matches').innerHTML = results;
  }
  function renderResults() {
    const grid = $('#global-grid');
    grid.innerHTML = items.map((film, index) => {
      const image = safeImage(film.poster);
      const savedFilm = window.AfterframeCatalog?.findSaved?.(film);
      const saved = Boolean(savedFilm);
      const savedLabel = savedFilm?.status === 'watched' ? 'Già visto' :
        savedFilm?.status === 'watching' ? 'In corso' : 'Da guardare';
      return `<article class="film-card global-film">
        <div class="film-cover">
          <button class="poster-wrap" data-global-open="${index}" type="button" aria-label="Apri la scheda di ${escapeHtml(film.title)}">
            <div class="poster-fallback"><strong>${escapeHtml(film.title)}</strong><span>${escapeHtml(film.year || '')}</span></div>
            ${image ? `<img class="poster-image" width="320" height="480" loading="lazy" decoding="async" alt="Locandina di ${escapeHtml(film.title)}" src="${escapeHtml(image)}" onerror="this.remove()" />` : ''}
            ${saved ? `<span class="film-flag"><span aria-hidden="true">✓</span> ${savedLabel}</span>` : ''}
          </button>
          <button class="card-favorite global-save ${saved?'is-fav':''}" type="button" data-global-save="${index}"
            aria-label="${saved?'Già nella libreria ('+savedLabel+'): ':'Aggiungi alla libreria: '}${escapeHtml(film.title)}" ${saved || !film.year ? 'disabled' : ''}>
            ${saved ? '✓' : '+'}
          </button>
        </div>
        <div class="card-content">
          <button class="card-name" data-global-open="${index}" type="button">${escapeHtml(film.title)}</button>
          <div class="card-subtitle"><span>${escapeHtml(film.year || 'Anno n.d.')}</span><span aria-hidden="true">·</span><span>${film.type === 'serie' ? 'Serie' : 'Film'}</span></div>
        </div>
      </article>`;
    }).join('');
    $('#catalog-empty').hidden = items.length !== 0 || !hasSearched;
    $('#global-next').hidden = page >= pages || !items.length;
  }
  function setSourceStatus() {
    const active = catalogMode();
    $('#catalog-status').textContent = active === 'server'
      ? 'Catalogo TMDB connesso · Ricerca globale'
      : active === 'personal'
        ? 'TMDB connesso per questa sessione'
        : 'Ricerca aperta Wikidata · Copertura limitata';
    $('#catalog-provider').textContent = active === 'wikidata' ? 'Film e serie su Wikidata' : 'Film e serie su TMDB';
    $('#catalog-setup').hidden = active !== 'wikidata';
    $('#catalog-info').textContent = active === 'wikidata'
      ? 'Wikidata è un archivio aperto, ma non dispone di una locandina per ogni opera e la ricerca restituisce fino a 50 candidati per richiesta. Con TMDB connesso puoi sfogliare molte più schede e copertine.'
      : 'Metadati e immagini da TMDB, nel rispetto dei suoi termini. La copertura non è universale: alcuni titoli e locandine possono mancare.';
  }
  async function refresh(reset = true) {
    if (request) request.abort();
    request = new AbortController();
    const signal = request.signal;
    if (reset) { page = 1; items = []; $('#global-grid').innerHTML = ''; }
    hasSearched = true;
    $('#global-next').disabled = true;
    displayLocal(query);
    setSourceStatus();
    status(query ? 'Ricerca nel catalogo…' : 'Caricamento del catalogo…');
    $('#catalog-results-title').textContent = query ? 'Risultati nel catalogo mondiale' : 'Film da esplorare';
    try {
      let result;
      if (catalogMode() === 'wikidata') {
        if (!query) {
          result = { source: 'Wikidata', items: [], page: 1, totalPages: 1, totalResults: 0 };
          status('Per esplorare un catalogo senza limiti di ricerca, configura TMDB. Puoi comunque cercare titoli con Wikidata.');
        } else result = await wikidataSearch(query, type, signal);
      } else result = await remoteRequest(query ? 'search' : 'discover',
        query ? { q: query, page, type } : { page, type }, signal);
      if (signal.aborted) return;
      if (reset) items = [];
      items.push(...(result.items || []));
      pages = Number(result.totalPages) || 1;
      $('#catalog-count').textContent = result.totalResults
        ? new Intl.NumberFormat('it-IT').format(result.totalResults) + ' risultati nella fonte'
        : '';
      page = Number(result.page) || page;
      renderResults();
      if (query) status(result.items.length
        ? 'Risultati dalla fonte ' + result.source + (pages > 1 ? ' · Pagina ' + page + ' di ' + pages : '')
        : 'Nessun risultato in questa fonte. Prova il titolo originale.');
      else if (catalogMode() !== 'wikidata') status('Sfoglia il catalogo mondiale o cerca un titolo.');
    } catch (error) {
      if (signal.aborted) return;
      if (catalogMode() === 'server' && (error.status === 503 || error.status === 404)) {
        serverEnabled = false;
        await refresh(reset);
        return;
      }
      status(error.message + ' Verifica la connessione o riprova.', true);
    } finally {
      if (request?.signal === signal) {
        request = null;
        $('#global-next').disabled = false;
      }
    }
  }
  function setType(value) {
    if (!['all', 'movie', 'tv'].includes(value) || value === type) return;
    type = value;
    $('#global-type').querySelectorAll('button').forEach(button => {
      const selected = button.dataset.catalogType === type;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    refresh();
  }
  function search(value) {
    query = String(value || '').trim().slice(0, 120);
    $('#catalog-query').value = query;
    displayLocal(query);
    if (!$('#explore-page').hidden && !new URL(location.href).searchParams.has('film')) {
      const url = new URL(location.href);
      url.hash = '';
      url.search = '';
      url.searchParams.set('view', 'explore');
      if (query.length >= 2) url.searchParams.set('q', query);
      history.replaceState({ view: 'explore' }, '', url.pathname + url.search);
    }
    if (debouncer) clearTimeout(debouncer);
    if (!query) { refresh(); return; }
    if (query.length < 2) { status('Inserisci almeno due caratteri.');return; }
    debouncer = setTimeout(() => refresh(), 320);
  }
  function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        const result = await readJson('/api/catalog/status', {}, AbortSignal.timeout(4500));
        serverEnabled = Boolean(result.enabled);
      } catch { serverEnabled = false; }
      setSourceStatus();
    })();
    return initPromise;
  }
  async function detail(id) {
    if (/^wikidata-q\d+$/.test(id)) return wikidataDetail(id);
    const tmdb = id.match(/^tmdb-(movie|tv)-(\d+)$/);
    if (!tmdb || catalogMode() === 'wikidata') return null;
    try {
      const data = await remoteRequest('detail', { type: tmdb[1], id: tmdb[2] });
      return data.item || null;
    } catch { return null; }
  }
  async function resolveSeed(film) {
    await init();
    if (catalogMode() === 'wikidata') return null;
    const identity = window.EmotecaIdentity;
    if (!identity || !Number.isInteger(film?.year)) return null;
    const media = identity.mediaOf(film);
    if (!media) return null;
    // The seed's existing posterQuery is useful for translated Japanese titles.
    // Prefer a specific alias over ambiguous short titles (e.g. "86").
    const candidates = [film.posterQuery, film.title]
      .map(q => String(q || '').trim()).filter(q => q.length >= 2 && q.length <= 120);
    const seen = new Set();
    for (const q of candidates) {
      if (seen.has(identity.normal(q))) continue;
      seen.add(identity.normal(q));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const data = await remoteRequest('search', { q, page: 1, type: media }, controller.signal);
        const best = identity.chooseSeedMatch(film, data.items, q);
        if (!best) continue;
        try {
          const full = await remoteRequest('detail', {
            type: media, id: best.sourceId
          }, controller.signal);
          return full.item || best;
        } catch {
          return best;
        }
      } finally {
        clearTimeout(timeout);
      }
    }
    return null;
  }
  async function posterFor(film) {
    if (catalogMode() === 'wikidata') return null;
    try {
      const type = film.type === 'serie' ? 'tv' : 'movie';
      const result = await remoteRequest('poster', { title: film.posterQuery || film.title,
        year: film.year, type });
      return safeImage(result.item?.poster) || null;
    } catch { return null; }
  }
  function onClick(event) {
    const open = event.target.closest('[data-global-open]');
    if (open) {
      const film = items[Number(open.dataset.globalOpen)];
      if (film) window.AfterframeCatalog?.openExternal?.(film);
      return;
    }
    const save = event.target.closest('[data-global-save]');
    if (save && !save.disabled) {
      const film = items[Number(save.dataset.globalSave)];
      if (!film) return;
      save.disabled = true;
      window.AfterframeCatalog?.addExternal?.(toLocalFilm(film)).then(() => {
        renderResults();
      }).catch(error => {
        save.disabled = false;
        status('Salvataggio non riuscito: ' + error.message, true);
      });
      return;
    }
    const typeButton = event.target.closest('[data-catalog-type]');
    if (typeButton) setType(typeButton.dataset.catalogType);
    if (event.target.closest('#global-next')) { page += 1; refresh(false); }
    if (event.target.closest('#catalog-enable')) {
      const value = $('#catalog-token').value.trim().replace(/^Bearer\s+/i, '');
      if (!value || value.length < 20) { status('Inserisci un API Read Access Token TMDB valido.', true); return; }
      token = value;
      $('#catalog-token').value = '';
      setSourceStatus();
      refresh();
    }
  }
  function toLocalFilm(item) {
    if (!item?.id || !item.title || !Number.isInteger(item.year)) throw Error('La fonte non riporta un anno valido: completa il titolo manualmente.');
    return {
      id: item.id, catalogId: item.id, catalogSource: item.source || '',
      catalogTitle: item.title, backdrop: safeImage(item.backdrop),
      title: item.title, year: item.year, type: item.type || 'film',
      genre: (item.genre || '').slice(0, 100), description: (item.description || '').slice(0, 900),
      why: '', tags: [], scores: { emotion: 0, comedy: 0, action: 0, romance: 0, tension: 0 },
      match: 0, status: 'watchlist', reaction: 'unseen', rating: null,
      favorite: false, notes: '', poster: safeImage(item.poster),
      posterQuery: item.originalTitle || item.title,
      links: [{ name: 'Scheda ' + item.source, url: item.sourceUrl }],
      duration: (item.duration || '').slice(0, 60), country: '', warnings: '', featured: false
    };
  }
  document.addEventListener('click', onClick);
  $('#catalog-search-form').addEventListener('submit', event => {
    event.preventDefault();
    window.AfterframeCatalog?.openExplore?.($('#catalog-query').value);
  });
  $('#catalog-query').addEventListener('input', event => {
    $('#search').value = event.target.value;
    search(event.target.value);
  });
  window.EmotecaExplorer = {
    init, search, refresh, detail, posterFor, resolveSeed, toLocalFilm,
    refreshSaved: renderResults, currentQuery: () => query,
    isEnabled: () => catalogMode() !== 'wikidata'
  };
})();
