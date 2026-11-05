const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const APP = 'http://localhost:8080/', API = 'http://localhost:8090/exec';
const key = fs.readFileSync(path.join(__dirname, '.key'), 'utf8');
const ctl = async q => (await fetch('http://localhost:8090/__ctl?' + q)).json();
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch(); const phone = { ...devices['iPhone 13'] }; delete phone.defaultBrowserType;
  const ctx = await b.newContext({ ...phone, deviceScaleFactor: 2 }); const p = await ctx.newPage();
  p.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await p.goto(APP + '#setup=' + Buffer.from(JSON.stringify({ url: API, key })).toString('base64'));
  await p.waitForSelector('.group'); await p.waitForFunction(() => navigator.serviceWorker.controller);
  ok(await p.locator('#addFab').isHidden(), 'no Add button on the Isle list');
  await p.click('[data-tab=compile]');
  ok(await p.locator('#addFab').isVisible(), 'floating Add item button on Compile list');

  // offline, add from the "refrigerador" section
  await ctx.setOffline(true); await ctl('down=1');
  const fridge = p.locator('.group.loc', { has: p.locator('h2', { hasText: /^refrigerador/ }) });
  await fridge.locator('[data-act=add-item]').click();
  await p.waitForSelector('#editor[open]');
  ok(await p.inputValue('[data-f=loc]') === 'refrigerador', 'section + Add pre-fills boat location');
  await p.click('#editor [data-act=save]');
  ok((await p.textContent('#editor .err')) === 'Enter the English name', 'blank name rejected');
  await p.fill('[data-f=eng]', 'Ketchup ');
  await p.click('#editor [data-act=save]');
  ok((await p.textContent('#editor .err')).startsWith('Already in the list: ketchup'), 'duplicate rejected: ' + await p.textContent('#editor .err'));
  await p.fill('[data-f=eng]', 'oat milk'); await p.fill('[data-f=spa]', 'leche de avena');
  await p.fill('[data-f=unit]', 'carton'); await p.fill('[data-f=daily]', '0,5');
  await p.click('#editor .stepper [data-step="1"]');           // qty 1 -> 2 (re-render must keep typed text)
  await p.click('#editor .choices[data-field=aisle] .opt[data-v="4"]');
  await p.click('#editor .choices[data-field=side] .opt[data-v="R"]');
  ok(await p.inputValue('[data-f=spa]') === 'leche de avena', 'typed text survives button taps');
  await p.screenshot({ path: path.join(__dirname, 'shots', 'add-form.png') });
  await p.click('#editor [data-act=save]');
  ok((await p.textContent('#toast')).includes('oat milk'), 'toast: ' + await p.textContent('#toast'));
  ok(await fridge.locator('.item', { hasText: 'oat milk' }).count() === 1, 'new item shows in refrigerador section (offline)');
  await fridge.locator('.item', { hasText: 'oat milk' }).locator('[data-act=plus]').click();   // edit before sync: 3
  await p.reload(); await p.waitForSelector('.group.loc');
  ok(await p.locator('.group.loc .item', { hasText: 'oat milk' }).count() === 1, 'survives reload offline');
  await p.click('[data-tab=shop]');
  const i4 = p.locator('.group', { has: p.locator('h2', { hasText: /^Isle 4\d/ }) });
  ok(await i4.locator('.item', { hasText: 'oat milk' }).count() === 1, 'appears in Isle 4 on the Isle list');

  // back online -> row appended in the sheet
  await ctl('down=0'); await ctx.setOffline(false);
  await p.evaluate(() => window.__sva.sync(true));
  const st = await ctl(''); const h = st.grid[0]; const row = st.grid.find(r => r[0] === 'oat milk');
  ok(!!row, 'row added to the sheet');
  const c = n => row[h.indexOf(n)];
  ok(c('SPA') === 'leche de avena' && c('Boat Location') === 'refrigerador' && c('Cant') === 3 && c('Daily Value') === 0.5 &&
     row[h.indexOf('Cant') + 1] === 'carton' && String(c('SV-Isle')) === '4' && c('Loc-R/L') === 'R',
     'sheet row values: ' + [c('SPA'), c('Boat Location'), c('Cant'), row[h.indexOf('Cant') + 1], c('Daily Value'), c('SV-Isle'), c('Loc-R/L')].join(' / '));
  ok(st.grid.length - 1 === 82 && !!c('App ID'), 'now 82 items, new row has an App ID');
  ok(await p.evaluate(() => window.__sva.S.outbox.length) === 0, 'nothing left waiting');
  await p.click('[data-lang=es]'); await p.click('[data-tab=compile]');
  ok(await p.locator('.group.loc .item', { hasText: 'leche de avena' }).count() === 1, 'Spanish name shown in ES');
  ok((await p.textContent('#addFab')).includes('Agregar artículo'), 'Spanish button');
  await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
