/**
 * SuperValue shopping app — sync endpoint for the "Entrada" sheet.
 *
 * Add this as a NEW file in the sheet's Apps Script project
 * (Extensions → Apps Script → + → Script). It does not touch any existing code.
 *
 * One-time setup:
 *   1. Select the function `svaSetup` in the toolbar and click Run (approve access).
 *      It adds two helper columns to Entrada ("App ID", "App Sync"), creates an
 *      edit trigger and prints the app key in the Execution log.
 *   2. Deploy → New deployment → Web app.
 *      Execute as: Me.  Who has access: Anyone.  Copy the Web app URL.
 *   3. In the phone app: Settings → paste the URL and the key.
 *
 * Rules:
 *   - Rows are matched by "App ID", so renaming or re-sorting rows is safe.
 *   - "Add item" in the app appends a new row at the bottom of Entrada; "Delete item" removes the row.
 *   - Each editable field keeps its own "last changed" time. When two phones (or a
 *     phone and someone editing the sheet) change the same field, the newest change wins.
 */

var SVA_SHEET = 'Entrada';

// app field -> how to find its column (header text, case-insensitive; "startsWith:" = prefix match)
var SVA_COLUMNS = {
  eng:   'ENG',
  loc:   'Boat Location',
  spa:   'SPA',
  qty:   'Cant',
  daily: 'Daily Value',
  aisle: 'SV-Isle',
  area:  'Isle-Mod',
  side:  'Loc-R/L',
  pos:   'startsWith:Loc: meat',
  level: 'Loc: level',
  id:    'App ID',
  sync:  'App Sync'
};
// Fields the app is allowed to change
var SVA_EDITABLE = ['qty', 'aisle', 'area', 'side', 'pos', 'level'];

// ---------- web endpoints ----------

function doGet(e) {
  return svaHandle_(function () {
    svaCheckKey_(e && e.parameter && e.parameter.key);
    return { ok: true, items: svaReadItems_(), serverTime: Date.now() };
  });
}

function doPost(e) {
  return svaHandle_(function () {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    svaCheckKey_(body.key);
    var result = svaApplyChanges_(body.changes || []);
    return { ok: true, applied: result.applied, skipped: result.skipped,
             items: svaReadItems_(), serverTime: Date.now() };
  });
}

// ---------- setup + trigger ----------

function svaSetup() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('APP_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    props.setProperty('APP_KEY', key);
  }
  var cols = svaColumns_(true);
  svaEnsureIds_(cols);

  // Installable edit trigger (so it never clashes with an existing onEdit)
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'svaOnEdit';
  });
  if (!exists) ScriptApp.newTrigger('svaOnEdit').forSpreadsheet(ss).onEdit().create();

  Logger.log('Setup done. App key: ' + key);
  return key;
}

/** Stamps manual sheet edits so the newest change wins against phone edits. */
function svaOnEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== SVA_SHEET) return;
  var cols = svaColumns_(false);
  if (!cols.sync) return;
  var r0 = e.range.getRow(), c0 = e.range.getColumn();
  var nr = e.range.getNumRows(), nc = e.range.getNumColumns();
  var touched = [];
  SVA_EDITABLE.forEach(function (f) {
    var c = cols[f];
    if (c && c >= c0 && c < c0 + nc) touched.push(f);
  });
  if (!touched.length) return;
  var now = Date.now();
  for (var r = Math.max(r0, 2); r < r0 + nr; r++) {
    var cell = sheet.getRange(r, cols.sync);
    var stamps = svaParse_(cell.getValue());
    touched.forEach(function (f) { stamps[f] = now; });
    cell.setValue(JSON.stringify(stamps));
  }
}

// ---------- internals ----------

function svaHandle_(fn) {
  var out;
  try { out = fn(); } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function svaCheckKey_(key) {
  var expected = PropertiesService.getScriptProperties().getProperty('APP_KEY');
  if (!expected) throw new Error('Not set up: run svaSetup first');
  if (String(key || '') !== expected) throw new Error('Wrong app key');
}

function svaSheet_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SVA_SHEET);
  if (!sh) throw new Error('Sheet "' + SVA_SHEET + '" not found');
  return sh;
}

/** Map of field -> 1-based column. Optionally adds the App ID / App Sync columns. */
function svaColumns_(create) {
  var sh = svaSheet_();
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });
  var cols = {};
  Object.keys(SVA_COLUMNS).forEach(function (f) {
    var spec = SVA_COLUMNS[f].toLowerCase(), idx = -1;
    if (spec.indexOf('startswith:') === 0) {
      var p = spec.slice(11);
      for (var i = 0; i < headers.length; i++) if (headers[i].indexOf(p) === 0) { idx = i; break; }
    } else {
      idx = headers.indexOf(spec);
    }
    if (idx >= 0) cols[f] = idx + 1;
  });
  // The unit column has no header: it is the column right after "Cant"
  if (cols.qty && !headers[cols.qty]) cols.unit = cols.qty + 1;
  if (create) {
    ['id', 'sync'].forEach(function (f) {
      if (!cols[f]) {
        lastCol += 1;
        sh.getRange(1, lastCol).setValue(SVA_COLUMNS[f]);
        cols[f] = lastCol;
      }
    });
  }
  if (!cols.eng) throw new Error('Column "ENG" not found');
  return cols;
}

function svaEnsureIds_(cols) {
  var sh = svaSheet_();
  var n = sh.getLastRow() - 1;
  if (n < 1) return;
  var eng = sh.getRange(2, cols.eng, n, 1).getValues();
  var idRange = sh.getRange(2, cols.id, n, 1);
  var ids = idRange.getValues();
  var seen = {}, changed = false;
  for (var i = 0; i < n; i++) {
    var id = String(ids[i][0] || '').trim();
    var hasItem = String(eng[i][0] || '').trim() !== '';
    if (hasItem && (!id || seen[id])) {   // missing or duplicated (e.g. copied row)
      id = Utilities.getUuid().slice(0, 8);
      ids[i][0] = id; changed = true;
    }
    if (id) seen[id] = true;
  }
  if (changed) idRange.setValues(ids);
}

function svaReadItems_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var cols = svaColumns_(true);
    svaEnsureIds_(cols);
    var sh = svaSheet_();
    var n = sh.getLastRow() - 1;
    if (n < 1) return [];
    var data = sh.getRange(2, 1, n, sh.getLastColumn()).getValues();
    var items = [];
    data.forEach(function (row) {
      var get = function (f) { return cols[f] ? row[cols[f] - 1] : ''; };
      if (String(get('eng')).trim() === '') return;
      items.push({
        id: String(get('id')),
        eng: svaClean_(get('eng')), spa: svaClean_(get('spa')), loc: svaClean_(get('loc')),
        qty: get('qty') === '' ? '' : Number(get('qty')),
        unit: svaClean_(get('unit')), daily: get('daily'),
        aisle: svaClean_(get('aisle')), area: svaClean_(get('area')),
        side: svaClean_(get('side')), pos: svaClean_(get('pos')), level: svaClean_(get('level'))
      });
    });
    return items;
  } finally { lock.releaseLock(); }
}

function svaApplyChanges_(changes) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var applied = 0, skipped = 0;
  try {
    var cols = svaColumns_(true);
    svaEnsureIds_(cols);
    var sh = svaSheet_();
    var n = sh.getLastRow() - 1;
    var ids = n > 0 ? sh.getRange(2, cols.id, n, 1).getValues() : [];
    var rowOf = {};
    ids.forEach(function (r, i) { if (r[0]) rowOf[String(r[0])] = i + 2; });

    changes.forEach(function (ch) {
      if (ch.field === '_new') {            // add a new item (row) — sent by the app's "Add item"
        if (rowOf[String(ch.id)]) { skipped++; return; }   // already added (retry) — ignore
        var v = ch.value || {};
        if (!svaClean_(v.eng)) { skipped++; return; }
        var width = sh.getLastColumn(), vals = [], stamps0 = {}, ts0 = Number(ch.ts) || Date.now();
        for (var c = 0; c < width; c++) vals.push('');
        ['eng', 'spa', 'loc', 'qty', 'unit', 'daily', 'aisle', 'area', 'side', 'pos', 'level'].forEach(function (f) {
          if (!cols[f] || v[f] === undefined || v[f] === null || v[f] === '') return;
          vals[cols[f] - 1] = (f === 'qty' || f === 'daily') ? Number(v[f]) : String(v[f]);
        });
        SVA_EDITABLE.forEach(function (f) { stamps0[f] = ts0; });
        vals[cols.id - 1] = String(ch.id);
        vals[cols.sync - 1] = JSON.stringify(stamps0);
        sh.appendRow(vals);
        rowOf[String(ch.id)] = sh.getLastRow();
        applied++;
        return;
      }
      if (ch.field === '_delete') {         // remove an item (row) — sent by the app's "Delete item"
        var drow = rowOf[String(ch.id)];
        if (!drow) { skipped++; return; }    // already gone
        sh.deleteRow(drow);
        rowOf = {};                            // rows below moved up: rebuild the index
        var left = sh.getLastRow() - 1;
        if (left > 0) sh.getRange(2, cols.id, left, 1).getValues().forEach(function (r, i) { if (r[0]) rowOf[String(r[0])] = i + 2; });
        applied++;
        return;
      }
      var row = rowOf[String(ch.id)];
      if (!row || SVA_EDITABLE.indexOf(ch.field) < 0 || !cols[ch.field]) { skipped++; return; }
      var syncCell = sh.getRange(row, cols.sync);
      var stamps = svaParse_(syncCell.getValue());
      var ts = Number(ch.ts) || 0;
      if (stamps[ch.field] && stamps[ch.field] > ts) { skipped++; return; } // newer value already there
      var v = ch.value;
      if (ch.field === 'qty') v = (v === '' || v === null || v === undefined) ? '' : Number(v);
      sh.getRange(row, cols[ch.field]).setValue(v === null || v === undefined ? '' : v);
      stamps[ch.field] = ts;
      syncCell.setValue(JSON.stringify(stamps));
      applied++;
    });
  } finally { lock.releaseLock(); }
  return { applied: applied, skipped: skipped };
}

function svaParse_(v) {
  try { var o = JSON.parse(v || '{}'); return (o && typeof o === 'object') ? o : {}; }
  catch (e) { return {}; }
}

function svaClean_(v) {
  // strip invisible characters (e.g. word-joiners pasted in from other apps)
  return String(v === null || v === undefined ? '' : v).replace(/[​-‍⁠﻿]/g, '').trim();
}
