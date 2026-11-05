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
  let dlg = []; p.on('dialog', d => { dlg.push(d.message()); d.accept(); });
  await p.goto(APP + '#setup=' + Buffer.from(JSON.stringify({ url: API, key })).toString('base64'));
  await p.waitForSelector('.group'); await p.waitForFunction(() => navigator.serviceWorker.controller);
  const rows = async () => (await ctl('')).grid.slice(1).filter(r => r[0] !== '').map(r => r[0]);
  const before = (await rows()).length;
  // delete an existing item while offline
  await ctx.setOffline(true); await ctl('down=1');
  await p.click('[data-tab=compile]');
  await p.locator('.group.loc .item', { hasText: 'moño vieja' }).locator('[data-act=edit]').click();
  await p.screenshot({ path: path.join(__dirname, 'shots', 'delete-btn.png') });
  await p.click('#editor [data-act=delete]');
  ok(dlg[0] && dlg[0].includes('moño vieja (unclear)') && dlg[0].includes('cannot be undone'), 'asks to confirm: ' + dlg[0]);
  ok(await p.locator('.item', { hasText: 'moño vieja' }).count() === 0, 'gone from the app immediately (offline)');
  await p.reload(); await p.waitForSelector('.group.loc');
  ok(await p.locator('.item', { hasText: 'moño vieja' }).count() === 0, 'stays gone after reload');
  ok((await rows()).includes('moño vieja (unclear)'), 'sheet unchanged while offline');
  await ctl('down=0'); await ctx.setOffline(false);
  await p.evaluate(() => window.__sva.sync(true));
  let r = await rows();
  ok(!r.includes('moño vieja (unclear)') && r.length === before - 1, 'row removed from the sheet after sync (' + r.length + ' rows)');
  // later rows still map correctly: edit an item below the deleted row
  await p.locator('.group.loc .item', { hasText: 'toilet paper' }).locator('[data-act=plus]').click();
  await p.evaluate(() => window.__sva.sync(true));
  const st = await ctl(''); const h = st.grid[0];
  ok(st.grid.find(x => x[0] === 'toilet paper')[h.indexOf('Cant')] === 2, 'edits after a delete land on the right row');
  // cancel keeps it
  dlg = []; p.removeAllListeners('dialog'); p.on('dialog', d => { dlg.push(1); d.dismiss(); });
  await p.locator('.group.loc .item', { hasText: 'soap' }).locator('[data-act=edit]').click();
  await p.click('#editor [data-act=delete]');
  ok(await p.locator('.group.loc .item', { hasText: 'soap' }).count() === 1, 'Cancel in the confirm keeps the item');
  await p.click('#editor [data-act=cancel]');
  // add then delete before syncing: nothing reaches the sheet
  p.removeAllListeners('dialog'); p.on('dialog', d => d.accept());
  await ctx.setOffline(true); await ctl('down=1');
  await p.click('#addFab'); await p.fill('[data-f=eng]', 'typo item'); await p.click('#editor [data-act=save]');
  await p.locator('.group.loc .item', { hasText: 'typo item' }).locator('[data-act=edit]').click();
  await p.click('#editor [data-act=delete]');
  ok(await p.evaluate(() => window.__sva.S.outbox.length) === 0, 'unsynced new item deleted locally, nothing queued');
  await ctl('down=0'); await ctx.setOffline(false); await p.evaluate(() => window.__sva.sync(true));
  ok(!(await rows()).includes('typo item'), 'never written to the sheet');
  await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
