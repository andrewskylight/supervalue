// Serves the app (port 8080) and a fake Apps Script endpoint (port 8090, different origin like the real thing).
const http = require('http'), fs = require('fs'), path = require('path');
const { load } = require('./fakegas');
const root = path.join(__dirname, '..');
const gas = load(path.join(__dirname, 'entrada.csv'), path.join(root, 'gas', 'SuperValueApp.gs'));
const key = gas.ctx.svaSetup();
fs.writeFileSync(path.join(__dirname, '.key'), key);
let apiDown = false;

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, 'docs', p);
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(8080);

http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (req.url.startsWith('/__ctl')) {   // test controls
    const u = new URL(req.url, 'http://x');
    if (u.searchParams.has('down')) apiDown = u.searchParams.get('down') === '1';
    if (u.searchParams.has('sheetEdit')) {   // simulate someone editing the sheet by hand: row,field,value
      const [id, field, value] = JSON.parse(u.searchParams.get('sheetEdit'));
      const cols = gas.ctx.svaColumns_(false);
      const g = gas.sheet.grid; const r = g.findIndex(row => row[cols.id - 1] === id) + 1;
      gas.sheet.getRange(r, cols[field]).setValue(value);
      gas.ctx.svaOnEdit({ range: gas.sheet.getRange(r, cols[field]) });
    }
    res.writeHead(200, cors); return res.end(JSON.stringify({ apiDown, grid: gas.sheet.grid }));
  }
  if (apiDown) { req.destroy(); return; }
  let body = ''; req.on('data', d => body += d);
  req.on('end', () => {
    const out = req.method === 'POST' ? gas.ctx.doPost({ postData: { contents: body } })
      : gas.ctx.doGet({ parameter: Object.fromEntries(new URL(req.url, 'http://x').searchParams) });
    res.writeHead(200, cors); res.end(out.text);
  });
}).listen(8090);
console.log('ready key=' + key);
