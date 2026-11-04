import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('All browser scripts parse as JavaScript', () => {
  for (const file of ['js/data.js', 'js/db.js', 'js/app.js', 'js/remote-catalog.js']) {
    assert.doesNotThrow(() => new Script(read(file), { filename: file }));
  }
});

test('App loads the explorer and cinematic stylesheet after core assets', () => {
  const html = read('index.html');
  for (const file of ['styles.css', 'styles-premium.css', 'js/data.js', 'js/db.js', 'js/app.js', 'js/remote-catalog.js']) {
    assert.ok(existsSync(new URL('../' + file, import.meta.url)), 'Missing ' + file);
    assert.ok(html.includes(file), 'HTML does not include ' + file);
  }
  for (const id of ['source-dialog', 'source-form', 'source-query', 'source-results', 'source-feedback', 'source-next', 'source-submit', 'source-token', 'source-token-wrap']) {
    assert.ok(html.includes('id="' + id + '"'), 'Missing source control ' + id);
  }
  assert.ok(html.indexOf('js/app.js') < html.indexOf('js/remote-catalog.js'));
});

test('Existing catalog validation supports source-imported films with unknown editorial scores', () => {
  const window = {};
  const listeners = [];
  const document = { addEventListener: (event, handler) => listeners.push([event, handler]) };
  const storage = { getItem: () => null };
  const context = createContext({ window, document, localStorage: storage, location: { href: 'https://example.org/' }, console });
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
  assert.ok(remote.includes("origin: '*'"));
  assert.ok(remote.includes("window.AfterframeCatalog.addExternal"));
  assert.ok(!remote.includes('localStorage'));
  assert.ok(!remote.includes('sessionStorage'));
  assert.ok(!/eyJhbGciOi|sk-[A-Za-z0-9]{16}/.test(remote), 'Unexpected embedded credential');
});

test('Preserve original IndexedDB name and JSON backup format', () => {
  assert.ok(read('js/db.js').includes('afterframe-catalog-v1'));
  assert.ok(read('js/app.js').includes("format:'afterframe-catalog'"));
});
