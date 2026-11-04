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
  assert.equal(await page.locator('#section-title').textContent(), 'La libreria');
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
