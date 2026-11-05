// Simulates the bug: new page + stale cached app.js. The app must repair itself.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const APP = 'http://localhost:8080/', API = 'http://localhost:8090/exec';
const key = fs.readFileSync(path.join(__dirname, '.key'), 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch(); const phone = { ...devices['iPhone 13'] }; delete phone.defaultBrowserType;
  const p = await (await b.newContext(phone)).newPage();
  await p.goto(APP + '#setup=' + Buffer.from(JSON.stringify({ url: API, key })).toString('base64'));
  await p.waitForSelector('.group');
  await p.waitForFunction(() => navigator.serviceWorker.controller);
  // poison the cache with an "old" script
  await p.evaluate(async () => {
    const c = await caches.open((await caches.keys())[0]);
    const cur = await (await c.match('app.js')).text();
    const old = cur.replace(/var VERSION = '[\d.]+'/, "var VERSION = '1.1.2'");
    await c.put('app.js', new Response(old, { headers: { 'Content-Type': 'text/javascript' } }));
  });
  await p.reload(); await p.waitForTimeout(2500); await p.waitForSelector('.group');
  const v = await p.evaluate(() => window.__sva && window.__sva.version);
  ok(v === fs.readFileSync(['docs','app'].map(d => path.join(__dirname, '..', d, 'app.js')).find(f => fs.existsSync(f)), 'utf8').match(/VERSION = '([\d.]+)'/)[1], 'after mixed cache, app repaired itself and runs ' + v);
  await p.click('[data-tab=compile]');
  ok(await p.locator('.group.loc').count() > 10, 'Compile list shows boat-location sections');
  await p.click('[data-tab=shop]');
  ok(await p.locator('.group.loc').count() === 0 && await p.locator('.group').count() > 5, 'Isle list shows isle sections');
  await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
