/* Emoteca identity layer: reconcile local history with provider metadata safely.
 * Local IDs remain stable. An optional catalogId points to a verified global record.
 * No user-owned fields are overwritten by automatic catalog enrichment.
 */
(function () {
  'use strict';
  const normal = value => String(value ?? '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  const mediaOf = item => {
    const explicit = item?.media;
    if (explicit === 'movie' || explicit === 'tv') return explicit;
    if (item?.type === 'serie' || item?.type === 'anime') return 'tv';
    if (['film', 'film-anime', 'film-animazione'].includes(item?.type)) return 'movie';
    return null;
  };
  const canonical = item => {
    const id = String(item?.catalogId || item?.id || '');
    return /^tmdb-(?:movie|tv)-[1-9]\d*$/.test(id) || /^wikidata-q[1-9]\d*$/.test(id) ? id : '';
  };
  const aliases = item => [item?.title, item?.originalTitle, item?.catalogTitle, item?.posterQuery]
    .filter(Boolean).map(normal).filter(Boolean);
  function matches(local, remote) {
    if (!local || !remote) return false;
    const mine = canonical(local), theirs = canonical(remote);
    if (mine && theirs && mine === theirs) return true;
    // Different known canonical IDs are never reconciled just because of a title.
    if (mine && theirs && mine !== theirs && mine.startsWith('tmdb-') &&
        theirs.startsWith('tmdb-')) return false;
    if (mediaOf(local) !== mediaOf(remote) ||
        !Number.isInteger(local.year) || local.year !== remote.year) return false;
    const localNames = new Set(aliases(local));
    return aliases(remote).some(value => localNames.has(value));
  }
  function findSaved(library, remote) {
    return (library || []).find(film => matches(film, remote)) || null;
  }
  function chooseSeedMatch(seed, results, searchedTerm) {
    if (!seed || !Array.isArray(results)) return null;
    const eligible = results.filter(remote =>
      remote?.provider === 'tmdb' && /^tmdb-(movie|tv)-[1-9]\d*$/.test(remote.id) &&
      mediaOf(seed) === mediaOf(remote) && seed.year === remote.year);
    if (!eligible.length) return null;
    const aliasesForSeed = new Set(aliases(seed));
    const exact = eligible.filter(item => aliases(item).some(name => aliasesForSeed.has(name)));
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return null;
    // TMDB search also indexes translated and alternate names. An unambiguous
    // same-year, same-media match is accepted only for a sufficiently specific query.
    if (normal(searchedTerm).length >= 5 && eligible.length === 1 &&
        aliasesForSeed.has(normal(searchedTerm))) return eligible[0];
    return null;
  }
  const isSafeImage = url => /^https:\/\//i.test(url || '') && String(url).length <= 400;
  function enrichSaved(local, remote, initial) {
    if (!local || !remote || remote.provider !== 'tmdb' || !remote.id ||
        mediaOf(local) !== mediaOf(remote) || local.year !== remote.year) return null;
    const mine = canonical(local);
    if (mine && mine.startsWith('tmdb-') && mine !== remote.id) return null;
    const seed = initial && initial.id === local.id ? initial : null;
    const updated = {
      ...local,
      catalogId: remote.id,
      catalogSource: 'TMDB',
      catalogTitle: String(remote.title || '').slice(0, 180),
      // A public backdrop is just metadata: there is no change to local notes.
      backdrop: isSafeImage(remote.backdrop) ? remote.backdrop : (local.backdrop || '')
    };
    for (const name of ['description', 'genre', 'duration']) {
      if (typeof remote[name] !== 'string' || !remote[name].trim()) continue;
      if (seed && local[name] !== seed[name]) continue; // user edited since seed
      if (!seed && local[name]) continue; // never silently replace user entries
      updated[name] = remote[name].slice(0, name === 'description' ? 900 : 400);
    }
    if (isSafeImage(remote.poster) &&
        (!local.poster || (seed && local.poster === seed.poster))) {
      updated.poster = remote.poster;
    }
    const url = String(remote.sourceUrl || '');
    if (/^https:\/\/www\.themoviedb\.org\/(?:movie|tv)\/[1-9]\d+$/.test(url)) {
      const existing = Array.isArray(local.links) ? local.links : [];
      if (!existing.some(link => link.url === url) && existing.length < 20) {
        updated.links = [...existing, { name: 'TMDB · Scheda ufficiale', url }];
      }
    }
    return updated;
  }
  window.EmotecaIdentity = { normal, mediaOf, canonical, matches, findSaved,
    chooseSeedMatch, enrichSaved };
})();
