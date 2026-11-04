import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('All browser scripts parse as JavaScript', () => {
  for (const file of ['js/data.js', 'js/db.js', 'js/catalog-identity.js', 'js/app.js', 'js/remote-catalog.js']) {
    assert.doesNotThrow(() => new Script(read(file), { filename: file }));
  }
});

test('App loads the explorer and cinematic stylesheet after core assets', () => {
  const html = read('index.html');
  for (const file of ['styles-cinema.css', 'js/data.js', 'js/db.js', 'js/catalog-identity.js', 'js/app.js', 'js/remote-catalog.js']) {
    assert.ok(existsSync(new URL('../' + file, import.meta.url)), 'Missing ' + file);
    assert.ok(html.includes(file), 'HTML does not include ' + file);
  }
  for (const id of ['explore-page', 'global-grid', 'catalog-query', 'catalog-search-form', 'catalog-token',
    'catalog-setup', 'global-next', 'local-matches', 'detail-screen', 'detail-content', 'film-page-title']) {
    assert.ok(html.includes('id="' + id + '"'), 'Missing new catalog control ' + id);
  }
  assert.ok(html.indexOf('js/app.js') < html.indexOf('js/remote-catalog.js'));
  assert.ok(html.indexOf('js/catalog-identity.js') < html.indexOf('js/app.js'), 'Identity must load before app');
  assert.ok(html.includes('data-action="add"'), 'Manual entry must remain accessible');
  assert.ok(html.includes('This product uses the TMDB API but is not endorsed or certified by TMDB.'));
  assert.ok(html.includes('blue_square_2-'), 'TMDB attribution must contain approved logo');
  assert.ok(!html.includes('id="detail-dialog"'), 'Movie details must be a separate page');
  assert.ok(!html.includes('id="source-dialog"'), 'Global search must not be a modal');

});

test('Secure catalog API parses as ES module', () => {
  const file = fileURLToPath(new URL('../server/catalog-api.mjs', import.meta.url));
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', file]));
  const api = read('server/catalog-api.mjs');
  assert.ok(api.includes('process.env.TMDB_READ_TOKEN'));
  assert.ok(!api.includes('localStorage'));
  assert.ok(api.includes('/api/catalog/search'));
  assert.ok(api.includes('/api/catalog/discover'));
  assert.ok(api.includes('/api/catalog/detail'));
  assert.ok(api.includes('/api/catalog/poster'));
});

test('Semantic architecture replaces the old dashboard UI', () => {
  const html = read('index.html');
  const app = read('js/app.js');
  const css = read('styles-cinema.css');
  for (const id of ['page-title', 'hero', 'reel-section', 'editorial-rail',
    'collection-section', 'section-title', 'film-grid', 'library-meta',
    'results-count', 'type-filters', 'sort-filter', 'theme-filters', 'library-search', 'clear-library-filters']) {
    assert.ok(html.includes('id="' + id + '"'), 'Missing redesigned view element ' + id);
  }
  assert.ok(html.includes('class="site-nav"'), 'Navigation should be horizontal');
  assert.ok(!html.includes('class="sidebar"'), 'Removed sidebar must not return');
  assert.ok(!html.includes('class="stats"'), 'Removed metrics grid must not return');
  assert.ok(!html.includes('styles-premium.css'), 'Old override CSS must no longer be loaded');
  assert.ok(app.includes('function renderFeatured()'), 'Featured movie is data-driven');
  assert.ok(app.includes('function renderRail()'), 'Curated reel is data-driven');
  assert.ok(app.includes('sessionStorage.getItem'), 'Recommendation should vary per visit');
  assert.ok(app.includes('class="film-cover"'), 'New card architecture is in the renderer');
  assert.ok(app.includes('class="detail-hero"'), 'Detail view must have its own hierarchy');
  assert.ok(app.includes('detail-screen'), 'Film detail page must be routed');
  assert.ok(app.includes('aria-pressed'), 'Interactive filters and favorites announce selection');
  assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'));
  assert.ok(css.includes('max-width:470px'));
  assert.ok(!app.includes("$('#sidebar')"));
  assert.ok(!read('js/remote-catalog.js').includes("querySelector('#sidebar')"));
});

test('Accessibility-sensitive controls remain available in the redesigned shell', () => {
  const html = read('index.html');
  assert.ok(html.includes('class="skip-link"'));
  assert.ok(html.includes('id="search"'));
  assert.ok(html.includes('data-view="explore"'));
  assert.ok(html.includes('id="catalog-query"'));
  assert.ok(html.includes('data-action="json"'));
  assert.ok(html.includes('data-action="add"'));
  assert.ok(html.includes('aria-label="Navigazione principale"'));
  for (const view of ['discover', 'explore', 'all', 'watchlist', 'watched', 'favorites']) {
    assert.ok(html.includes('data-view="' + view + '"'), view + ' view should be reachable');
  }
});

test('Existing catalog validation supports source-imported films with unknown editorial scores', () => {
  const window = {};
  const listeners = [];
  const document = { addEventListener: (event, handler) => listeners.push([event, handler]) };
  const storage = { getItem: () => null };
  const context = createContext({ window, document, localStorage: storage, location: { href: 'https://example.org/' }, URL, console });
  new Script(read('js/app.js')).runInContext(context);
  assert.ok(window.AfterframeTest);
  assert.ok(window.AfterframeCatalog);
  const raw = new Script(`({
    id:'wikidata-q123456',title:'Film di prova',year:2021,type:'film',
    scores:{emotion:0,comedy:0,action:0,romance:0,tension:0},match:0,
    links:[{name:'Wikidata',url:'https://www.wikidata.org/wiki/Q123456'}]
  })`).runInContext(context);
  const film = window.AfterframeTest.validateFilm(raw);
  assert.equal(film.status, 'watchlist');
  assert.equal(film.match, 0);
  assert.equal(film.rating, null);
  assert.equal(film.links[0].name, 'Wikidata');
  assert.equal(listeners[0][0], 'DOMContentLoaded');
  context.badFilm = raw;
  const malicious = new Script("({...badFilm, poster:'javascript:alert(1)'})").runInContext(context);
  assert.throws(() => window.AfterframeTest.validateFilm(malicious), /copertina/);
});

test('Source integration is opt-in and does not include hard-coded TMDB credentials', () => {
  const remote = read('js/remote-catalog.js');
  assert.ok(remote.includes('wbsearchentities'));
  assert.ok(remote.includes('wbgetentities'));
  assert.ok(remote.includes('search/multi'));
  assert.ok(remote.includes('/api/catalog/status'));
  assert.ok(remote.includes('wbsearchentities'));
  assert.ok(remote.includes("origin: '*'"));
  assert.ok(remote.includes("window.AfterframeCatalog?.addExternal"));
  assert.ok(!remote.includes('localStorage'));
  assert.ok(!remote.includes('sessionStorage'));
  assert.ok(!/eyJhbGciOi|sk-[A-Za-z0-9]{16}/.test(remote), 'Unexpected embedded credential');
});

test('Remote poster refresh only modifies image slots, never action buttons', () => {
  const app = read('js/app.js');
  const css = read('styles-cinema.css');
  const injected = app.slice(app.indexOf('// Only actual artwork slots'), app.indexOf('image.onerror=()=>', app.indexOf('// Only actual artwork slots')));
  assert.ok(injected.includes("document.querySelectorAll('.poster-wrap[data-open], .feature-poster[data-poster], .detail-poster[data-poster]')"));
  assert.ok(!injected.includes("'[data-open], [data-poster]'"), 'Generic open buttons must never receive images');
  assert.ok(css.includes('.poster-wrap > .poster-image'), 'Images must be scoped to artwork containers');
  assert.ok(css.includes('.feature-poster > .poster-image'));
  assert.ok(css.includes('.detail-poster > .poster-image'));
  const html = read('index.html');
  assert.ok(html.includes('styles-cinema.css?v=20261104-libraryfilters'));
  assert.ok(html.includes('js/app.js?v=20261104-libraryfilters'));
});

test('Catalog identity deduplicates legacy seeds and protects personal history', () => {
  const context = createContext({window:{}});
  new Script(read('js/catalog-identity.js')).runInContext(context);
  const identity = context.window.EmotecaIdentity;
  const code = {id:'code-geass-2006', title:'Code Geass: Lelouch of the Rebellion',
    posterQuery:'Code Geass: Hangyaku no Lelouch',year:2006,type:'anime',
    status:'watched',reaction:'cried',rating:10,notes:'Una nota privata',
    description:'Sinossi editoriale',genre:'Fantascienza',poster:'https://example.org/cover.jpg',
    links:[],tags:['morale'],favorite:true};
  const remote = {id:'tmdb-tv-32123',sourceId:'32123',provider:'tmdb',
    type:'serie',media:'tv',title:'Code Geass: Lelouch of the Rebellion',
    year:2006,description:'Sinossi esterna',genre:'Animation · Sci-Fi',
    poster:'https://image.tmdb.org/t/p/w500/code.jpg',
    backdrop:'https://image.tmdb.org/t/p/w1280/back.jpg',
    sourceUrl:'https://www.themoviedb.org/tv/32123'};
  assert.equal(identity.findSaved([code],remote)?.id,code.id);
  const enriched=identity.enrichSaved(code,remote,code);
  assert.equal(enriched.id,code.id, 'local bookmark URLs remain stable');
  assert.equal(enriched.catalogId,remote.id);
  assert.equal(enriched.description,'Sinossi esterna');
  assert.equal(enriched.poster,remote.poster);
  assert.equal(enriched.status,'watched');
  assert.equal(enriched.reaction,'cried');
  assert.equal(enriched.rating,10);
  assert.equal(enriched.notes,'Una nota privata');
  assert.equal(enriched.favorite,true);
  assert.equal(enriched.tags[0],'morale');
  assert.equal(enriched.links.length,1);
  assert.equal(identity.findSaved([enriched],remote)?.id,code.id);

  // A legitimate manual edit must win over automated catalog enrichment.
  const changed={...code,description:'Testo modificato da me',poster:'https://example.org/custom.jpg'};
  const keep=identity.enrichSaved(changed,remote,code);
  assert.equal(keep.description,'Testo modificato da me');
  assert.equal(keep.poster,'https://example.org/custom.jpg');

  // Year and medium matter. A 2026 film must not match a 2002 film
  // or a TV show with the same marketing name.
  const older={id:'tmdb-movie-27',type:'film',media:'movie',title:'Resident Evil',year:2002};
  const newer={id:'tmdb-movie-29',type:'film',media:'movie',title:'Resident Evil',year:2026};
  assert.equal(identity.findSaved([older],newer),null);
  assert.equal(identity.findSaved([older],{...older,id:'tmdb-tv-99',media:'tv',type:'serie'}),null);

  // Anime is a TV category inside the personal library, but TV on TMDB.
  const naruto={id:'naruto-2002',type:'anime',year:2002,
    title:'Naruto / Naruto Shippuden',posterQuery:'Naruto'};
  const source={id:'tmdb-tv-123',provider:'tmdb',type:'serie',media:'tv',title:'Naruto',year:2002};
  assert.equal(identity.findSaved([naruto],source)?.id,'naruto-2002');
  assert.equal(identity.chooseSeedMatch(naruto,[source],'Naruto')?.id,'tmdb-tv-123');
  assert.equal(identity.chooseSeedMatch(naruto,[{...source,year:2007}],'Naruto'),null);
  assert.equal(identity.chooseSeedMatch(code,[remote],'Code Geass: Hangyaku no Lelouch')?.id,remote.id);
  assert.equal(identity.chooseSeedMatch(code,[{...remote,id:'tmdb-tv-2',year:2007}],'Code Geass'),null);
});

test('Library filters use multi-select theme tags, Horror, local search and clear-all', () => {
  const html=read('index.html');
  const app=read('js/app.js');
  const css=read('styles-cinema.css');
  assert.ok(html.indexOf('id="type-filters"') < html.indexOf('id="theme-filters"'), 'Genres must appear below format tabs');
  assert.ok(html.indexOf('id="theme-filters"') < html.indexOf('id="library-search"'), 'Search follows thematic chips');
  for(const id of ['theme-filters','library-search','clear-library-filters']) {
    assert.ok(html.includes('id="'+id+'"'), 'Missing filter control: '+id);
  }
  assert.ok(html.includes('data-theme="all"'), 'All themes reset control must be present');
  assert.ok(html.includes('data-action="clear-filters"'), 'Clear filters action must be wired');
  assert.ok(!html.includes('id="tag-filter"'), 'Legacy select must be removed');
  assert.ok(app.includes("selectedThemes=new Set()"), 'Theme selection needs an independent multi-select set');
  assert.ok(app.includes("selectedThemes.has(theme)"), 'Theme toggles must support disabling individual tags');
  assert.ok(app.includes("['horror',...films.flatMap(themeValues)]"), 'Horror is always offered even without matches');
  assert.ok(app.includes("String(f.genre||'').split("), 'Filtering must inspect movie genre as well as custom tags');
  assert.ok(app.includes("$('#library-search').addEventListener('input'"), 'Search filters the saved library in real time');
  assert.ok(app.includes("function clearLibraryFilters()"), 'The X clears all local filter dimensions');
  assert.ok(app.includes("query='';") && app.includes("selectedThemes.clear()"));
  assert.ok(css.includes('.theme-tag.active') && css.includes('.library-searchbox'));
  assert.ok(html.includes('styles-cinema.css?v=20261104-libraryfilters'));
  assert.ok(html.includes('js/app.js?v=20261104-libraryfilters'));
});

test('Global catalog has genre chips, Anime and a separate reset button', () => {
  const html=read('index.html'),client=read('js/remote-catalog.js'),server=read('server/catalog-api.mjs');
  for(const id of ['global-type','global-themes','catalog-query','clear-global-filters']) {
    assert.ok(html.includes('id="'+id+'"'),'Missing global catalog control '+id);
  }
  assert.ok(html.indexOf('id="global-type"')<html.indexOf('id="global-themes"'));
  assert.ok(html.indexOf('id="global-themes"')<html.indexOf('id="catalog-search-form"'));
  assert.ok(html.includes('data-catalog-type="anime"'), 'Anime is a distinct global category');
  assert.ok(html.includes('data-global-theme="horror"'),'Horror must be a selectable global genre');
  assert.ok(html.includes('data-global-theme="all"'),'All themes toggle exists');
  assert.ok(html.includes('id="clear-global-filters"'));
  assert.ok(client.includes("const selectedThemes = new Set()"));
  assert.ok(client.includes("function clearFilters()"));
  assert.ok(client.includes("function toggleTheme(value)"));
  assert.ok(client.includes("args.type==='anime'"));
  assert.ok(server.includes('function matchesGenres('));
  assert.ok(server.includes("params.with_original_language = 'ja'"), 'TMDB Japanese animation criteria');
  assert.ok(server.includes("url.searchParams.get('genres')"), 'Server filters must receive topics');
  assert.ok(server.includes("filteredSearch ? null"), 'Do not claim exact counts when text search is filtered');
  assert.ok(html.includes('js/remote-catalog.js?v=20261104-globaltags'));
  assert.ok(html.includes('styles-cinema.css?v=20261104-globaltags'));
});

test('Preserve original IndexedDB name and JSON backup format', () => {
  assert.ok(read('js/db.js').includes('afterframe-catalog-v1'));
  assert.ok(read('js/app.js').includes("format:'afterframe-catalog'"));
});
