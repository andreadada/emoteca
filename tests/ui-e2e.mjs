import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const origin = process.env.EMOTECA_ORIGIN || 'http://127.0.0.1:8000';
await mkdir('ui-screenshots', { recursive: true });
const browser = await chromium.launch({ headless: true });
const failures = [];

async function scenario(name, viewport, run) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.locator('.film-card').first().waitFor();
    await run(page);
    assert.deepEqual(errors, [], name + ': unexpected JavaScript runtime errors');
    console.log('PASS ' + name);
  } catch (error) {
    failures.push({ name, error: error.stack || error.message });
    console.error('FAIL ' + name + ': ' + error.message);
    await page.screenshot({ path: 'ui-screenshots/failure-' + name.split(' ')[0] + '.png' }).catch(() => {});
  } finally {
    await context.close();
  }
}

async function wikidataStub(page) {
  await page.route('https://www.wikidata.org/w/api.php**', async route => {
    const action = new URL(route.request().url()).searchParams.get('action');
    if (action === 'wbsearchentities') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ search: [{ id: 'Q123456' }] }) });
    }
    if (action === 'wbgetentities') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        entities: { Q123456: {
          id: 'Q123456', labels: { it: { value: 'Prova del catalogo globale' } },
          descriptions: { it: { value: 'Titolo esterno per verificare la ricerca.' } },
          claims: {
            P31: [{ mainsnak: { snaktype:'value', datavalue: { value: { id:'Q11424' } } } }],
            P577: [{ mainsnak: { snaktype:'value', datavalue: { value: { time:'+2016-01-01T00:00:00Z' } } } }]
          }
        } }
      }) });
    }
    return route.fulfill({ status: 404, body: '{}' });
  });
}

await scenario('desktop movie and diary route', { width: 1440, height: 900 }, async page => {
  assert.equal(await page.locator('.sidebar').count(), 0, 'No old dashboard sidebar');
  assert.ok((await page.locator('.film-card').count()) >= 20);
  const featured = await page.locator('.feature-title').textContent();
  assert.ok(featured && featured.length > 0);
  const currentFeatured = await page.evaluate(title => window.SEED_FILMS.find(f => f.title === title), featured);
  assert.ok(currentFeatured && currentFeatured.status !== 'watched' && currentFeatured.reaction === 'unseen');
  await page.screenshot({ path: 'ui-screenshots/desktop-home.png', fullPage: true });

  const nextFeature = await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.feature-title').waitFor();
  if (await page.locator('.film-card').count() > 3) {
    assert.notEqual(await page.locator('.feature-title').textContent(), featured, 'Featured title should change on refresh');
  }

  await page.locator('.nav-link[data-view="all"]').click();
  assert.equal(await page.locator('#section-title').textContent(), 'La mia lista');
  await page.screenshot({ path: 'ui-screenshots/desktop-library.png', fullPage: true });

  await page.locator('#film-grid .card-name').first().click();
  assert.equal(await page.locator('#detail-screen').isVisible(), true, 'Movie is now a page');
  assert.equal(await page.locator('#detail-dialog').count(), 0, 'No detail dialog');
  assert.match(page.url(), /\?film=/);
  await page.screenshot({ path: 'ui-screenshots/desktop-film-page.png', fullPage: true });

  await page.locator('#personal-notes').fill('Annotazione personale di prova.');
  await page.locator('[data-action="save-personal"]').click();
  await page.locator('#personal-notes').waitFor();
  assert.equal(await page.locator('#personal-notes').inputValue(), 'Annotazione personale di prova.');
  await page.locator('[data-action="back-detail"]').click();
  assert.equal(await page.locator('#detail-screen').isVisible(), false);
  await page.locator('[data-action="add"].tool-icon').click();
  assert.equal(await page.locator('#edit-dialog').evaluate(dialog => dialog.open), true);
  await page.locator('#edit-dialog [data-close="edit-dialog"]').first().click();
});

await scenario('remote poster cannot cover homepage layout', { width: 1440, height: 900 }, async page => {
  // Reproduce what happens after Coolify receives a working TMDB token:
  // metadata arrives after the initial rendering and updates existing covers.
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAFElEQVR4nGO0iWpiYGBgYmBgQFAAFNYBHn6EXKoAAAAASUVORK5CYII=','base64');
  await page.route('**/api/catalog/status', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ provider: 'tmdb', enabled: true, message: 'Ready' })
  }));
  await page.route('**/api/catalog/poster?**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ item: { poster: 'https://image.tmdb.org/t/p/w500/emoteca-test.png' } })
  }));
  await page.route('https://image.tmdb.org/t/p/**', route => route.fulfill({
    status: 200, contentType: 'image/png', body: pixel
  }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    document.querySelector('.feature-poster > .poster-image[src*="emoteca-test.png"]') !== null,
    null, { timeout: 18000 });
  await page.waitForFunction(() =>
    document.querySelector('#editorial-rail .poster-wrap > .poster-image[src*="emoteca-test.png"]') !== null,
    null, { timeout: 18000 });

  const layout = await page.evaluate(() => {
    const hero = document.querySelector('#hero').getBoundingClientRect();
    const heroPoster = document.querySelector('.feature-poster').getBoundingClientRect();
    const strayImages = [...document.querySelectorAll('img.poster-image')]
      .filter(image => !image.parentElement.matches('.poster-wrap, .feature-poster, .detail-poster'))
      .map(image => image.parentElement.tagName + '.' + image.parentElement.className);
    return { heroHeight:hero.height, heroPosterWidth:heroPoster.width,
      strayImages, heroActionImages:document.querySelectorAll('.feature-actions img').length,
      cardTitleImages:document.querySelectorAll('.card-name img').length };
  });
  assert.deepEqual(layout.strayImages, [], 'Remote image must only appear inside artwork slots');
  assert.equal(layout.heroActionImages, 0, 'Never append a cover inside the hero CTA');
  assert.equal(layout.cardTitleImages, 0, 'Never append a cover inside a film title button');
  assert.ok(layout.heroHeight < 1400, 'Artwork must not force unbounded page dimensions');
  assert.ok(layout.heroPosterWidth <= 350, 'Artwork width must stay constrained by its poster wrapper');
  await page.screenshot({ path: 'ui-screenshots/desktop-remote-poster-fixed.png', fullPage: true });
});

await scenario('global search fallback, save and open new film', { width: 1440, height: 900 }, async page => {
  await wikidataStub(page);
  await page.locator('.nav-link[data-view="explore"]').click();
  assert.equal(await page.locator('#explore-page').isVisible(), true);
  assert.equal(await page.locator('#source-dialog').count(), 0);
  await page.locator('#catalog-query').fill('Prova del catalogo');
  await page.locator('#global-grid .card-name').first().waitFor({ timeout: 14000 });
  assert.match(await page.locator('#catalog-provider').textContent(), /Wikidata/);
  assert.match(await page.locator('#global-grid .card-name').first().textContent(), /Prova del catalogo globale/);
  await page.screenshot({ path: 'ui-screenshots/desktop-global-search.png', fullPage: true });

  await page.locator('#global-grid .card-name').first().click();
  assert.equal(await page.locator('#detail-screen').isVisible(), true);
  assert.match(page.url(), /film=wikidata-q123456/);
  assert.ok(await page.locator('[data-action="add-preview"]').count() >= 1);
  await page.screenshot({ path: 'ui-screenshots/desktop-global-film.png', fullPage: true });
  await page.locator('.detail-intro [data-action="add-preview"]').click();
  await page.locator('#personal-notes').waitFor();
  assert.ok(await page.locator('.reaction-panel').isVisible());
  assert.match(await page.locator('.detail-intro h2').textContent(), /Prova del catalogo globale/);
});

await scenario('preloaded films are catalog entries without duplicate library rows', { width: 1440, height: 900 }, async page => {
  const codeGeass={
    id:'tmdb-tv-32123',provider:'tmdb',source:'TMDB',sourceId:'32123',media:'tv',
    type:'serie',title:'Code Geass: Lelouch of the Rebellion',
    originalTitle:'Code Geass: Lelouch of the Rebellion',year:2006,
    poster:'https://image.tmdb.org/t/p/w500/code.jpg',
    backdrop:'',description:'Testo del catalogo ufficiale',genre:'Animazione',
    sourceUrl:'https://www.themoviedb.org/tv/32123'
  };
  const yourName={id:'tmdb-movie-372058',provider:'tmdb',source:'TMDB',sourceId:'372058',
    media:'movie',type:'film',title:'Your Name',originalTitle:'Your Name',
    year:2016,poster:'',description:'Trama dal catalogo',sourceUrl:'https://www.themoviedb.org/movie/372058'};
  const residentEvil={id:'tmdb-movie-1423191',provider:'tmdb',source:'TMDB',sourceId:'1423191',
    media:'movie',type:'film',title:'Resident Evil',originalTitle:'Resident Evil',
    year:2026,poster:'',description:'Film non presente nella libreria',
    sourceUrl:'https://www.themoviedb.org/movie/1423191'};
  await page.route('**/api/catalog/status', route => route.fulfill({
    status:200, contentType:'application/json',
    body:JSON.stringify({provider:'tmdb',enabled:true})
  }));
  await page.route('**/api/catalog/search?**', route => {
    const q=new URL(route.request().url()).searchParams.get('q')||'';
    return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({source:'TMDB',items:/geass/i.test(q)?[codeGeass]:[],
        page:1,totalPages:1,totalResults:/geass/i.test(q)?1:0})});
  });
  await page.route('**/api/catalog/discover?**', route => route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({source:'TMDB',items:[codeGeass,yourName,residentEvil],
      page:1,totalPages:1,totalResults:3})
  }));
  await page.route('**/api/catalog/detail?**', route => route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({source:'TMDB',item:codeGeass})
  }));
  await page.route('**/api/catalog/poster?**', route => route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify({item:null})
  }));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('.nav-link[data-view="explore"]').click();
  await page.locator('#global-grid .global-film').first().waitFor();

  const savedLabels=await page.locator('#global-grid .film-flag').allTextContents();
  assert.ok(savedLabels.some(x=>x.includes('Da guardare')), 'Code Geass preloaded should already be saved');
  assert.ok(savedLabels.some(x=>x.includes('Già visto')), 'Your Name preloaded should already be watched');
  assert.equal(await page.locator('#global-grid .global-save:disabled').count(),2,
    'Only the two personal-library titles must be considered saved');
  await page.locator('#global-grid .card-name').first().click();
  await page.locator('#detail-screen').waitFor({state:'visible',timeout:12000});
  assert.match(page.url(),/film=code-geass-2006/);
  assert.ok(await page.locator('#personal-notes').isVisible(), 'Preloaded film must have its diary, not Add button');
  await page.locator('#personal-notes').fill('Nota salvata prima del collegamento.');
  await page.locator('#detail-screen [data-action="save-personal"]').click();

  await page.waitForFunction(async () => {
    const row=(await window.CatalogDB.read()).find(x=>x.id==='code-geass-2006');
    return row?.catalogId==='tmdb-tv-32123';
  },null,{timeout:20000});
  const saved=await page.evaluate(async ()=>{
    const data=await window.CatalogDB.read();
    const film=data.find(x=>x.id==='code-geass-2006');
    return {length:data.length,id:film.id,catalogId:film.catalogId,
      description:film.description,notes:film.notes,status:film.status};
  });
  assert.equal(saved.length,34,'Linking must never duplicate the initial movie');
  assert.equal(saved.id,'code-geass-2006','Preserve stable local URLs');
  assert.equal(saved.catalogId,'tmdb-tv-32123');
  assert.equal(saved.description,'Testo del catalogo ufficiale');
  assert.equal(saved.notes,'Nota salvata prima del collegamento.');
  assert.equal(saved.status,'watchlist');
  await page.locator('[data-action="back-detail"]').click();
  await page.locator('.nav-link[data-view="explore"]').click();
  await page.locator('#global-grid .global-film').last().locator('.card-name').click();
  assert.ok(await page.locator('.detail-intro [data-action="add-preview"]').isVisible(),
    'Resident Evil is not part of the seeded library');
  await page.screenshot({path:'ui-screenshots/global-and-seed-linked.png',fullPage:true});
});

await scenario('global theme toggle, Anime browsing and search reset', {width:1440,height:900}, async page=>{
  const anime={id:'tmdb-tv-77',provider:'tmdb',source:'TMDB',sourceId:'77',media:'tv',
    type:'serie',title:'Anime di prova',originalTitle:'Anime no test',year:2020,
    poster:'',description:'Anime da TMDB',sourceUrl:'https://www.themoviedb.org/tv/77'};
  const horror={id:'tmdb-movie-123',provider:'tmdb',source:'TMDB',sourceId:'123',media:'movie',
    type:'film',title:'Horror di prova',originalTitle:'Horror test',year:2024,
    poster:'',description:'Film Horror',sourceUrl:'https://www.themoviedb.org/movie/123'};
  const urls=[];
  await page.route('**/api/catalog/status',route=>route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({provider:'tmdb',enabled:true})
  }));
  await page.route('**/api/catalog/discover?**',route=>{
    const url=new URL(route.request().url());urls.push(url);
    const type=url.searchParams.get('type');
    const genres=url.searchParams.get('genres');
    const items=type==='anime'?[anime]:genres==='horror'?[horror]:[anime,horror];
    return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({source:'TMDB',items,page:1,totalPages:2,totalResults:10})});
  });
  await page.route('**/api/catalog/search?**',route=>{
    const url=new URL(route.request().url());urls.push(url);
    const items=url.searchParams.get('type')==='anime'?[anime]:[anime,horror];
    return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({source:'TMDB',items,page:1,totalPages:2,totalResults:null,filteredSearch:true})});
  });
  await page.route('**/api/catalog/poster?**',route=>route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify({item:null})
  }));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('.nav-link[data-view="explore"]').click();
  await page.locator('#global-grid .global-film').first().waitFor();
  assert.ok(await page.locator('#global-themes [data-global-theme="horror"]').isVisible());
  assert.ok(await page.locator('#global-type [data-catalog-type="anime"]').isVisible());
  assert.equal(await page.locator('#clear-global-filters').isDisabled(),true);
  const order=await page.evaluate(()=>({
    types:document.querySelector('#global-type').getBoundingClientRect().top,
    themes:document.querySelector('#global-themes').getBoundingClientRect().top,
    search:document.querySelector('#catalog-query').getBoundingClientRect().top
  }));
  assert.ok(order.types<order.themes&&order.themes<order.search);
  await page.locator('#global-themes [data-global-theme="horror"]').click();
  await page.waitForFunction(()=>document.querySelector('#global-grid .card-name')?.textContent==='Horror di prova');
  assert.equal(await page.locator('#global-themes [data-global-theme="horror"]').getAttribute('aria-pressed'),'true');
  assert.ok(urls.some(u=>u.pathname.endsWith('/discover')&&u.searchParams.get('genres')==='horror'));
  await page.locator('#global-themes [data-global-theme="fantasy"]').click();
  await page.waitForFunction(()=>document.querySelector('#global-themes [data-global-theme="fantasy"]')?.getAttribute('aria-pressed')==='true');
  assert.ok(urls.some(u=>u.pathname.endsWith('/discover')&&u.searchParams.get('genres')==='fantasy,horror'));
  await page.locator('#global-type [data-catalog-type="anime"]').click();
  await page.waitForFunction(()=>document.querySelector('#global-grid .card-name')?.textContent==='Anime di prova');
  assert.ok(urls.some(u=>u.searchParams.get('type')==='anime'));
  await page.locator('#catalog-query').fill('anime');
  await page.waitForFunction(()=>document.querySelector('#catalog-count')?.textContent.includes('corrispondenze'),null,{timeout:9000});
  assert.ok(urls.some(u=>u.pathname.endsWith('/search')&&u.searchParams.get('type')==='anime'&&u.searchParams.get('q')==='anime'));
  assert.equal(await page.locator('#clear-global-filters').isDisabled(),false);
  await page.screenshot({path:'ui-screenshots/desktop-global-theme-filters.png',fullPage:true});
  await page.locator('#clear-global-filters').click();
  await page.waitForFunction(()=>document.querySelector('#global-type [data-catalog-type="all"]')?.getAttribute('aria-pressed')==='true');
  assert.equal(await page.locator('#catalog-query').inputValue(),'');
  assert.equal(await page.locator('#global-themes [data-global-theme="all"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#global-themes [aria-pressed="true"]').count(),1);
  assert.equal(await page.locator('#clear-global-filters').isDisabled(),true);
});

await scenario('global chips and Anime do not overflow mobile', {width:390,height:844}, async page=>{
  await page.locator('.nav-link[data-view="explore"]').click();
  await page.locator('#global-type [data-catalog-type="anime"]').click();
  await page.locator('#global-themes [data-global-theme="horror"]').click();
  assert.equal(await page.locator('#global-type [data-catalog-type="anime"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#global-themes [data-global-theme="horror"]').getAttribute('aria-pressed'),'true');
  const excess=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(excess<=1,'Global filter row must not overflow: '+excess);
  await page.screenshot({path:'ui-screenshots/mobile-global-theme-filters.png',fullPage:true});
  await page.locator('#clear-global-filters').click();
  assert.equal(await page.locator('#global-type [data-catalog-type="all"]').getAttribute('aria-pressed'),'true');
});

await scenario('library genre chips and clear-all filter UI', { width: 1440, height: 900 }, async page => {
  await page.evaluate(async () => {
    await window.AfterframeCatalog.addExternal({
      id:'library-horror-test-2025',title:'Horror Lab',year:2025,type:'film',
      genre:'Horror · Thriller',tags:['mistero'],status:'watchlist',reaction:'unseen',
      poster:'',description:'Film inserito per verificare filtri e ricerca.'
    });
  });
  await page.locator('.nav-link[data-view="all"]').click();
  assert.equal(await page.locator('#tag-filter').count(),0, 'Old theme dropdown removed');
  assert.ok(await page.locator('#theme-filters [data-theme="all"]').isVisible());
  assert.ok(await page.locator('#theme-filters [data-theme="horror"]').isVisible());
  assert.ok(await page.locator('#library-search').isVisible());
  assert.equal(await page.locator('#clear-library-filters').isDisabled(),true);
  const layout=await page.evaluate(()=>({
    categories:document.querySelector('#type-filters').getBoundingClientRect().top,
    themes:document.querySelector('#theme-filters').getBoundingClientRect().top,
    search:document.querySelector('#library-search').getBoundingClientRect().top
  }));
  assert.ok(layout.categories<layout.themes && layout.themes<layout.search,
    'Categories, themes, and search must appear in distinct stacked rows');

  await page.locator('#type-filters [data-type="film"]').click();
  await page.locator('#theme-filters [data-theme="horror"]').click();
  assert.equal(await page.locator('#theme-filters [data-theme="horror"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#film-grid .film-card').count(),1);
  assert.equal(await page.locator('#film-grid .card-name').first().textContent(),'Horror Lab');

  // Tags are inclusive OR; the film format remains a separate AND filter.
  await page.locator('#theme-filters [data-theme="fantasy"]').click();
  assert.ok((await page.locator('#film-grid .film-card').count())>1);
  await page.locator('#library-search').fill('horror lab');
  assert.equal(await page.locator('#film-grid .film-card').count(),1);
  assert.equal(await page.locator('#search').inputValue(),'',
    'Local search must not change the header global search');
  await page.screenshot({path:'ui-screenshots/desktop-theme-chips.png',fullPage:true});

  await page.locator('#sort-filter').selectOption('newest');
  await page.locator('#clear-library-filters').click();
  assert.equal(await page.locator('#library-search').inputValue(),'');
  assert.equal(await page.locator('#type-filters [data-type="all"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#theme-filters [data-theme="all"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#theme-filters [aria-pressed="true"]').count(),1);
  assert.equal(await page.locator('#sort-filter').inputValue(),'match');
  assert.equal(await page.locator('#clear-library-filters').isDisabled(),true);
  assert.equal(await page.locator('#film-grid .film-card').count(),35);
});

await scenario('mobile library tag filters do not overflow', { width: 390, height: 844 }, async page => {
  await page.locator('.nav-link[data-view="all"]').click();
  await page.locator('#theme-filters [data-theme="horror"]').click();
  assert.equal(await page.locator('#theme-filters [data-theme="horror"]').getAttribute('aria-pressed'),'true');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(overflow<=1,'Theme filters must wrap on mobile, overflow='+overflow);
  await page.screenshot({path:'ui-screenshots/mobile-theme-chips.png',fullPage:true});
  await page.locator('#clear-library-filters').click();
  assert.equal(await page.locator('#theme-filters [data-theme="all"]').getAttribute('aria-pressed'),'true');
});


await scenario('personal lists migrate, create, rename and delete safely', {width:1440,height:900}, async page=>{
  await page.locator('.nav-link[data-view="all"]').click();
  assert.equal(await page.locator('#section-title').textContent(),'La mia lista');
  assert.equal(await page.locator('#film-grid .film-card').count(),34);
  assert.equal((await page.evaluate(async()=>window.CatalogDB.readLists()))[0].filmIds.length,34);
  await page.locator('[data-action="create-list"]').click();
  await page.locator('#list-name-input').fill('Serata horror');
  await page.locator('#list-form button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#section-title')?.textContent==='Serata horror');
  assert.equal(await page.locator('#section-title').textContent(),'Serata horror');
  assert.equal(await page.locator('#film-grid .film-card').count(),0);
  const listId=await page.evaluate(async()=>(await window.CatalogDB.readLists())[1].id);
  await page.locator('.nav-link[data-view="watchlist"]').click();
  const filmId=await page.locator('#film-grid .card-name').first().getAttribute('data-open');
  await page.locator('#film-grid .card-name').first().click();
  const chip=page.locator('[data-action="toggle-list-membership"][data-list-id="'+listId+'"]');
  assert.equal(await chip.getAttribute('aria-pressed'),'false');
  await chip.click();
  await page.waitForFunction(id=>document.querySelector('[data-action="toggle-list-membership"][data-list-id="'+id+'"]')?.getAttribute('aria-pressed')==='true',listId);
  assert.equal(await chip.getAttribute('aria-pressed'),'true');
  await page.locator('[data-action="back-detail"]').click();
  await page.locator('.nav-link[data-view="all"]').click();
  assert.equal(await page.locator('#film-grid .film-card').count(),1);
  assert.equal(await page.locator('#film-grid .card-name').first().getAttribute('data-open'),filmId);
  await page.screenshot({path:'ui-screenshots/desktop-personal-lists.png',fullPage:true});
  await page.locator('#film-grid [data-action="remove-from-list"]').first().click();
  await page.waitForFunction(()=>document.querySelectorAll('#film-grid .film-card').length===0);
  assert.equal(await page.locator('#film-grid .film-card').count(),0);
  assert.equal((await page.evaluate(async()=>window.CatalogDB.read())).length,34);
  assert.equal((await page.evaluate(async()=>window.CatalogDB.readLists()))[0].filmIds.length,34);
  await page.locator('[data-action="rename-list"]').click();
  await page.locator('#list-name-input').fill('Cinema del weekend');
  await page.locator('#list-form button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#section-title')?.textContent==='Cinema del weekend');
  assert.equal(await page.locator('#section-title').textContent(),'Cinema del weekend');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-action="delete-list"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#personal-list-tabs .personal-list-tab').length===1);
  assert.equal(await page.locator('#personal-list-tabs .personal-list-tab').count(),1);
  assert.equal(await page.locator('#section-title').textContent(),'La mia lista');
  assert.equal(await page.locator('#film-grid .film-card').count(),34);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('.nav-link[data-view="all"]').click();
  assert.equal((await page.evaluate(async()=>window.CatalogDB.readLists())).length,1);
});

await scenario('new global film can be saved directly to a chosen list', {width:1440,height:900}, async page=>{
  await wikidataStub(page);
  await page.locator('.nav-link[data-view="all"]').click();
  await page.locator('[data-action="create-list"]').click();
  await page.locator('#list-name-input').fill('Film con amici');
  await page.locator('#list-form button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#section-title')?.textContent==='Film con amici');
  const target=await page.evaluate(async()=>(await window.CatalogDB.readLists())[1].id);
  await page.locator('.nav-link[data-view="explore"]').click();
  await page.locator('#catalog-query').fill('Prova del catalogo');
  await page.locator('#global-grid .card-name').first().waitFor({timeout:14000});
  await page.locator('#global-grid .card-name').first().click();
  await page.locator('#preview-target-list').selectOption(target);
  await page.locator('.detail-intro [data-action="add-preview"]').click();
  await page.waitForFunction(async id=>{
    const lists=await window.CatalogDB.readLists();
    return lists.some(list=>list.id===id&&list.filmIds.includes('wikidata-q123456'));
  },target);
  const lists=await page.evaluate(async()=>window.CatalogDB.readLists());
  assert.equal(lists[0].filmIds.length,34,'Catalog import must not silently change default list');
  assert.deepEqual(lists[1].filmIds,['wikidata-q123456']);
  const rows=await page.evaluate(async()=>window.CatalogDB.read());
  assert.equal(rows.length,35);
  assert.equal(rows.filter(f=>f.id==='wikidata-q123456').length,1);
  await page.locator('[data-action="back-detail"]').click();
  await page.locator('.nav-link[data-view="all"]').click();
  assert.equal(await page.locator('#section-title').textContent(),'Film con amici');
  assert.equal(await page.locator('#film-grid .film-card').count(),1);
});

await scenario('mobile personal lists do not overflow', {width:390,height:844}, async page=>{
  await page.locator('.nav-link[data-view="all"]').click();
  await page.locator('[data-action="create-list"]').click();
  await page.locator('#list-name-input').fill('Anime da rivedere');
  await page.locator('#list-form button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#section-title')?.textContent==='Anime da rivedere');
  assert.equal(await page.locator('#section-title').textContent(),'Anime da rivedere');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(overflow<=1,'Personal list navigation overflow '+overflow+'px');
  await page.screenshot({path:'ui-screenshots/mobile-personal-lists.png',fullPage:true});
});

await scenario('mobile navigation, catalog and full film page', { width: 390, height: 844 }, async page => {
  await wikidataStub(page);
  assert.equal(await page.locator('.site-nav').isVisible(), true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, 'Mobile page overflows by ' + overflow + ' px');
  await page.screenshot({ path: 'ui-screenshots/mobile-home.png', fullPage: true });

  await page.locator('.nav-link[data-view="watchlist"]').click();
  assert.equal(await page.locator('#section-title').textContent(), 'Da guardare');
  await page.locator('#film-grid .card-name').first().click();
  assert.equal(await page.locator('#detail-screen').isVisible(), true);
  await page.screenshot({ path: 'ui-screenshots/mobile-film.png', fullPage: true });
  await page.locator('[data-action="back-detail"]').click();

  await page.locator('.nav-link[data-view="explore"]').click();
  await page.locator('#catalog-query').fill('Prova del catalogo');
  await page.locator('#global-grid .card-name').first().waitFor({ timeout: 14000 });
  await page.screenshot({ path: 'ui-screenshots/mobile-global-search.png', fullPage: true });
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);
});

await browser.close();
if (failures.length) {
  for (const item of failures) console.error(item.name + '\n' + item.error);
  process.exitCode = 1;
}
