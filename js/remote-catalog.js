/* Ricerca federata: Wikidata CC0 senza chiavi; TMDB opzionale, token solo in memoria. */
(function () {
  'use strict';
  const dialog = document.querySelector('#source-dialog');
  const form = document.querySelector('#source-form');
  const results = document.querySelector('#source-results');
  const feedback = document.querySelector('#source-feedback');
  const nextButton = document.querySelector('#source-next');
  const submitButton = document.querySelector('#source-submit');
  const tokenField = document.querySelector('#source-token-wrap');
  let provider = 'wikidata';
  let items = [];
  let page = 1;
  let pages = 1;
  let pending = null;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);

  function setFeedback(message, isError = false) {
    feedback.textContent = message;
    feedback.classList.toggle('error', isError);
  }

  function claim(entity, property) {
    const statement = entity?.claims?.[property]?.find(
      (entry) => entry?.mainsnak?.snaktype === 'value' && entry.mainsnak.datavalue
    );
    return statement?.mainsnak?.datavalue?.value ?? null;
  }

  function classifications(entity) {
    return (entity.claims?.P31 || [])
      .map((entry) => entry?.mainsnak?.datavalue?.value?.id)
      .filter(Boolean);
  }

  const TV = new Set(['Q5398426', 'Q15416', 'Q21191270']);
  const ANIME = new Set(['Q1107', 'Q63952888']);
  const FILMS = new Set(['Q11424', 'Q202866', 'Q24862', 'Q506240', 'Q9325864', 'Q15416']);
  function classify(entity) {
    const classes = classifications(entity);
    if (classes.some((id) => ANIME.has(id))) return 'anime';
    if (classes.some((id) => TV.has(id))) return 'serie';
    if (classes.includes('Q202866')) return 'film-animazione';
    if (classes.some((id) => FILMS.has(id))) return 'film';
    return null;
  }

  function yearFromClaim(value) {
    const match = String(value?.time || '').match(/^[+-](\d{4})/);
    const year = match ? Number(match[1]) : null;
    return year && year >= 1880 && year <= 2100 ? year : null;
  }

  async function getJSON(url, options = {}) {
    const response = await fetch(url, {
      signal: pending?.signal,
      credentials: 'omit',
      headers: { Accept: 'application/json', ...options.headers }
    });
    if (!response.ok) throw new Error(`Servizio non disponibile (HTTP ${response.status}). Riprova più tardi.`);
    return response.json();
  }

  async function wikidataSearch(term) {
    const searchURL = new URL('https://www.wikidata.org/w/api.php');
    Object.entries({
      action: 'wbsearchentities', search: term, language: 'it', uselang: 'it',
      type: 'item', limit: '50', format: 'json', origin: '*'
    }).forEach(([key, value]) => searchURL.searchParams.set(key, value));
    const found = await getJSON(searchURL);
    const ids = (found.search || []).map((item) => item.id).filter((id) => /^Q\d+$/.test(id));
    if (!ids.length) return { list: [], totalPages: 1 };
    const detailsURL = new URL('https://www.wikidata.org/w/api.php');
    Object.entries({
      action: 'wbgetentities', ids: ids.join('|'),
      props: 'labels|descriptions|claims', languages: 'it|en', format: 'json', origin: '*'
    }).forEach(([key, value]) => detailsURL.searchParams.set(key, value));
    const data = await getJSON(detailsURL);
    const list = ids.flatMap((id) => {
      const entity = data.entities?.[id];
      if (!entity || entity.missing !== undefined) return [];
      const type = classify(entity);
      if (!type) return [];
      const title = entity.labels?.it?.value || entity.labels?.en?.value || '';
      if (!title) return [];
      const year = yearFromClaim(claim(entity, 'P577')) || yearFromClaim(claim(entity, 'P571'));
      const filename = claim(entity, 'P18');
      const poster = typeof filename === 'string' && filename.length < 200
        ? 'https://commons.wikimedia.org/wiki/Special:Redirect/file/' + encodeURIComponent(filename)
        : '';
      const description = entity.descriptions?.it?.value || entity.descriptions?.en?.value || '';
      return [{
        id: 'wikidata-' + id.toLowerCase(), title, year, type, description, poster,
        source: 'Wikidata', sourceUrl: 'https://www.wikidata.org/wiki/' + id,
        sourceId: id
      }];
    });
    return { list, totalPages: 1 };
  }

  async function tmdbSearch(term, currentPage) {
    const token = document.querySelector('#source-token').value.trim().replace(/^Bearer\s+/i, '');
    if (!token) throw new Error('Inserisci un token di lettura TMDB per utilizzare questa fonte.');
    const url = new URL('https://api.themoviedb.org/3/search/multi');
    Object.entries({
      query: term, language: 'it-IT', include_adult: 'false', page: String(currentPage)
    }).forEach(([key, value]) => url.searchParams.set(key, value));
    const data = await getJSON(url, { headers: { Authorization: 'Bearer ' + token } });
    const list = (data.results || []).filter((entry) =>
      ['movie', 'tv'].includes(entry.media_type) && !entry.adult
    ).map((entry) => {
      const title = entry.title || entry.name || '';
      const yearString = entry.release_date || entry.first_air_date || '';
      const year = /^\d{4}/.test(yearString) ? Number(yearString.slice(0, 4)) : null;
      const poster = /^\/[\w-]+\.(jpg|png|webp)$/i.test(entry.poster_path || '')
        ? 'https://image.tmdb.org/t/p/w500' + entry.poster_path : '';
      return {
        id: 'tmdb-' + entry.media_type + '-' + entry.id, title, year,
        type: entry.media_type === 'tv' ? 'serie' : 'film',
        description: entry.overview || '', poster, source: 'TMDB',
        sourceUrl: 'https://www.themoviedb.org/' +
          (entry.media_type === 'tv' ? 'tv' : 'movie') + '/' + entry.id
      };
    }).filter((entry) => entry.title);
    return { list, totalPages: Math.min(Math.max(1, Number(data.total_pages) || 1), 500) };
  }

  function renderResults() {
    results.innerHTML = items.map((item, index) => {
      const canAdd = Number.isInteger(item.year) && item.year >= 1880 && item.year <= 2100;
      return `<article class="source-item">
        <div class="source-art">${item.poster
          ? `<img src="${escapeHtml(item.poster)}" alt="" width="72" height="106" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
          : '<span>EMOTECA</span>'}</div>
        <div class="source-item-info"><span class="source-overline">${escapeHtml(item.source)} / ${escapeHtml(item.type)}${canAdd ? ' / ' + item.year : ''}</span>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.description || 'Nessuna descrizione disponibile nella fonte.')}</p>
          <a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">Apri la scheda originale</a>
        </div>
        <button class="source-add" data-source-add="${index}" ${!canAdd ? 'disabled title="Anno non disponibile nella fonte"' : ''}>
          ${canAdd ? 'Aggiungi' : 'Anno mancante'}
        </button>
      </article>`;
    }).join('');
    nextButton.hidden = provider !== 'tmdb' || page >= pages || items.length === 0;
  }

  async function runSearch(nextPage = 1) {
    const term = document.querySelector('#source-query').value.trim();
    if (term.length < 2) {
      setFeedback('Scrivi almeno due caratteri per cercare un titolo.', true);
      return;
    }
    if (pending) pending.abort();
    pending = new AbortController();
    const controller = pending;
    page = nextPage;
    submitButton.disabled = true;
    nextButton.hidden = true;
    results.innerHTML = '';
    setFeedback('Ricerca in corso…');
    try {
      const response = provider === 'wikidata'
        ? await wikidataSearch(term)
        : await tmdbSearch(term, page);
      if (pending !== controller) return;
      items = response.list;
      pages = response.totalPages;
      renderResults();
      setFeedback(items.length
        ? `${items.length} risultati. Puoi aggiungere i titoli alla tua libreria personale.`
        : 'Nessun film o serie trovato. Prova con il titolo originale o con una ricerca diversa.');
    } catch (error) {
      if (error.name !== 'AbortError' && pending === controller) {
        setFeedback(error.message + ' Puoi comunque aggiungere il titolo manualmente.', true);
      }
    } finally {
      if (pending === controller) {
        submitButton.disabled = false;
        pending = null;
      }
    }
  }

  async function importItem(index, button) {
    const item = items[index];
    if (!item || !window.AfterframeCatalog?.addExternal) return;
    button.disabled = true;
    button.textContent = 'Salvataggio…';
    const film = {
      id: item.id, title: item.title, year: item.year, type: item.type,
      genre: '', description: item.description.slice(0, 900), why: '', tags: [],
      scores: { emotion: 0, comedy: 0, action: 0, romance: 0, tension: 0 },
      match: 0, status: 'watchlist', reaction: 'unseen', rating: null,
      favorite: false, notes: '', poster: item.poster, posterQuery: item.title,
      links: [{ name: 'Scheda ' + item.source, url: item.sourceUrl }],
      duration: '', country: '', warnings: '', featured: false
    };
    try {
      const outcome = await window.AfterframeCatalog.addExternal(film);
      button.textContent = outcome.added ? 'Aggiunto' : 'Già presente';
      setFeedback(outcome.added
        ? `“${item.title}” è stato aggiunto alla libreria personale.`
        : `“${item.title}” è già nella tua libreria.`);
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Riprova';
      setFeedback('Salvataggio fallito: ' + error.message, true);
    }
  }

  document.addEventListener('click', (event) => {
    const open = event.target.closest('[data-action="open-source"]');
    if (open) {
      if (!dialog.open) dialog.showModal();
      document.querySelector('#sidebar').classList.remove('open');
      document.querySelector('#mobile-overlay').classList.remove('open');
    }
    const add = event.target.closest('[data-source-add]');
    if (add && !add.disabled) importItem(Number(add.dataset.sourceAdd), add);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    runSearch(1);
  });
  document.querySelectorAll('input[name="source-provider"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      provider = radio.value;
      tokenField.hidden = provider !== 'tmdb';
      results.innerHTML = '';
      items = [];
      nextButton.hidden = true;
      setFeedback(provider === 'wikidata'
        ? 'Wikidata: dati aperti CC0, nessuna chiave necessaria.'
        : 'TMDB: uso non commerciale con attribuzione. Il token resta solo in questa pagina.');
    });
  });
  nextButton.addEventListener('click', () => runSearch(page + 1));
  dialog.addEventListener('close', () => {
    if (pending) pending.abort();
    pending = null;
    submitButton.disabled = false;
  });
})();
