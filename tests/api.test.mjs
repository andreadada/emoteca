import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const movie = { id: 123, media_type: 'movie', title: 'La dolce vita', original_title: 'La dolce vita',
  release_date: '1960-02-05', poster_path: '/movieposter.jpg', backdrop_path: '/moviebackdrop.jpg',
  overview: 'Un giornalista osserva la vita romana.', vote_average: 8.1, vote_count: 999,
  genre_ids:[18,27], original_language:'it',popularity:120 };
const series = { id: 77, media_type: 'tv', name: 'Serie di prova', original_name: 'Example Series',
  first_air_date: '2020-01-01', poster_path: '/tvposter.png', overview: 'Test della serie.',
  original_language:'ja', genre_ids:[16,10765], popularity:95 };
const person = { id: 456, media_type: 'person', name: 'Attore' };
const animeMovie = { id: 232, media_type: 'movie', title:'Film anime',original_title:'Anime Feature',
  release_date:'2001-07-01',genre_ids:[16,14],original_language:'ja',popularity:70,
  poster_path:'/animefilm.png',overview:'Test anime movie.' };
const fixtureRequests = [];
const fixture = createServer((req, res) => {
  if (req.headers.authorization !== 'Bearer test-only-secret')
    return void res.writeHead(403).end('Forbidden');
  const requestUrl = new URL(req.url,'http://localhost');
  const path = requestUrl.pathname;
  fixtureRequests.push(requestUrl);
  let body;
  if (path === '/3/search/multi' || path === '/3/trending/all/week') {
    body = { page: 1, total_pages: 4, total_results: 80, results: [movie, series, person] };
  } else if (path === '/3/search/movie') {
    body = { page:1, total_pages:1, total_results:1, results:[movie] };
  } else if (path === '/3/discover/movie') {
    const anime=requestUrl.searchParams.get('with_original_language')==='ja';
    body = { page:1,total_pages:2,total_results:anime?12:14,results:anime?[animeMovie]:[movie] };
  } else if (path === '/3/discover/tv') {
    body = { page:1,total_pages:3,total_results:10,results:[series] };
  } else if (path === '/3/search/tv') {
    body = { page:1,total_pages:1,total_results:1,results:[series] };
  } else if (path === '/3/movie/123') {
    body = { ...movie, genres: [{ name:'Drammatico' }], runtime: 173,
      credits:{cast:[{name:'Attore Test',character:'Protagonista'}],
        crew:[{name:'Regista Test',job:'Director'},{name:'Scrittore Test',job:'Screenplay'}]},
      videos:{results:[{site:'YouTube',type:'Trailer',official:true,key:'abcdefghijk'}]}};
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
  assert.equal(detail.item.backdrop,'https://image.tmdb.org/t/p/w1280/moviebackdrop.jpg');
  assert.deepEqual(detail.item.directors,['Regista Test']);
  assert.deepEqual(detail.item.writers,['Scrittore Test']);
  assert.deepEqual(detail.item.cast,[{name:'Attore Test',role:'Protagonista'}]);
  assert.equal(detail.item.trailerUrl,'https://www.youtube.com/watch?v=abcdefghijk');
  assert.ok(fixtureRequests.some(x=>x.pathname==='/3/movie/123'&&
    x.searchParams.get('append_to_response')==='credits,videos'));

  const poster = await (await fetch(base + '/api/catalog/poster?title=La%20dolce%20vita&year=1960&type=movie')).json();
  assert.equal(poster.item?.poster,'https://image.tmdb.org/t/p/w500/movieposter.jpg');

  const horror = await (await fetch(base+'/api/catalog/discover?page=1&type=movie&genres=horror')).json();
  assert.equal(horror.items.length,1,'Film Horror comes from TMDB genre 27');
  assert.ok(fixtureRequests.some(u=>u.pathname==='/3/discover/movie' &&
    u.searchParams.get('with_genres')==='27'));
  const horrorAll = await (await fetch(base+'/api/catalog/discover?page=1&type=all&genres=horror')).json();
  assert.equal(horrorAll.items.length,1,'Do not treat unrelated TV Mystery as Horror');
  assert.equal(horrorAll.items[0].id,'tmdb-movie-123');
  const anime = await (await fetch(base+'/api/catalog/discover?page=1&type=anime')).json();
  assert.deepEqual(anime.items.map(x=>x.id),['tmdb-tv-77','tmdb-movie-232']);
  assert.ok(fixtureRequests.some(u=>u.pathname==='/3/discover/tv' &&
    u.searchParams.get('with_original_language')==='ja' &&
    u.searchParams.get('with_genres')==='16'));
  const genreSearch=await (await fetch(base+'/api/catalog/search?q=all&type=all&genres=horror')).json();
  assert.deepEqual(genreSearch.items.map(x=>x.id),['tmdb-movie-123']);
  assert.equal(genreSearch.filteredSearch,true);
  assert.equal(genreSearch.totalResults,null,'Do not invent filtered total search counts');
  assert.equal(genreSearch.totalPages,4,'Keep pagination for filtered search pages');
  const animeSearch=await (await fetch(base+'/api/catalog/search?q=Serie&type=anime')).json();
  assert.deepEqual(animeSearch.items.map(x=>x.id),['tmdb-tv-77']);
  assert.equal((await fetch(base+'/api/catalog/search?q=Film&genres=notreal')).status,400);
  assert.equal((await fetch(base+'/api/catalog/discover?type=anime&genres=horror,horror')).status,400);
  assert.equal((await fetch(base+'/api/catalog/discover?type=invalid')).status,400);

  assert.equal((await fetch(base + '/api/catalog/search?q=x')).status,400);
  assert.equal((await fetch(base + '/api/catalog/search?q=Film&page=999')).status,400);
  assert.equal((await fetch(base + '/api/catalog/detail?type=movie&id=abc')).status,400);
  assert.equal((await fetch(base + '/api/catalog/not-found')).status,404);
  assert.equal((await fetch(base + '/api/catalog/search', { method:'POST' })).status,405);
});
