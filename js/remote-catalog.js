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

  const selectedThemes = new Set();
  // Mirrors the server's explicit TMDB genre IDs. No TV horror category exists in
  // TMDB; don't disguise Mistero/Fantasy as Horror.
  const GENRES = {
    azione:{movie:[28],tv:[10759]}, avventura:{movie:[12],tv:[10759]},
    animazione:{movie:[16],tv:[16]}, commedia:{movie:[35],tv:[35]},
    crime:{movie:[80],tv:[80]}, documentario:{movie:[99],tv:[99]},
    drammatico:{movie:[18],tv:[18]}, famiglia:{movie:[10751],tv:[10751]},
    fantascienza:{movie:[878],tv:[10765]}, fantasy:{movie:[14],tv:[10765]},
    guerra:{movie:[10752],tv:[10768]}, horror:{movie:[27],tv:[]},
    mistero:{movie:[9648],tv:[9648]}, musica:{movie:[10402],tv:[]},
    romantico:{movie:[10749],tv:[]}, storia:{movie:[36],tv:[]},
    thriller:{movie:[53],tv:[]}
  };
  const genreKeys = () => [...selectedThemes].sort();
  const listTypes = category => category === 'movie' ? ['movie'] :
    category === 'tv' ? ['tv'] : ['movie','tv'];
  const matchGenre = (entry,media,genres,anime) => {
    const ids = Array.isArray(entry.genre_ids) ? entry.genre_ids : [];
    if (anime && !(entry.original_language === 'ja' && ids.includes(16))) return false;
    return !genres.length || genres.some(key => GENRES[key][media].some(id=>ids.includes(id)));
  };
  function providerParams(media,genres,anime,page) {
    const params = { page,language:'it-IT',include_adult:'false',sort_by:'popularity.desc' };
    if(anime) {params.with_genres='16';params.with_original_language='ja';}
    else {
      const ids=[...new Set(genres.flatMap(key=>GENRES[key][media]))];
      if(ids.length)params.with_genres=ids.join('|');
    }
    return params;
  }
  function filteredPage(data,media,genres,anime) {
    return { source:'TMDB',
      items:(data.results||[]).filter(item=>{
        const kind=media||item.media_type;
        return ['movie','tv'].includes(kind)&&matchGenre(item,kind,genres,anime);
      }).map(item=>tmdbItem(item,media)).filter(Boolean),
      page:data.page||1,totalPages:Math.min(500,data.total_pages||1),
      totalResults:genres.length||anime?null:data.total_results||0,
      filteredSearch:Boolean(genres.length||anime) };
  }
  async function discoverDirect(args,signal) {
    const genres=String(args.genres||'').split(',').filter(Boolean);
    const anime=args.type==='anime';
    if(args.type==='all'&&!genres.length) {
      const data=await tmdbDirect('/trending/all/week',{language:'it-IT',page:args.page},signal);
      return filteredPage(data,null,[],false);
    }
    const media=listTypes(args.type);
    const results=await Promise.all(media.map(async kind=>{
      if(genres.length&&!anime&&!genres.some(key=>GENRES[key][kind].length))
        return {page:args.page,total_pages:1,total_results:0,results:[]};
      return tmdbDirect('/discover/'+kind,providerParams(kind,genres,anime,args.page),signal);
    }));
    const combined=results.flatMap((data,i)=>(data.results||[])
      .filter(item=>matchGenre(item,media[i],genres,anime))
      .map(item=>({...item,media_type:media[i]})));
    combined.sort((a,b)=>(b.popularity||0)-(a.popularity||0));
    return {source:'TMDB',items:combined.map(item=>tmdbItem(item)).filter(Boolean),
      page:args.page,totalPages:Math.min(500,Math.max(...results.map(x=>x.total_pages||1))),
      totalResults:anime&&genres.length?null:results.reduce((n,x)=>n+(x.total_results||0),0),
      filteredSearch:anime&&genres.length};
  }

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
        const media = args.type === 'all' || args.type === 'anime' ? null : args.type;
        const result = await tmdbDirect(media ? '/search/' + media : '/search/multi',
          { query: args.q, page: args.page, language: 'it-IT', include_adult: 'false' }, signal);
        return filteredPage(result,media,String(args.genres||'').split(',').filter(Boolean),args.type==='anime');
      }
      if (kind === 'discover') {
        return discoverDirect(args,signal);
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
      if (!kind ||
          (mediaType === 'movie' && (kind === 'serie' || kind === 'anime')) ||
          (mediaType === 'tv' && kind !== 'serie' && kind !== 'anime') ||
          (mediaType === 'anime' && kind !== 'anime')) return [];
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
            aria-label="${saved?'Gestisci le liste per ':'Aggiungi alle liste: '}${escapeHtml(film.title)}"
            title="${saved?'Gestisci le liste':'Aggiungi alle tue liste'}" ${!film.year ? 'disabled' : ''}>
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
    $('#catalog-empty p').textContent = page < pages
      ? 'Nessuna corrispondenza in questa pagina. Prova Mostra altri film.'
      : 'Nessun risultato da questa fonte. Prova un titolo diverso, anche nella lingua originale.';
    $('#global-next').hidden = page >= pages || catalogMode()==='wikidata';
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
  function updateFilterControls() {
    $('#global-type').querySelectorAll('[data-catalog-type]').forEach(button=>{
      const active=button.dataset.catalogType===type;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    $('#global-themes').querySelectorAll('[data-global-theme]').forEach(button=>{
      const active=button.dataset.globalTheme==='all'?!selectedThemes.size:selectedThemes.has(button.dataset.globalTheme);
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    $('#clear-global-filters').disabled=type==='all'&&!query&&!selectedThemes.size;
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
    updateFilterControls();
    const filtered=selectedThemes.size>0||type==='anime';
    status(query ? 'Ricerca nel catalogo…' : 'Caricamento del catalogo…');
    $('#catalog-results-title').textContent = query ? 'Risultati della ricerca' :
      type==='anime' ? 'Anime da esplorare' :
      type==='tv' ? 'Serie da esplorare' :
      type==='movie' ? 'Film da esplorare' : 'Film e serie da esplorare';
    try {
      let result;
      if (catalogMode() === 'wikidata') {
        if (selectedThemes.size) {
          result={source:'Wikidata',items:[],page:1,totalPages:1,totalResults:0};
          status('I filtri per genere richiedono TMDB. Wikidata non restituisce generi affidabili in questa ricerca.');
        } else if (!query) {
          result={source:'Wikidata',items:[],page:1,totalPages:1,totalResults:0};
          status('Per sfogliare il catalogo e usare i generi, configura TMDB. Puoi comunque cercare titoli con Wikidata.');
        } else result=await wikidataSearch(query,type,signal);
      } else result=await remoteRequest(query?'search':'discover',
        { ...(query?{q:query}:{}),page,type,genres:genreKeys().join(',')},signal);
      if (signal.aborted) return;
      if (reset) items=[];
      items.push(...(result.items||[]));
      pages=Number(result.totalPages)||1;
      page=Number(result.page)||page;
      if (result.filteredSearch) {
        $('#catalog-count').textContent=items.length+' corrispondenze nelle pagine esaminate';
      } else {
        $('#catalog-count').textContent=result.totalResults
          ? new Intl.NumberFormat('it-IT').format(result.totalResults)+' risultati nella fonte' : '';
      }
      renderResults();
      if (catalogMode()==='wikidata' && (selectedThemes.size||!query)) {
        // Provider limitation is the intended message, not "no results".
      } else if(type==='tv' && selectedThemes.size &&
          !genreKeys().some(key=>GENRES[key].tv.length)) {
        status('TMDB non classifica questi generi per le serie TV. Seleziona Film o altri temi.');
      } else if(query && filtered) {
        status(result.items.length
          ? 'Risultati filtrati in questa pagina TMDB · Pagina '+page+' di '+pages
          : 'Nessuna corrispondenza in questa pagina. Puoi esplorare le pagine successive.');
      } else if(query) status(result.items.length
        ? 'Risultati dalla fonte '+result.source+(pages>1?' · Pagina '+page+' di '+pages:'')
        : 'Nessun risultato in questa fonte. Prova il titolo originale.');
      else if(catalogMode()!=='wikidata') status('Sfoglia il catalogo mondiale o cerca un titolo.');
    } catch(error) {
      if(signal.aborted)return;
      if(catalogMode()==='server'&&(error.status===503||error.status===404)) {
        serverEnabled=false;await refresh(reset);return;
      }
      status(error.message+' Verifica la connessione o riprova.',true);
    } finally {
      if(request?.signal===signal) {
        request=null;
        $('#global-next').disabled=false;
      }
    }
  }
  function setType(value) {
    if(!['all','movie','tv','anime'].includes(value)||value===type)return;
    type=value;
    updateFilterControls();
    refresh();
  }
  function toggleTheme(value) {
    if(value==='all')selectedThemes.clear();
    else if(Object.hasOwn(GENRES,value)){
      if(selectedThemes.has(value))selectedThemes.delete(value);
      else selectedThemes.add(value);
    } else return;
    updateFilterControls();
    refresh();
  }
  function clearFilters() {
    type='all';
    selectedThemes.clear();
    query='';
    $('#catalog-query').value='';
    $('#search').value='';
    updateFilterControls();
    search('');
  }
  function search(value) {
    query = String(value || '').trim().slice(0, 120);
    $('#catalog-query').value = query;
    displayLocal(query);
    updateFilterControls();
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
      // A saved film may be in multiple lists: open its existing diary and let
      // the person choose memberships instead of showing a dead ✓ button.
      if (window.AfterframeCatalog?.findSaved?.(film)) {
        window.AfterframeCatalog?.openExternal?.(film);
        return;
      }
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
    if (typeButton) { setType(typeButton.dataset.catalogType); return; }
    const tag=event.target.closest('[data-global-theme]');
    if(tag) { toggleTheme(tag.dataset.globalTheme); return; }
    if(event.target.closest('#clear-global-filters')) { clearFilters(); return; }
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
