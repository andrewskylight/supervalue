// Minimal Google Apps Script emulation to run SuperValueApp.gs unchanged in Node.
const fs = require('fs'), vm = require('vm'), crypto = require('crypto');

function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.map(r => r.map(v => (v !== '' && !isNaN(Number(v))) ? Number(v) : v));
}

function makeSheet(name, grid) {
  const g = grid;
  const width = () => Math.max(...g.map(r => r.length));
  const ensure = (r, c) => { while (g.length < r) g.push([]); for (const row of g) while (row.length < c) row.push(''); };
  const range = (r, c, nr = 1, nc = 1) => ({
    getValues: () => { ensure(r + nr - 1, c + nc - 1); return g.slice(r - 1, r - 1 + nr).map(row => row.slice(c - 1, c - 1 + nc)); },
    getValue: () => { ensure(r, c); return g[r - 1][c - 1]; },
    setValue: v => { ensure(r, c); g[r - 1][c - 1] = (typeof v === 'string' && v !== '' && !isNaN(Number(v))) ? Number(v) : v; },
    setValues: vs => { ensure(r + nr - 1, c + nc - 1); vs.forEach((row, i) => row.forEach((v, j) => g[r - 1 + i][c - 1 + j] = v)); },
    getRow: () => r, getColumn: () => c, getNumRows: () => nr, getNumColumns: () => nc, getSheet: () => sheet
  });
  const sheet = {
    getName: () => name, getRange: range,
    getLastRow: () => { let n = g.length; while (n > 0 && g[n - 1].every(v => v === '')) n--; return n; },
    getLastColumn: () => { let w = 0; g.forEach(r => r.forEach((v, i) => { if (v !== '') w = Math.max(w, i + 1); })); return w; },
    grid: g
  };
  return sheet;
}

function load(csvPath, gsPath) {
  const grid = parseCSV(fs.readFileSync(csvPath, 'utf8').replace(/\n$/, ''));
  const sheet = makeSheet('Entrada', grid);
  const props = {}; const triggers = [];
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => n === 'Entrada' ? sheet : null }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { getUuid: () => crypto.randomUUID() },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: s => ({ text: s, setMimeType() { return this; } })
    },
    ScriptApp: {
      getProjectTriggers: () => triggers,
      newTrigger: h => ({ forSpreadsheet: () => ({ onEdit: () => ({ create: () => triggers.push({ getHandlerFunction: () => h }) }) }) })
    },
    Logger: { log: () => {} },
    JSON, String, Number, Date, Math, Object, Error
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(gsPath, 'utf8'), ctx);
  return { ctx, sheet, props, triggers };
}

module.exports = { load, parseCSV };
