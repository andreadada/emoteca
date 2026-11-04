/**
 * Emoteca catalog proxy.
 * A server-side TMDB token enables full browse/search/posters without exposing credentials.
 * No user library, watch history or notes are sent to this service.
 * Node 22+, no third-party dependencies.
 */
import http from 'node:http';

const TOKEN = (process.env.TMDB_READ_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
const PORT = Number(process.env.CATALOG_PORT || 8787);
// Testing-only loopback endpoint. Production always uses the official TMDB HTTPS API.
const TEST_BASE = process.env.TMDB_TEST_BASE || '';
const BASE = process.env.NODE_ENV === 'test' &&
  /^http:\/\/127\.0\.0\.1:\d+\/3$/.test(TEST_BASE)
  ? TEST_BASE : 'https://api.themoviedb.org/3';
const TTL = 10 * 60 * 1000;
const MAX_CACHE = 300;
const cache = new Map();
const imagePath = (path, size = 'w500') =>
  /^\/[a-zA-Z0-9_.-]+\.(?:jpg|jpeg|png|webp)$/i.test(path || '')
    ? `https://image.tmdb.org/t/p/${size}${path}` : '';
const yearOf = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? Number(date.slice(0, 4)) : null;
const numericId = (value) => /^\d{1,10}$/.test(String(value)) && Number(value) > 0 ? Number(value) : null;
const clampPage = (value) => { const n = Number(value || 1); return Number.isInteger(n) && n >= 1 && n <= 500 ? n : null; };
const acceptableQuery = (value) => {
  const q = String(value || '').trim();
  return q.length >= 2 && q.length <= 120 && !/[\u0000-\u001f]/.test(q) ? q : null;
};
const typeOf = (value) => value === 'tv' ? 'tv' : value === 'movie' ? 'movie' : null;

// TMDB genre identifiers differ by medium. A missing TV genre means "not classified"
// there, not permission to silently include unrelated mystery/fantasy shows.
const GENRES = {
  azione: { movie: [28], tv: [10759] },
  avventura: { movie: [12], tv: [10759] },
  animazione: { movie: [16], tv: [16] },
  commedia: { movie: [35], tv: [35] },
  crime: { movie: [80], tv: [80] },
  documentario: { movie: [99], tv: [99] },
  drammatico: { movie: [18], tv: [18] },
  famiglia: { movie: [10751], tv: [10751] },
  fantascienza: { movie: [878], tv: [10765] },
  fantasy: { movie: [14], tv: [10765] },
  guerra: { movie: [10752], tv: [10768] },
  horror: { movie: [27], tv: [] },
  mistero: { movie: [9648], tv: [9648] },
  musica: { movie: [10402], tv: [] },
  romantico: { movie: [10749], tv: [] },
  storia: { movie: [36], tv: [] },
  thriller: { movie: [53], tv: [] }
};
function parseGenres(value) {
  if (!value) return [];
  const keys = value.split(',').filter(Boolean);
  if (keys.length > 12 || keys.some(key => !Object.hasOwn(GENRES,key)) ||
    new Set(keys).size !== keys.length) return null;
  return keys;
}
const selectedMedia = type => type === 'movie' ? ['movie'] : type === 'tv' ? ['tv'] : ['movie','tv'];
function matchesGenres(entry, media, genres, isAnime) {
  if (isAnime && !(entry.original_language === 'ja' &&
    Array.isArray(entry.genre_ids) && entry.genre_ids.includes(16))) return false;
  if (!genres.length) return true;
  const ids = Array.isArray(entry.genre_ids) ? entry.genre_ids : [];
  return genres.some(key => GENRES[key][media].some(id => ids.includes(id)));
}
function discoverParams(media,genres,isAnime,page) {
  const ids = [...new Set(genres.flatMap(key => GENRES[key][media]))];
  const params = { language:'it-IT', include_adult:false,
    sort_by:'popularity.desc',page };
  if (isAnime) {
    params.with_genres = '16';
    params.with_original_language = 'ja';
  } else if (ids.length) params.with_genres = ids.join('|');
  return params;
}


function normalize(item, selectedType) {
  const media = selectedType || typeOf(item.media_type);
  if (!media || !item || !Number.isSafeInteger(item.id) || item.id <= 0 || item.adult) return null;
  const title = media === 'tv' ? item.name : item.title;
  if (typeof title !== 'string' || !title.trim()) return null;
  const originalTitle = media === 'tv' ? item.original_name : item.original_title;
  const date = media === 'tv' ? item.first_air_date : item.release_date;
  const id = 'tmdb-' + media + '-' + item.id;
  return {
    id, provider: 'tmdb', source: 'TMDB', sourceId: String(item.id), media,
    title: title.trim().slice(0, 180),
    originalTitle: typeof originalTitle === 'string' ? originalTitle.slice(0, 180) : '',
    year: yearOf(date),
    type: media === 'tv' ? 'serie' : 'film',
    description: typeof item.overview === 'string' ? item.overview.slice(0, 900) : '',
    poster: imagePath(item.poster_path),
    backdrop: imagePath(item.backdrop_path, 'w1280'),
    voteAverage: Number.isFinite(item.vote_average) ? item.vote_average : null,
    ratingCount: Number.isFinite(item.vote_count) ? item.vote_count : 0,
    duration: Number.isFinite(item.runtime) && item.runtime > 0 ? item.runtime + ' min' : '',
    genre: Array.isArray(item.genres) ? item.genres.map(x => x.name).filter(x => typeof x === 'string').join(' · ').slice(0, 100) : '',
    sourceUrl: `https://www.themoviedb.org/${media}/${item.id}`
  };
}
function respond(res, code, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(body);
}
function getCached(key) {
  const value = cache.get(key);
  if (!value) return null;
  if (value.expiry < Date.now()) { cache.delete(key); return null; }
  cache.delete(key); cache.set(key, value);
  return value.payload;
}
function setCached(key, payload) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { expiry: Date.now() + TTL, payload });
  while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
}
async function fetchTMDB(path, params) {
  const url = new URL(BASE + path);
  Object.entries(params || {}).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const cacheKey = url.toString();
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const response = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + TOKEN, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) {
    const err = new Error(response.status === 401 || response.status === 403
      ? 'Token TMDB non valido o non autorizzato.'
      : response.status === 429 ? 'Limite temporaneo di richieste al catalogo.' : 'Catalogo TMDB temporaneamente non disponibile.');
    err.status = response.status === 401 || response.status === 403 ? 502 : response.status === 429 ? 429 : 502;
    throw err;
  }
  const data = await response.json();
  setCached(cacheKey, data);
  return data;
}
function formatPage(data, media, genres = [], anime = false, filteredSearch = false) {
  const list = (Array.isArray(data.results) ? data.results : [])
    .filter(item => {
      const kind = media || typeOf(item.media_type);
      return kind && matchesGenres(item,kind,genres,anime);
    }).map(item => normalize(item,media)).filter(Boolean);
  return { source: 'TMDB', items: list, page: Number(data.page) || 1,
    totalPages: Math.min(500, Number(data.total_pages) || 1),
    totalResults: filteredSearch ? null : Number(data.total_results) || 0,
    filteredSearch };
}
async function browse(type,genres,page) {
  const anime = type === 'anime';
  if (type === 'all' && !genres.length) {
    const data = await fetchTMDB('/trending/all/week',{language:'it-IT',page});
    return formatPage(data,null);
  }
  const media = selectedMedia(type);
  const results = await Promise.all(media.map(kind => {
    if (genres.length && !anime && !genres.some(key => GENRES[key][kind].length))
      return Promise.resolve({page,total_pages:1,total_results:0,results:[]});
    return fetchTMDB('/discover/'+kind, discoverParams(kind,genres,anime,page));
  }));
  const entries = results.flatMap((data,index)=>(data.results || [])
    .filter(item=>matchesGenres(item,media[index],genres,anime))
    .map(item=>({...item,media_type:media[index]})));
  entries.sort((a,b)=>(b.popularity||0)-(a.popularity||0));
  return {source:'TMDB',items:entries.map(item=>normalize(item)).filter(Boolean),
    page,totalPages:Math.min(500,Math.max(...results.map(r=>r.total_pages||1))),
    totalResults:anime&&genres.length ? null : results.reduce((sum,r)=>sum+(r.total_results||0),0),
    filteredSearch:anime&&genres.length};
}
async function handle(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  if (req.method !== 'GET') return respond(res, 405, { error: 'Metodo non consentito.' });
  if (url.pathname === '/api/catalog/status') {
    return respond(res, 200, { provider: TOKEN ? 'tmdb' : 'wikidata', enabled: Boolean(TOKEN),
      message: TOKEN ? 'Catalogo TMDB disponibile.' : 'Configura TMDB_READ_TOKEN sul server per sfogliare e ottenere locandine dal catalogo TMDB.' });
  }
  if (!TOKEN) return respond(res, 503, { error: 'Catalogo TMDB non configurato.', code: 'TMDB_NOT_CONFIGURED' });
  try {
    if (url.pathname === '/api/catalog/search') {
      const q = acceptableQuery(url.searchParams.get('q'));
      const page = clampPage(url.searchParams.get('page'));
      const requested = url.searchParams.get('type') || 'all';
      const type = requested === 'anime' || requested === 'all' ? null : typeOf(requested);
      const genres = parseGenres(url.searchParams.get('genres'));
      if (!q || !page || genres === null ||
          !['all','movie','tv','anime'].includes(requested))
        return respond(res, 400, { error: 'Ricerca non valida.' });
      const path = type ? '/search/' + type : '/search/multi';
      const data = await fetchTMDB(path, { query: q, language: 'it-IT', include_adult: false, page });
      return respond(res, 200, formatPage(data,type,genres,requested==='anime',
        genres.length>0||requested==='anime'));
    }
    if (url.pathname === '/api/catalog/discover') {
      const page = clampPage(url.searchParams.get('page'));
      const requested = url.searchParams.get('type') || 'all';
      const genres = parseGenres(url.searchParams.get('genres'));
      if (!page || genres === null || !['all','movie','tv','anime'].includes(requested))
        return respond(res, 400, { error: 'Pagina o formato non valido.' });
      return respond(res, 200, await browse(requested,genres,page));
    }
    if (url.pathname === '/api/catalog/detail') {
      const media = typeOf(url.searchParams.get('type'));
      const id = numericId(url.searchParams.get('id'));
      if (!media || !id) return respond(res, 400, { error: 'Identificativo non valido.' });
      const item = await fetchTMDB('/' + media + '/' + id, { language: 'it-IT' });
      const normalized = normalize(item, media);
      if (!normalized) return respond(res, 404, { error: 'Titolo non trovato.' });
      return respond(res, 200, { source: 'TMDB', item: normalized });
    }
    if (url.pathname === '/api/catalog/poster') {
      const q = acceptableQuery(url.searchParams.get('title'));
      const year = url.searchParams.get('year');
      const media = typeOf(url.searchParams.get('type') || 'movie');
      if (!q || !media || (year && !/^\d{4}$/.test(year))) return respond(res, 400, { error: 'Titolo non valido.' });
      const data = await fetchTMDB('/search/' + media, {
        query: q, language: 'it-IT', include_adult: false, page: 1,
        ...(year ? { year: year } : {})
      });
      const matches = (data.results || []).map(x => normalize(x, media)).filter(Boolean);
      const target = q.toLocaleLowerCase('it').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      const best = matches.find(x => {
        const title = x.title.toLocaleLowerCase('it').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        const original = x.originalTitle.toLocaleLowerCase('it').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        return (title === target || original === target) && (!year || String(x.year) === year);
      });
      return respond(res, 200, { item: best || null });
    }
    return respond(res, 404, { error: 'Endpoint inesistente.' });
  } catch (error) {
    const code = error.name === 'TimeoutError' ? 504 : (error.status || 502);
    return respond(res, code, { error: code === 504 ? 'Ricerca scaduta: riprova.' : (error.message || 'Errore del catalogo.') });
  }
}
const server = http.createServer((req, res) => { handle(req, res).catch(() => respond(res, 500, { error: 'Errore interno.' })); });
server.listen(PORT, '127.0.0.1');
