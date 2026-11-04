import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('All browser scripts parse as JavaScript', () => {
  for (const file of ['js/data.js', 'js/db.js', 'js/app.js', 'js/remote-catalog.js']) {
    assert.doesNotThrow(() => new Script(read(file), { filename: file }));
  }
});

test('App loads the explorer and cinematic stylesheet after core assets', () => {
  const html = read('index.html');
  for (const file of ['styles-cinema.css', 'js/data.js', 'js/db.js', 'js/app.js', 'js/remote-catalog.js']) {
    assert.ok(existsSync(new URL('../' + file, import.meta.url)), 'Missing ' + file);
    assert.ok(html.includes(file), 'HTML does not include ' + file);
  }
  for (const id of ['explore-page', 'global-grid', 'catalog-query', 'catalog-search-form', 'catalog-token',
    'catalog-setup', 'global-next', 'local-matches', 'detail-screen', 'detail-content', 'film-page-title']) {
    assert.ok(html.includes('id="' + id + '"'), 'Missing new catalog control ' + id);
  }
  assert.ok(html.indexOf('js/app.js') < html.indexOf('js/remote-catalog.js'));
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
    'results-count', 'type-filters', 'sort-filter', 'tag-filter']) {
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
  assert.ok(html.includes('styles-cinema.css?v=20261104-posterfix'));
  assert.ok(html.includes('js/app.js?v=20261104-posterfix'));
});

test('Preserve original IndexedDB name and JSON backup format', () => {
  assert.ok(read('js/db.js').includes('afterframe-catalog-v1'));
  assert.ok(read('js/app.js').includes("format:'afterframe-catalog'"));
});
