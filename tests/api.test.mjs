import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const movie = { id: 123, media_type: 'movie', title: 'La dolce vita', original_title: 'La dolce vita',
  release_date: '1960-02-05', poster_path: '/movieposter.jpg', backdrop_path: '/moviebackdrop.jpg',
  overview: 'Un giornalista osserva la vita romana.', vote_average: 8.1, vote_count: 999 };
const series = { id: 77, media_type: 'tv', name: 'Serie di prova', original_name: 'Example Series',
  first_air_date: '2020-01-01', poster_path: '/tvposter.png', overview: 'Test della serie.' };
const person = { id: 456, media_type: 'person', name: 'Attore' };
const fixture = createServer((req, res) => {
  if (req.headers.authorization !== 'Bearer test-only-secret')
    return void res.writeHead(403).end('Forbidden');
  const path = new URL(req.url, 'http://localhost').pathname;
  let body;
  if (path === '/3/search/multi' || path === '/3/trending/all/week') {
    body = { page: 1, total_pages: 4, total_results: 80, results: [movie, series, person] };
  } else if (path === '/3/search/movie') {
    body = { page:1, total_pages:1, total_results:1, results:[movie] };
  } else if (path === '/3/movie/123') {
    body = { ...movie, genres: [{ name:'Drammatico' }], runtime: 173 };
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return void res.end(JSON.stringify({ error:'missing fixture' }));
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
});

test('TMDB proxy normalizes search, discovery, details and posters with a server-held token', async t => {
  fixture.listen(0, '127.0.0.1');
  await once(fixture, 'listening');
  const port = fixture.address().port;
  const reserver = createServer();
  reserver.listen(0, '127.0.0.1');
  await once(reserver, 'listening');
  const localPort = reserver.address().port;
  await new Promise(resolve => reserver.close(resolve));
  const child = spawn(process.execPath,
    [fileURLToPath(new URL('../server/catalog-api.mjs', import.meta.url))], {
    env: { ...process.env, NODE_ENV:'test',
      TMDB_READ_TOKEN:'test-only-secret', TMDB_TEST_BASE:'http://127.0.0.1:' + port + '/3',
      CATALOG_PORT:String(localPort) }, stdio:'pipe'
  });
  t.after(async () => {
    child.kill('SIGTERM');
    await new Promise(resolve => fixture.close(resolve));
  });

  const base = 'http://127.0.0.1:' + localPort;
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(base + '/api/catalog/status');
      if (r.ok) { ready = true; break; }
    } catch {}
    await sleep(100);
  }
  assert.ok(ready, 'API should become ready on configured local port');
  const status = await (await fetch(base + '/api/catalog/status')).json();
  assert.equal(status.enabled, true);
  assert.equal(status.provider, 'tmdb');
  assert.ok(!JSON.stringify(status).includes('test-only-secret'));

  const search = await (await fetch(base + '/api/catalog/search?q=La%20dolce%20vita&type=all&page=1')).json();
  assert.equal(search.source,'TMDB');
  assert.equal(search.items.length,2);
  assert.equal(search.items[0].id,'tmdb-movie-123');
  assert.equal(search.items[0].poster,'https://image.tmdb.org/t/p/w500/movieposter.jpg');
  assert.equal(search.items[0].year,1960);
  assert.equal(search.items[1].id,'tmdb-tv-77');
  assert.equal(search.totalPages,4);
  assert.equal(search.totalResults,80);

  const discover = await (await fetch(base + '/api/catalog/discover?type=all&page=1')).json();
  assert.equal(discover.items.length,2);
  const detail = await (await fetch(base + '/api/catalog/detail?type=movie&id=123')).json();
  assert.equal(detail.item.duration,'173 min');
  assert.equal(detail.item.genre,'Drammatico');

  const poster = await (await fetch(base + '/api/catalog/poster?title=La%20dolce%20vita&year=1960&type=movie')).json();
  assert.equal(poster.item?.poster,'https://image.tmdb.org/t/p/w500/movieposter.jpg');

  assert.equal((await fetch(base + '/api/catalog/search?q=x')).status,400);
  assert.equal((await fetch(base + '/api/catalog/search?q=Film&page=999')).status,400);
  assert.equal((await fetch(base + '/api/catalog/detail?type=movie&id=abc')).status,400);
  assert.equal((await fetch(base + '/api/catalog/not-found')).status,404);
  assert.equal((await fetch(base + '/api/catalog/search', { method:'POST' })).status,405);
});
