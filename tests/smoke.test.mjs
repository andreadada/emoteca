import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('All browser scripts parse as JavaScript', () => {
  for (const file of ['js/data.js', 'js/db.js', 'js/catalog-identity.js', 'js/lists.js', 'js/app.js', 'js/remote-catalog.js']) {
    assert.doesNotThrow(() => new Script(read(file), { filename: file }));
  }
});

test('App loads the explorer and cinematic stylesheet after core assets', () => {
  const html = read('index.html');
  for (const file of ['styles-cinema.css', 'styles-reframe.css', 'js/data.js', 'js/db.js', 'js/catalog-identity.js', 'js/lists.js', 'js/app.js', 'js/remote-catalog.js']) {
    assert.ok(existsSync(new URL('../' + file, import.meta.url)), 'Missing ' + file);
    assert.ok(html.includes(file), 'HTML does not include ' + file);
  }
  for (const id of ['explore-page', 'global-grid', 'catalog-query', 'catalog-search-form', 'catalog-token',
    'catalog-setup', 'global-next', 'local-matches', 'detail-screen', 'detail-content', 'film-page-title']) {
    assert.ok(html.includes('id="' + id + '"'), 'Missing new catalog control ' + id);
  }
  assert.ok(html.indexOf('js/app.js') < html.indexOf('js/remote-catalog.js'));
  assert.ok(html.indexOf('js/catalog-identity.js') < html.indexOf('js/app.js'), 'Identity must load before app');
  assert.ok(html.indexOf('js/lists.js') < html.indexOf('js/app.js'), 'Lists must load before app');
  assert.ok(html.includes('data-action="add"'), 'Manual entry must remain accessible');
  assert.ok(html.includes('This product uses the TMDB API but is not endorsed or certified by TMDB.'));
  assert.ok(html.includes('blue_square_2-'), 'TMDB attribution must contain approved logo');
  assert.ok(!html.includes('id="detail-dialog"'), 'Movie details must be a separate page');
  assert.ok(!html.includes('id="source-dialog"'), 'Global search must not be a modal');

});

test('Cinema programme redesign is a user-centered screen system, not decorative slop', () => {
  const html=read('index.html'),app=read('js/app.js');
  const css=read('styles-reframe.css');
  assert.ok(html.includes('styles-reframe.css?v=20261104-reframe1'));
  assert.ok(read('Dockerfile').includes('COPY index.html styles-cinema.css styles-reframe.css'),
    'Production image must serve the visual system instead of a 404 CSS response');
  assert.ok(html.indexOf('styles-cinema.css')<html.indexOf('styles-reframe.css'));
  assert.ok(html.includes('data-view="discover" aria-current="page">Scopri'));
  assert.ok(html.includes('data-view="explore">Catalogo'));
  assert.ok(!html.includes('class="explore-button"'), 'Remove redundant Explore action');
  assert.ok(html.indexOf('class="catalog-search-section"') < html.indexOf('class="catalog-filters"'),
    'Global search must precede all additional filters');
  assert.ok(app.includes("$('#collection-section').hidden=home"),
    'Discovery should not repeat the entire personal collection below the recommendations');
  assert.ok(app.includes("case'mark-feature-watched':"),'Recommendation supports rapid viewing entry');
  assert.ok(app.includes("Hai visto tutto ciò che hai salvato."),'Provide a meaningful completion state');
  for(const token of ['--ui-ground','--ui-ink','--ui-card','--ui-dark','--ui-accent',
    '--motion-fast','--motion-regular','--motion-out']) {
    assert.ok(css.includes(token),'Missing design token '+token);
  }
  assert.ok(css.includes('grid-template-columns:repeat(5,minmax(0,1fr))'));
  assert.ok(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
  assert.ok(css.includes('.theme-tags {')&&css.includes('flex-wrap:nowrap'),
    'Theme filters should remain horizontal instead of wrapping into a wall');
  assert.ok(css.includes('(prefers-reduced-motion:reduce)'),
    'All motion must respect users with reduced-motion preference');
  assert.ok(css.includes('(hover:hover) and (pointer:fine)'),
    'Pointer hover artwork transitions must not affect touch users');
  assert.ok(!css.includes('gsap')&&!css.includes('backdrop-filter:blur(28px)'),
    'Avoid unnecessary animation dependencies and decorative effects');
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
  assert.ok(html.includes('styles-cinema.css?v=20261104-multilists'));
  assert.ok(html.includes('js/app.js?v=20261104-multilists'));
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
  assert.ok(html.includes('styles-cinema.css?v=20261104-multilists'));
  assert.ok(html.includes('js/app.js?v=20261104-multilists'));
});

test('Global catalog has genre chips, Anime and a separate reset button', () => {
  const html=read('index.html'),client=read('js/remote-catalog.js'),server=read('server/catalog-api.mjs');
  for(const id of ['global-type','global-themes','catalog-query','clear-global-filters']) {
    assert.ok(html.includes('id="'+id+'"'),'Missing global catalog control '+id);
  }
  assert.ok(html.indexOf('id="global-type"')<html.indexOf('id="global-themes"'));
  assert.ok(html.indexOf('id="catalog-search-form"')<html.indexOf('id="global-themes"'),
    'The search action must precede optional genre refinements');
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
  assert.ok(html.includes('styles-cinema.css?v=20261104-multilists'));
});

test('Personal lists keep existing films and their diaries without duplication', () => {
  const context=createContext({window:{},Date,Math});
  new Script(read('js/lists.js')).runInContext(context);
  const m=context.window.EmotecaLists;
  const films=[{id:'warrior-2011',rating:10,status:'watched',notes:'Ricordo privato'},
    {id:'your-name-2016',rating:8,status:'watched',notes:'Secondo ricordo'}];
  const base=m.initial(films);
  assert.equal(base.length,1);
  assert.equal(base[0].id,'mia-lista');
  assert.deepEqual([...base[0].filmIds],['warrior-2011','your-name-2016']);
  let lists=m.create(base,'Serata horror');
  assert.equal(lists.length,2);
  const second=lists[1].id;
  lists=m.setMembership(lists,second,'warrior-2011',true);
  lists=m.setMembership(lists,second,'warrior-2011',true);
  assert.deepEqual([...lists[1].filmIds],['warrior-2011'],'No duplicate membership');
  assert.equal(lists[0].filmIds.length,2);
  lists=m.setMembership(lists,second,'warrior-2011',false);
  assert.equal(lists[1].filmIds.length,0);
  assert.equal(films[0].notes,'Ricordo privato');
  assert.equal(films[0].rating,10);
  lists=m.rename(lists,second,'Maratona horror');
  assert.equal(lists[1].name,'Maratona horror');
  lists=m.remove(lists,second);
  assert.equal(lists.length,1);
  assert.throws(()=>m.remove(lists,'mia-lista'),/iniziale/);
  assert.throws(()=>m.create(lists,'La mia lista'),/già/);
  assert.throws(()=>m.normalize([{id:'lista-test',name:'Orfana',filmIds:[]}],films),/iniziale/);
  const restored=m.normalize(m.initial(films),films);
  assert.deepEqual([...restored[0].filmIds],films.map(f=>f.id));
  const longFilmId='movie-'+ 'a'.repeat(83); // 89 characters, valid in validateFilm().
  const longFilm=[...films,{id:longFilmId,title:'Titolo lungo',status:'watchlist'}];
  const migratedInput=m.initial(longFilm); // vm-realm objects, like an IndexedDB record.
  migratedInput[0].filmIds=[longFilmId];
  const migrated=m.normalize(migratedInput,longFilm);
  assert.deepEqual([...migrated[0].filmIds],[longFilmId],
    'List film IDs must support the same 90-character maximum as the film schema');
  const tooLongListId=m.create(m.initial(films),'Lista nuova');
  tooLongListId[1].id='x'.repeat(65);
  assert.throws(()=>m.normalize(tooLongListId,films),/Identificativo/);
  const snapshot=read('js/db.js');
  assert.ok(snapshot.includes('writeSnapshot'));
  assert.ok(snapshot.includes("LIST_KEY='personal-lists-v1'"));
  assert.ok(snapshot.includes("tx.objectStore('state').put(films,KEY)"));
  assert.ok(snapshot.includes("tx.objectStore('state').put(lists,LIST_KEY)"));
});
test('Unhealthy lists never trigger a destructive overwrite from an ordinary film save', () => {
  const app=read('js/app.js');
  assert.ok(app.includes('let listStorageError=null'));
  assert.ok(app.includes('if(listStorageError){')&&app.includes('await CatalogDB.write(next)'),
    'A film edit must write only films while the persisted list record is unreadable');
  assert.ok(app.includes("if(listStorageError)throw Error("),
    'List management must be read-only until the underlying record is checked');
  assert.ok(app.includes("const storedLists=await CatalogDB.readLists()"),
    'Backup should contain the actual stored lists, not synthetic fallback');
  assert.ok(app.includes("console.warn('Emoteca: impossibile leggere o convalidare"));
});

test('Personal collections UI supports multiple lists, backup and list management', () => {
  const html=read('index.html'),app=read('js/app.js'),css=read('styles-cinema.css');
  for(const id of ['personal-lists','personal-list-tabs','list-dialog','list-form','list-name-input','personal-list-management']) {
    assert.ok(html.includes('id="'+id+'"'),'Missing list control '+id);
  }
  assert.ok(html.includes('>Le mie liste <span id="count-all"'));
  assert.ok(html.includes('data-action="create-list"'));
  assert.ok(html.includes('data-action="rename-list"'));
  assert.ok(html.includes('data-action="delete-list"'));
  assert.ok(app.includes('function renderListTabs()'));
  assert.ok(app.includes('function changeListMembership('));
  assert.ok(app.includes("window.EmotecaLists.initial(films)"));
  assert.ok(app.includes("await CatalogDB.writeSnapshot(next,nextLists)"));
  assert.ok(app.includes('payload.lists=storedLists')&&app.includes('async function exportBackup()'),
    'JSON backup must include the stored membership record without replacing it with a synthetic fallback');
  assert.ok(app.includes("listSnapshot:jsonPlan.listSnapshot"),'JSON import should restore lists');
  assert.ok(css.includes('.personal-list-tab.active'));
  assert.ok(html.includes('js/app.js?v=20261104-multilists'));
  assert.ok(html.includes('styles-cinema.css?v=20261104-multilists'));
});

test('Preserve original IndexedDB name and JSON backup format', () => {
  assert.ok(read('js/db.js').includes('afterframe-catalog-v1'));
  assert.ok(read('js/app.js').includes("format:'afterframe-catalog'"));
});
