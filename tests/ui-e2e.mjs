import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const origin = 'http://127.0.0.1:8000';
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
    await run(page, errors);
    assert.deepEqual(errors, [], name + ': unexpected JavaScript runtime errors');
    console.log('PASS ' + name);
  } catch (error) {
    failures.push({ name, error: error.stack || error.message });
    console.error('FAIL ' + name + ': ' + error.message);
  } finally {
    await context.close();
  }
}

await scenario('desktop feature + collection flows', { width: 1440, height: 900 }, async (page, errors) => {
  assert.equal(await page.locator('.sidebar').count(), 0, 'No dashboard sidebar');
  assert.ok((await page.locator('.film-card').count()) >= 20);
  assert.equal(await page.locator('.feature-title').textContent(), 'Warrior');
  assert.ok(await page.locator('#editorial-rail .film-card').count() >= 4);
  await page.screenshot({ path: 'ui-screenshots/desktop-home.png', fullPage: true });

  await page.evaluate(()=>document.addEventListener('click',(e)=>{document.body.dataset.lastNavigation=e.target.closest('[data-view]')?.dataset.view||'none';},true));
  await page.locator('[data-view="all"].nav-link').click();
  console.log('DEBUG desktop nav',await page.evaluate(()=>({hash:location.hash,last:document.body.dataset.lastNavigation,active:[...document.querySelectorAll('.nav-link.active')].map(el=>el.dataset.view),section:document.querySelector('#section-title')?.textContent})),errors);
  assert.equal(await page.locator('#section-title').textContent(), 'La libreria');
  assert.equal(await page.locator('#hero').isVisible(), false);
  await page.screenshot({ path: 'ui-screenshots/desktop-library.png', fullPage: true });

  await page.locator('#search').fill('Interstellar');
  assert.ok((await page.locator('#film-grid .film-card').count()) >= 1);
  assert.match(await page.locator('#film-grid .card-name').first().textContent(), /Interstellar/i);
  await page.locator('#film-grid .card-name').first().click();
  assert.equal(await page.locator('#detail-dialog').evaluate((dialog) => dialog.open), true);
  await page.screenshot({ path: 'ui-screenshots/desktop-detail.png' });
  await page.locator('#detail-dialog [data-close="detail-dialog"]').click();

  await page.locator('[data-action="open-source"].explore-button').click();
  assert.equal(await page.locator('#source-dialog').evaluate((dialog) => dialog.open), true);
  assert.ok(await page.locator('#source-query').isVisible());
  await page.screenshot({ path: 'ui-screenshots/desktop-search.png' });
  await page.locator('#source-dialog [data-close="source-dialog"]').click();
  await page.locator('[data-action="add"].tool-icon').click();
  assert.equal(await page.locator('#edit-dialog').evaluate((dialog) => dialog.open), true);
  await page.locator('#edit-dialog [data-close="edit-dialog"]').click();
});

await scenario('mobile navigation and readability', { width: 390, height: 844 }, async (page) => {
  assert.ok(await page.locator('.site-nav').isVisible());
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, 'Mobile page overflows by ' + overflow + ' px');
  await page.screenshot({ path: 'ui-screenshots/mobile-home.png', fullPage: true });
  await page.locator('.nav-link[data-view="watchlist"]').click();
  console.log('DEBUG mobile nav',await page.evaluate(()=>({hash:location.hash,active:[...document.querySelectorAll('.nav-link.active')].map(el=>el.dataset.view),section:document.querySelector('#section-title')?.textContent})),errors);
  assert.equal(await page.locator('#section-title').textContent(), 'Da guardare');
  assert.ok((await page.locator('#film-grid .film-card').count()) >= 1);
  await page.screenshot({ path: 'ui-screenshots/mobile-watchlist.png', fullPage: true });
  await page.locator('[data-action="open-source"].explore-button').click();
  assert.equal(await page.locator('#source-dialog').evaluate((dialog) => dialog.open), true);
  await page.screenshot({ path: 'ui-screenshots/mobile-search.png' });
});

await browser.close();
if (failures.length) {
  for (const item of failures) console.error(item.name + '\n' + item.error);
  process.exitCode = 1;
}
