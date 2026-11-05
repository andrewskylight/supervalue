const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const APP = 'http://localhost:8080/', API = 'http://localhost:8090/exec';
const shots = path.join(__dirname, 'shots'); fs.mkdirSync(shots, { recursive: true });
const key = fs.readFileSync(path.join(__dirname, '.key'), 'utf8');
const ctl = async q => (await fetch('http://localhost:8090/__ctl?' + q)).json();
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };
const setupHash = '#setup=' + Buffer.from(JSON.stringify({ url: API, key })).toString('base64');

(async () => {
  const browser = await chromium.launch();
  const phone = { ...devices['iPhone 13'] };
  delete phone.defaultBrowserType;
  const A = await browser.newContext({ ...phone, serviceWorkers: 'allow' });
  const a = await A.newPage();
  a.on('dialog', d => d.accept());
  a.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });

  // 1. first load at home, via setup link
  await a.goto(APP + setupHash);
  await a.waitForSelector('.group');
  const groups = await a.$$eval('.group h2', hs => hs.map(h => h.firstChild.textContent));
  ok(groups[0] === 'Needs isle', 'needs-aisle group is first: ' + groups.slice(0, 4).join(' | '));
  const needs = await a.$$eval('.group.needs .item', l => l.length);
  ok(needs === 8, 'needs-aisle has 8 items (got ' + needs + ')');
  const total = await a.$eval('.progress', e => e.textContent);
  ok(/0 \/ 74/.test(total), 'shopping list counts 74 items with a quantity: ' + total);
  ok(!a.url().includes('setup='), 'setup link removed from address bar');
  await a.waitForFunction(() => navigator.serviceWorker.controller !== null || (location.reload(), false), null, { timeout: 10000 }).catch(() => {});
  await a.reload(); await a.waitForSelector('.group');
  ok(await a.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page');
  await a.screenshot({ path: path.join(shots, '1-shop-en.png'), fullPage: false });

  // 2. at the store: no internet
  await A.setOffline(true); await ctl('down=1');
  await a.reload(); await a.waitForSelector('.group');
  ok(true, 'app reopens with no internet');
  const cookies = a.locator('.item', { hasText: 'cookies' });
  await cookies.locator('[data-act=edit]').click();
  await a.waitForSelector('#editor[open]');
  await a.screenshot({ path: path.join(shots, '3-editor.png') });
  await a.click('#editor .choices[data-field=aisle] .opt[data-v="3"]');
  await a.click('#editor .choices[data-field=side] .opt[data-v="L"]');
  await a.click('#editor .choices[data-field=level] .opt[data-v="Top"]');
  await a.click('#editor [data-act=save]');
  const a3 = a.locator('.group', { hasText: 'Isle 3' });
  ok(await a3.locator('.item', { hasText: 'cookies' }).count() === 1, 'cookies moved into Aisle 3 while offline');
  ok((await a.textContent('#syncBtn')).includes('3 waiting'), 'pill shows 3 waiting changes: ' + await a.textContent('#syncBtn'));
  await a.locator('.item', { hasText: 'bananas' }).locator('[data-act=check]').click();
  await a.reload(); await a.waitForSelector('.group');
  ok(await a.locator('.item.done', { hasText: 'bananas' }).count() === 1, 'checkmark survives reload offline');
  ok(await a.locator('.group', { hasText: 'Isle 3' }).locator('.item', { hasText: 'cookies' }).count() === 1, 'offline edit survives reload');
  await a.screenshot({ path: path.join(shots, '2-shop-offline.png') });

  // 3. back home: sync
  await ctl('down=0'); await A.setOffline(false);
  await a.evaluate(() => window.__sva.sync(true));
  await a.waitForFunction(() => !document.querySelector('#syncBtn').textContent.includes('waiting'));
  let st = await ctl('');
  const hdr = st.grid[0]; const col = n => hdr.indexOf(n);
  const row = st.grid.find(r => r[0] === 'cookies');
  ok(row[col('SV-Isle')] === 3 && row[col('Loc-R/L')] === 'L' && row[col('Loc: level')] === 'Top', 'sheet row updated: aisle 3 / L / Top');
  ok(hdr.includes('App ID') && hdr.includes('App Sync'), 'helper columns added to sheet');

  // 4. conflict: phone B edits offline, then someone edits the sheet later; sheet (newer) wins
  const B = await browser.newContext({ ...phone });
  const b = await B.newPage(); b.on('dialog', d => d.accept());
  await b.goto(APP + setupHash); await b.waitForSelector('.group');
  await B.setOffline(true); await ctl('down=1');
  const bc = b.locator('.item', { hasText: 'cookies' });
  await bc.locator('[data-act=edit]').click();
  await b.click('#editor .choices[data-field=aisle] .opt[data-v="4"]');
  await b.click('#editor [data-act=save]');
  await new Promise(r => setTimeout(r, 50));
  await ctl('down=0');
  const id = row[col('App ID')];
  await ctl('sheetEdit=' + encodeURIComponent(JSON.stringify([id, 'aisle', 5])));
  await B.setOffline(false);
  await b.evaluate(() => window.__sva.sync(true));
  await b.waitForFunction(() => !document.querySelector('#syncBtn').textContent.includes('waiting'));
  st = await ctl('');
  ok(st.grid.find(r => r[0] === 'cookies')[col('SV-Isle')] === 5, 'newer sheet edit kept over older phone edit');
  ok(await b.locator('.group', { hasText: 'Isle 5' }).locator('.item', { hasText: 'cookies' }).count() === 1, 'phone B now shows Aisle 5');

  // 5. Spanish + All items tab
  await a.click('[data-lang=es]');
  const es = await a.$$eval('.group h2', hs => hs.map(h => h.firstChild.textContent));
  ok(es[0] === 'Falta pasillo' && es.some(x => x.startsWith('Pasillo 2')), 'Spanish headings: ' + es.slice(0, 3).join(' | '));
  ok(await a.locator('.item', { hasText: 'bananos' }).count() === 1, 'Spanish item names');
  await a.screenshot({ path: path.join(shots, '4-shop-es.png') });
  await a.click('[data-tab=all]');
  await a.fill('#search', 'ron');
  const rum = a.locator('#allList .item', { hasText: 'blanco ron' });
  ok(await rum.count() === 1, 'search finds rum (not on list)');
  await rum.locator('[data-act=plus]').click();
  ok((await rum.locator('.stepper b').textContent()) === '1', 'qty + works on All items');
  await a.screenshot({ path: path.join(shots, '5-all-es.png') });
  await a.click('[data-lang=en]'); await a.click('[data-tab=shop]');
  ok(await a.locator('.item', { hasText: 'white rum' }).count() === 1, 'rum now on shopping list');
  await a.evaluate(() => window.__sva.sync(true));
  await a.waitForFunction(() => !document.querySelector('#syncBtn').textContent.includes('waiting'));
  st = await ctl('');
  ok(st.grid.find(r => r[0] === 'white rum')[col('Cant')] === 1, 'qty synced to sheet');

  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
