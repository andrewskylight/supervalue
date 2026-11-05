const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const APP = 'http://localhost:8080/', API = 'http://localhost:8090/exec';
const key = fs.readFileSync(path.join(__dirname, '.key'), 'utf8');
const ctl = async q => (await fetch('http://localhost:8090/__ctl?' + q)).json();
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch(); const phone = { ...devices['iPhone 13'] }; delete phone.defaultBrowserType;
  const p = await (await b.newContext({ ...phone, deviceScaleFactor: 2 })).newPage();
  p.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await p.goto(APP + '#setup=' + Buffer.from(JSON.stringify({ url: API, key })).toString('base64'));
  await p.waitForSelector('.group');
  const grp = re => p.locator('.group', { has: p.locator('h2', { hasText: re }) });
  // Isle 14 · Frozen food: isle + section pre-filled, boat location blank
  await grp(/^Isle 14 · Frozen food/).locator('[data-act=add-item]').click();
  await p.waitForSelector('#editor[open]');
  ok(await p.inputValue('[data-f=loc]') === '', 'boat location left blank');
  ok(await p.locator('#editor .choices[data-field=aisle] .opt.on').textContent() === '14', 'isle 14 pre-selected');
  ok(await p.locator('#editor .choices[data-field=area] .opt.on').textContent() === 'Frozen food', 'section Frozen food pre-selected');
  await p.fill('[data-f=eng]', 'frozen peas'); await p.click('#editor [data-act=save]');
  ok(await grp(/^Isle 14 · Frozen food/).locator('.item', { hasText: 'frozen peas' }).count() === 1, 'new item appears in that isle group');
  await p.evaluate(() => window.__sva.sync(true));
  const st = await ctl(''); const h = st.grid[0]; const row = st.grid.find(r => r[0] === 'frozen peas');
  ok(row && String(row[h.indexOf('SV-Isle')]) === '14' && row[h.indexOf('Isle-Mod')] === 'Frozen Food' && row[h.indexOf('Boat Location')] === '' && row[h.indexOf('Cant')] === 1,
    'sheet row: isle 14 / Frozen Food / no boat location / qty 1');
  // plain isle and the Needs isle group
  await grp(/^Isle 9/).locator('[data-act=add-item]').click();
  ok(await p.locator('#editor .choices[data-field=aisle] .opt.on').textContent() === '9' &&
     await p.locator('#editor .choices[data-field=area] .opt.on').textContent() === '—', 'Isle 9: isle 9, no section');
  await p.click('#editor [data-act=cancel]');
  await grp(/^Needs isle/).locator('[data-act=add-item]').click();
  ok(await p.locator('#editor .choices[data-field=aisle] .opt.on').textContent() === '—', 'Needs isle: no isle pre-filled');
  await p.click('#editor [data-act=cancel]');
  await grp(/^Isle 9/).scrollIntoViewIfNeeded(); await p.screenshot({ path: path.join(__dirname, 'shots', 'isle-add.png') });
  await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
