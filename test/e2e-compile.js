const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const APP = 'http://localhost:8080/', API = 'http://localhost:8090/exec';
const key = fs.readFileSync(path.join(__dirname, '.key'), 'utf8');
const ctl = async q => (await fetch('http://localhost:8090/__ctl?' + q)).json();
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const hash = '#setup=' + Buffer.from(JSON.stringify({ url: API, key })).toString('base64');
(async () => {
  const b = await chromium.launch(); const phone = { ...devices['iPhone 13'] }; delete phone.defaultBrowserType;
  const p = await (await b.newContext({ ...phone, deviceScaleFactor: 2 })).newPage();
  p.on('dialog', d => d.accept()); p.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await p.goto(APP + hash); await p.waitForSelector('.group');
  const tabs = await p.$$eval('[data-tab]', bs => bs.map(x => x.textContent));
  ok(tabs.join('|') === 'Isle list|Compile list|All items', 'tabs: ' + tabs.join(' | '));

  // Isle list: checked items move to a "Checked" sub-section, both parts A-Z
  const g2 = p.locator('.group', { has: p.locator('h2', { hasText: /^Isle 2\d/ }) }).first();
  const names = () => g2.locator('.item .name').allTextContents();
  const before = await names();
  ok(JSON.stringify(before) === JSON.stringify([...before].sort((a, c) => a.localeCompare(c))), 'Isle 2 items alphabetical: ' + before.slice(0, 4).join(', '));
  for (const n of ['apples', 'lettuce']) await g2.locator('.item', { hasText: n }).first().locator('[data-act=check]').click();
  const after = await names();
  const sub = await g2.locator('.subhead').textContent();
  ok(sub.startsWith('Checked') && sub.includes('2'), 'sub-section header: ' + sub);
  ok(after.slice(-2).join(',') === 'apples,lettuce', 'checked items at the bottom, A-Z: ' + after.slice(-3).join(', '));
  const unchecked = after.slice(0, -2);
  ok(JSON.stringify(unchecked) === JSON.stringify([...unchecked].sort((a, c) => a.localeCompare(c))) && !unchecked.includes('apples'), 'unchecked part still A-Z');
  await g2.locator('.item', { hasText: 'apples' }).locator('[data-act=check]').click();
  ok((await names()).indexOf('apples') === 0, 'unchecking moves apples back up');
  await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: path.join(__dirname, 'shots', 'isle-checked.png') });

  // Compile list: sections by boat location, all items, A-Z
  await p.click('[data-tab=compile]'); await p.waitForSelector('.group.loc');
  const secs = await p.$$eval('.group.loc h2', hs => hs.map(h => h.firstChild.textContent));
  ok(secs.length === 14 && secs[0] === 'bar - casillero' && secs.includes('cocina - vegetales'), secs.length + ' sections: ' + secs.slice(0, 4).join(' | '));
  const total = await p.locator('.group.loc .item').count();
  ok(total === 81, 'all 81 items shown (incl. qty 0): ' + total);
  const veg = await p.locator('.group.loc', { has: p.locator('h2', { hasText: 'cocina - vegetales' }) }).locator('.name').allTextContents();
  ok(JSON.stringify(veg) === JSON.stringify([...veg].sort((a, c) => a.localeCompare(c))) && veg.includes('Casava'), 'vegetables A-Z incl. Casava (qty empty): ' + veg.slice(0, 3).join(', '));
  const ron = p.locator('.group.loc', { has: p.locator('h2', { hasText: 'bar - ron' }) });
  ok((await ron.locator('h2 .count').textContent()) === '0 on list', 'rum section shows 0 on list');
  await ron.locator('.item', { hasText: 'gold rum' }).locator('[data-act=plus]').click();
  ok((await ron.locator('h2 .count').textContent()) === '1 on list', '+ on gold rum -> 1 on list');
  await p.fill('#search', 'milk');
  ok(await p.locator('.group.loc .item').count() === 3, 'search filters within compile list (3 milks)');
  await p.fill('#search', ''); await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: path.join(__dirname, 'shots', 'compile.png') });
  await p.click('[data-lang=es]');
  ok((await p.textContent('[data-tab=compile]')) === 'Preparar lista' && (await p.locator('.group.loc h2 .count').first().textContent()).includes('en la lista'), 'Spanish labels');
  await p.evaluate(() => window.__sva.sync(true));
  const st = await ctl(''); const h = st.grid[0];
  ok(st.grid.find(r => r[0] === 'gold rum')[h.indexOf('Cant')] === 1, 'gold rum qty synced to sheet');
  await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
