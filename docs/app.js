/* SuperValue — offline shopping list sorted by aisle, synced to a Google Sheet. */
(function () {
  'use strict';

  var VERSION = '1.1.1';

  // ---------- text ----------
  var T = {
    en: {
      shop: 'Isle list', all: 'All items', needs: 'Needs aisle', aisle: 'Aisle',
      search: 'Search items…', notOnList: 'not on list', hideDone: 'Hide checked',
      showDone: 'Show checked', clearChecks: 'Uncheck all', clearConfirm: 'Uncheck every item?',
      setUp: 'Set up', syncing: 'Syncing…', waiting: 'waiting', offline: 'Offline',
      synced: 'Synced', never: 'not yet', save: 'Save', cancel: 'Cancel', qty: 'Quantity',
      area: 'Section', side: 'Side', pos: 'Along the aisle', level: 'Shelf', none: '—',
      other: 'Other…', settings: 'Settings', url: 'Sheet script URL', key: 'App key',
      pasteLink: 'Or paste a setup link', copyLink: 'Copy setup link for the other phone',
      copied: 'Setup link copied', syncNow: 'Sync now', reset: 'Clear data on this phone',
      resetConfirm: 'Delete the list on this phone? Unsynced changes will be lost.',
      saved: 'Saved', welcome: 'Connect this phone to the Google Sheet once while you have internet. After that the list works offline.',
      lastSync: 'Last sync', pending: 'Changes waiting to sync', boat: 'Boat', done: 'done',
      emptyShop: 'Nothing on the list. Add quantities in “All items”.', close: 'Close',
      syncError: 'Sync failed',
      newList: 'New list', tripTitle: 'New shopping list', oneDay: '1 day', twoDays: '2 days',
      tripHint: '{n} items with a daily value are set to daily value × days (rounded up). Other quantities stay as they are. Check-marks are cleared.',
      tripDone: 'List set for {d}: {c} quantities changed', lastTrip: 'Last list'
    },
    es: {
      shop: 'Lista de pasillos', all: 'Todos', needs: 'Falta pasillo', aisle: 'Pasillo',
      search: 'Buscar…', notOnList: 'no está en la lista', hideDone: 'Ocultar marcados',
      showDone: 'Mostrar marcados', clearChecks: 'Desmarcar todo', clearConfirm: '¿Desmarcar todos los artículos?',
      setUp: 'Configurar', syncing: 'Sincronizando…', waiting: 'pendientes', offline: 'Sin conexión',
      synced: 'Sincronizado', never: 'todavía no', save: 'Guardar', cancel: 'Cancelar', qty: 'Cantidad',
      area: 'Sección', side: 'Lado', pos: 'En el pasillo', level: 'Estante', none: '—',
      other: 'Otro…', settings: 'Ajustes', url: 'URL del script de la hoja', key: 'Clave',
      pasteLink: 'O pegue un enlace de configuración', copyLink: 'Copiar enlace para el otro teléfono',
      copied: 'Enlace copiado', syncNow: 'Sincronizar', reset: 'Borrar datos de este teléfono',
      resetConfirm: '¿Borrar la lista de este teléfono? Se perderán los cambios no sincronizados.',
      saved: 'Guardado', welcome: 'Conecte este teléfono a la hoja de Google una vez con internet. Después la lista funciona sin conexión.',
      lastSync: 'Última sincronización', pending: 'Cambios por sincronizar', boat: 'Barco', done: 'listos',
      emptyShop: 'La lista está vacía. Agregue cantidades en “Todos”.', close: 'Cerrar',
      syncError: 'Error al sincronizar',
      newList: 'Nueva lista', tripTitle: 'Nueva lista de compras', oneDay: '1 día', twoDays: '2 días',
      tripHint: '{n} artículos con valor diario se ajustan a valor diario × días (redondeado hacia arriba). Las demás cantidades no cambian. Se borran las marcas.',
      tripDone: 'Lista para {d}: {c} cantidades cambiadas', lastTrip: 'Última lista'
    }
  };
  // Translations for values stored in the sheet (sheet keeps the English value)
  var VAL = {
    area:  { 'Meat': ['Meat', 'Carnes'], 'Frozen Food': ['Frozen food', 'Congelados'],
             'Stock Room': ['Stock room', 'Almacén'], 'Liquor Store': ['Liquor store', 'Licorería'] },
    side:  { 'L': ['Left', 'Izquierda'], 'R': ['Right', 'Derecha'] },
    pos:   { 'Meat': ['Meat end', 'Lado carnes'], 'Mid': ['Middle', 'Centro'], 'Cash': ['Cash end', 'Lado cajas'] },
    level: { 'Top': ['Top shelf', 'Arriba'], 'Mid': ['Middle shelf', 'Medio'], 'Middle': ['Middle shelf', 'Medio'],
             'Bot': ['Bottom shelf', 'Abajo'] }
  };
  var PRESETS = {
    area: ['Meat', 'Frozen Food', 'Stock Room', 'Liquor Store'],
    side: ['L', 'R'],
    pos: ['Meat', 'Mid', 'Cash'],
    level: ['Top', 'Mid', 'Bot']
  };
  var POS_ORDER = { 'Meat': 0, 'Mid': 1, 'Cash': 2 };

  // ---------- storage ----------
  function load(k, d) { try { var v = localStorage.getItem('sva.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function store(k, v) { try { localStorage.setItem('sva.' + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } }

  var S = {
    cfg: load('cfg', { url: '', key: '' }),
    items: load('items', []),
    outbox: load('outbox', []),
    checked: load('checked', {}),
    lang: load('lang', (navigator.language || 'en').slice(0, 2) === 'es' ? 'es' : 'en'),
    tab: load('tab', 'shop'),
    hideDone: load('hideDone', false),
    lastSync: load('lastSync', 0),
    trip: load('trip', null),
    syncing: false, lastError: null, query: ''
  };
  function persist() {
    store('cfg', S.cfg); store('items', S.items); store('outbox', S.outbox); store('checked', S.checked);
    store('lang', S.lang); store('tab', S.tab); store('hideDone', S.hideDone); store('lastSync', S.lastSync); store('trip', S.trip);
  }

  // ---------- helpers ----------
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function t(k) { return T[S.lang][k] || T.en[k] || k; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function val(field, v) { var m = VAL[field] && VAL[field][v]; return m ? m[S.lang === 'es' ? 1 : 0] : v; }
  function name(it) { return (S.lang === 'es' ? (it.spa || it.eng) : (it.eng || it.spa)); }
  function otherName(it) { return S.lang === 'es' ? it.eng : it.spa; }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function fmtQty(q) { return (Math.round(num(q) * 100) / 100).toString(); }
  function ago(ts) {
    if (!ts) return t('never');
    var s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return S.lang === 'es' ? 'ahora' : 'just now';
    var m = Math.round(s / 60); if (m < 60) return m + ' min';
    var h = Math.round(m / 60); if (h < 48) return h + ' h';
    return Math.round(h / 24) + (S.lang === 'es' ? ' días' : ' days');
  }
  function toast(msg) {
    var el = $('#toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { el.hidden = true; }, 2200);
  }

  /** Items as the server sent them, with this phone's unsynced edits applied on top. */
  function view() {
    var pend = {};
    S.outbox.forEach(function (c) { (pend[c.id] = pend[c.id] || {})[c.field] = c.value; });
    return S.items.map(function (it) {
      var p = pend[it.id]; if (!p) return it;
      var o = {}; for (var k in it) o[k] = it[k];
      for (var f in p) o[f] = p[f];
      o._pending = true;
      return o;
    });
  }

  function queue(id, field, value) {
    S.outbox = S.outbox.filter(function (c) { return !(c.id === id && c.field === field); });
    S.outbox.push({ id: id, field: field, value: value, ts: Date.now() });
    persist(); render(); scheduleSync();
  }

  // ---------- new list (trip length) ----------
  function dailyItems() { return view().filter(function (it) { return num(it.daily) > 0; }); }
  function tripQty(it, days) { return Math.ceil(num(it.daily) * days - 1e-9); }   // round up: no half bottles
  function applyTrip(days) {
    var ts = Date.now(), changed = 0;
    dailyItems().forEach(function (it) {
      var q = tripQty(it, days);
      if (String(it.qty) === String(q)) return;
      S.outbox = S.outbox.filter(function (c) { return !(c.id === it.id && c.field === 'qty'); });
      S.outbox.push({ id: it.id, field: 'qty', value: q, ts: ts });
      changed++;
    });
    S.checked = {};
    S.trip = { days: days, at: ts };
    S.tab = 'shop';
    persist(); $('#main').innerHTML = ''; render(); scheduleSync();
    toast(t('tripDone').replace('{d}', days === 1 ? t('oneDay') : t('twoDays')).replace('{c}', changed));
  }
  function openTrip() {
    var last = S.trip ? (S.trip.days === 1 ? t('oneDay') : t('twoDays')) + ' · ' +
      new Date(S.trip.at).toLocaleDateString(S.lang === 'es' ? 'es' : 'en', { month: 'short', day: 'numeric' }) : '';
    $('#trip').innerHTML = '<form method="dialog" class="sheet">' +
      '<header><h3>' + esc(t('tripTitle')) + '</h3></header>' +
      '<p class="meta">' + esc(t('tripHint').replace('{n}', dailyItems().length)) + '</p>' +
      '<div class="actions trip"><button type="button" class="primary" data-days="1">' + esc(t('oneDay')) + '</button>' +
      '<button type="button" class="primary" data-days="2">' + esc(t('twoDays')) + '</button></div>' +
      '<div class="actions"><button type="button" data-act="close">' + esc(t('cancel')) + '</button></div>' +
      (last ? '<p class="meta">' + esc(t('lastTrip')) + ': ' + esc(last) + '</p>' : '') + '</form>';
    $('#trip').showModal();
  }
  $('#trip').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.days) { $('#trip').close(); applyTrip(Number(b.dataset.days)); }
    else if (b.dataset.act === 'close') $('#trip').close();
  });

  // ---------- grouping ----------
  function groupKey(it) { return it.aisle ? it.aisle + '|' + (it.area || '') : ''; }
  function groupLabel(key) {
    if (!key) return t('needs');
    var p = key.split('|');
    return t('aisle') + ' ' + p[0] + (p[1] ? ' · ' + val('area', p[1]) : '');
  }
  function cmpGroups(a, b) {
    if (!a) return -1; if (!b) return 1;   // "needs aisle" first
    var pa = a.split('|'), pb = b.split('|');
    var na = parseFloat(pa[0]), nb = parseFloat(pb[0]);
    if (isNaN(na) !== isNaN(nb)) return isNaN(na) ? 1 : -1;
    if (na !== nb && !isNaN(na)) return na - nb;
    if (pa[0] !== pb[0]) return pa[0].localeCompare(pb[0]);
    return (pa[1] || '').localeCompare(pb[1] || '');
  }
  function cmpItems(a, b) {
    var pa = a.pos in POS_ORDER ? POS_ORDER[a.pos] : 1.5, pb = b.pos in POS_ORDER ? POS_ORDER[b.pos] : 1.5;
    if (pa !== pb) return pa - pb;
    return name(a).localeCompare(name(b));
  }

  // ---------- rendering ----------
  function render() {
    document.documentElement.lang = S.lang;
    document.querySelectorAll('[data-lang]').forEach(function (b) { b.classList.toggle('on', b.dataset.lang === S.lang); });
    document.querySelectorAll('[data-tab]').forEach(function (b) {
      b.classList.toggle('on', b.dataset.tab === S.tab); b.textContent = t(b.dataset.tab);
    });
    renderSync();
    var main = $('#main');
    if (!S.items.length) {
      main.innerHTML = '<section class="card welcome"><p>' + esc(t('welcome')) + '</p>' +
        '<button type="button" class="primary" data-act="open-settings">' + esc(t('setUp')) + '</button></section>';
      return;
    }
    if (S.tab === 'all') renderAll(main); else renderShop(main);
  }

  function renderSync() {
    var b = $('#syncBtn'), n = S.outbox.length, txt, cls = '';
    if (!S.cfg.url) { txt = t('setUp'); cls = 'warn'; }
    else if (S.syncing) { txt = t('syncing'); }
    else if (S.lastError && n) { txt = t('offline') + ' · ' + n + ' ' + t('waiting'); cls = 'warn'; }
    else if (n) { txt = n + ' ' + t('waiting'); cls = 'warn'; }
    else if (S.lastError) { txt = t('offline'); cls = 'muted'; }
    else { txt = '✓ ' + ago(S.lastSync); cls = 'ok'; }
    b.textContent = txt; b.className = 'pill ' + cls;
  }

  function chips(it) {
    var c = [];
    if (it.side) c.push(val('side', it.side));
    if (it.pos) c.push(val('pos', it.pos));
    if (it.level) c.push(val('level', it.level));
    return c.map(function (x) { return '<span class="chip">' + esc(x) + '</span>'; }).join('');
  }

  function renderShop(main) {
    var list = view().filter(function (it) { return num(it.qty) > 0; });
    var newBtn = '<button type="button" class="newlist" data-act="new-list">＋ ' + esc(t('newList')) + '</button>';
    if (!list.length) { main.innerHTML = '<div class="bar">' + newBtn + '</div><p class="empty">' + esc(t('emptyShop')) + '</p>'; return; }
    var doneCount = list.filter(function (it) { return S.checked[it.id]; }).length;
    var groups = {};
    list.forEach(function (it) { (groups[groupKey(it)] = groups[groupKey(it)] || []).push(it); });
    var keys = Object.keys(groups).sort(cmpGroups);

    var h = '<div class="bar">' + newBtn + '<span class="progress"><b>' + doneCount + '</b> / ' + list.length + ' ' + esc(t('done')) + '</span>' +
      '<button type="button" class="link" data-act="toggle-done">' + esc(S.hideDone ? t('showDone') : t('hideDone')) + '</button></div>';
    keys.forEach(function (k) {
      var items = groups[k].sort(cmpItems);
      var visible = items.filter(function (it) { return !(S.hideDone && S.checked[it.id]); });
      if (!visible.length) return;
      var left = items.filter(function (it) { return !S.checked[it.id]; }).length;
      h += '<section class="group' + (k ? '' : ' needs') + '"><h2>' + esc(groupLabel(k)) +
        '<span class="count">' + left + '</span></h2><ul>';
      visible.forEach(function (it) {
        var done = !!S.checked[it.id];
        h += '<li class="item' + (done ? ' done' : '') + '" data-id="' + esc(it.id) + '">' +
          '<button type="button" class="check" data-act="check" aria-pressed="' + done + '" aria-label="✓"></button>' +
          '<button type="button" class="body" data-act="edit">' +
          '<span class="name">' + esc(name(it)) + (it._pending ? ' <i class="dot" title="not synced"></i>' : '') + '</span>' +
          '<span class="sub">' + chips(it) + (k ? '' : '<span class="chip add">+ ' + esc(t('aisle')) + '</span>') + '</span>' +
          '</button>' +
          '<span class="qty">' + esc(fmtQty(it.qty)) + (it.unit ? '<small>' + esc(it.unit) + '</small>' : '') + '</span>' +
          '</li>';
      });
      h += '</ul></section>';
    });
    h += '<div class="foot"><button type="button" class="link danger" data-act="clear-checks">' + esc(t('clearChecks')) + '</button></div>';
    main.innerHTML = h;
  }

  function renderAll(main) {
    if (!$('#search', main)) {
      main.innerHTML = '<div class="searchbox"><input id="search" type="search" autocomplete="off" placeholder="' +
        esc(t('search')) + '"><button type="button" class="newlist" data-act="new-list">＋ ' + esc(t('newList')) +
        '</button></div><ul id="allList" class="all"></ul>';
      var s = $('#search'); s.value = S.query;
      s.addEventListener('input', function () { S.query = s.value; renderAllList(); });
    } else {
      $('#search').placeholder = t('search');
    }
    renderAllList();
  }

  function renderAllList() {
    var q = S.query.trim().toLowerCase();
    var list = view().filter(function (it) {
      return !q || (it.eng + ' ' + it.spa).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return name(a).localeCompare(name(b)); });
    var h = '';
    list.forEach(function (it) {
      var on = num(it.qty) > 0;
      h += '<li class="item' + (on ? '' : ' off') + '" data-id="' + esc(it.id) + '">' +
        '<button type="button" class="body" data-act="edit">' +
        '<span class="name">' + esc(name(it)) + (it._pending ? ' <i class="dot"></i>' : '') + '</span>' +
        '<span class="sub"><span class="chip ' + (it.aisle ? 'aisle' : 'add') + '">' +
        esc(it.aisle ? groupLabel(groupKey(it)) : t('needs')) + '</span>' +
        (on ? '' : '<span class="chip muted">' + esc(t('notOnList')) + '</span>') + '</span></button>' +
        '<span class="stepper"><button type="button" data-act="minus" aria-label="−">−</button>' +
        '<b>' + esc(fmtQty(it.qty)) + '</b>' +
        '<button type="button" data-act="plus" aria-label="+">+</button></span></li>';
    });
    $('#allList').innerHTML = h;
  }

  // ---------- item editor ----------
  var draft = null;
  function openEditor(id) {
    var it = view().filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    draft = { id: id, orig: it, qty: it.qty, aisle: it.aisle, area: it.area, side: it.side, pos: it.pos, level: it.level };
    drawEditor();
    $('#editor').showModal();
  }
  function distinct(field) {
    var seen = {}, out = [];
    (PRESETS[field] || []).concat(S.items.map(function (i) { return i[field]; })).forEach(function (v) {
      if (v && !seen[v] && !(field === 'level' && v === 'Middle')) { seen[v] = 1; out.push(v); }
    });
    return out;
  }
  function choiceRow(field, options, labeler, allowOther) {
    var cur = draft[field] || '';
    var h = '<div class="choices" data-field="' + field + '">';
    h += '<button type="button" class="opt' + (cur === '' ? ' on' : '') + '" data-v="">' + esc(t('none')) + '</button>';
    var found = cur === '';
    options.forEach(function (o) {
      var on = String(o) === String(cur) || (field === 'level' && cur === 'Middle' && o === 'Mid');
      if (on) found = true;
      h += '<button type="button" class="opt' + (on ? ' on' : '') + '" data-v="' + esc(o) + '">' + esc(labeler(o)) + '</button>';
    });
    if (!found) h += '<button type="button" class="opt on" data-v="' + esc(cur) + '">' + esc(labeler(cur)) + '</button>';
    if (allowOther) h += '<button type="button" class="opt other" data-other="1">' + esc(t('other')) + '</button>';
    return h + '</div>';
  }
  function drawEditor() {
    var it = draft.orig;
    var maxAisle = 16;
    S.items.forEach(function (i) { var n = parseInt(i.aisle, 10); if (n > maxAisle && n < 60) maxAisle = n; });
    var aisles = []; for (var a = 1; a <= maxAisle; a++) aisles.push(String(a));
    var h = '<form method="dialog" class="sheet">' +
      '<header><h3>' + esc(name(it)) + '</h3><p class="alt">' + esc(otherName(it)) +
      (it.loc ? ' · ' + esc(t('boat')) + ': ' + esc(it.loc) : '') + '</p></header>' +
      '<label class="lbl">' + esc(t('qty')) + '</label>' +
      '<div class="stepper big" data-field="qty"><button type="button" data-step="-1">−</button><b>' +
      esc(fmtQty(draft.qty)) + '</b><button type="button" data-step="1">+</button>' +
      (it.unit ? '<small>' + esc(it.unit) + '</small>' : '') + '</div>' +
      '<label class="lbl">' + esc(t('aisle')) + '</label>' +
      choiceRow('aisle', aisles, function (v) { return v; }, true).replace('class="choices"', 'class="choices grid"') +
      '<label class="lbl">' + esc(t('area')) + '</label>' + choiceRow('area', distinct('area'), function (v) { return val('area', v); }, true) +
      '<label class="lbl">' + esc(t('side')) + '</label>' + choiceRow('side', PRESETS.side, function (v) { return val('side', v); }, false) +
      '<label class="lbl">' + esc(t('pos')) + '</label>' + choiceRow('pos', distinct('pos'), function (v) { return val('pos', v); }, true) +
      '<label class="lbl">' + esc(t('level')) + '</label>' + choiceRow('level', distinct('level'), function (v) { return val('level', v); }, false) +
      '<div class="actions"><button type="button" data-act="cancel">' + esc(t('cancel')) + '</button>' +
      '<button type="button" class="primary" data-act="save">' + esc(t('save')) + '</button></div></form>';
    $('#editor').innerHTML = h;
  }
  $('#editor').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var dlg = $('#editor');
    if (b.dataset.act === 'cancel') { dlg.close(); return; }
    if (b.dataset.act === 'save') {
      ['qty', 'aisle', 'area', 'side', 'pos', 'level'].forEach(function (f) {
        var a = draft[f], o = draft.orig[f];
        if (String(a == null ? '' : a) !== String(o == null ? '' : o)) queue(draft.id, f, a);
      });
      dlg.close(); toast(t('saved')); return;
    }
    if (b.dataset.step) {
      var q = Math.max(0, num(draft.qty) + Number(b.dataset.step));
      draft.qty = q === 0 ? 0 : q; drawEditor(); return;
    }
    var row = b.closest('.choices'); if (!row) return;
    var field = row.dataset.field;
    if (b.dataset.other) {
      var v = window.prompt(t('other'), draft[field] || '');
      if (v !== null) { draft[field] = v.trim(); drawEditor(); }
      return;
    }
    draft[field] = b.dataset.v; drawEditor();
  });

  // ---------- settings ----------
  function setupLink() {
    var payload = btoa(unescape(encodeURIComponent(JSON.stringify(S.cfg))));
    return location.origin + location.pathname + '#setup=' + payload;
  }
  function parseSetup(text) {
    var m = /#?setup=([A-Za-z0-9+/=_-]+)/.exec(text || '');
    if (!m) return null;
    try { var c = JSON.parse(decodeURIComponent(escape(atob(m[1])))); if (c && c.url) return { url: c.url, key: c.key || '' }; } catch (e) { }
    return null;
  }
  function openSettings() {
    var h = '<form method="dialog" class="sheet">' +
      '<header><h3>' + esc(t('settings')) + '</h3></header>' +
      '<label class="lbl" for="cfgUrl">' + esc(t('url')) + '</label><input id="cfgUrl" type="url" value="' + esc(S.cfg.url) + '" placeholder="https://script.google.com/macros/s/…/exec">' +
      '<label class="lbl" for="cfgKey">' + esc(t('key')) + '</label><input id="cfgKey" type="text" autocomplete="off" value="' + esc(S.cfg.key) + '">' +
      '<label class="lbl" for="cfgLink">' + esc(t('pasteLink')) + '</label><input id="cfgLink" type="text" autocomplete="off" placeholder="https://…#setup=…">' +
      '<p class="meta">' + esc(t('lastSync')) + ': ' + esc(ago(S.lastSync)) + ' · ' + esc(t('pending')) + ': ' + S.outbox.length +
      (S.lastError ? '<br><span class="err">' + esc(t('syncError')) + ': ' + esc(S.lastError) + '</span>' : '') + '</p>' +
      '<div class="actions col">' +
      '<button type="button" class="primary" data-act="save-settings">' + esc(t('save')) + ' &amp; ' + esc(t('syncNow')) + '</button>' +
      (S.cfg.url ? '<button type="button" data-act="copy-link">' + esc(t('copyLink')) + '</button>' : '') +
      '<button type="button" data-act="close">' + esc(t('close')) + '</button>' +
      '<button type="button" class="link danger" data-act="reset">' + esc(t('reset')) + '</button></div>' +
      '<p class="meta">v' + VERSION + '</p></form>';
    $('#settings').innerHTML = h;
    $('#settings').showModal();
  }
  $('#settings').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var dlg = $('#settings'), act = b.dataset.act;
    if (act === 'close') dlg.close();
    if (act === 'save-settings') {
      var fromLink = parseSetup($('#cfgLink').value);
      S.cfg = fromLink || { url: $('#cfgUrl').value.trim(), key: $('#cfgKey').value.trim() };
      persist(); dlg.close(); render(); sync(true);
    }
    if (act === 'copy-link') {
      var link = setupLink();
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject())
        .then(function () { toast(t('copied')); }, function () { window.prompt(t('copyLink'), link); });
    }
    if (act === 'reset' && window.confirm(t('resetConfirm'))) {
      S.items = []; S.outbox = []; S.checked = {}; S.lastSync = 0; persist(); dlg.close(); render(); sync(true);
    }
  });

  // ---------- sync ----------
  function fetchJSON(url, body) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 25000);
    return fetch(url, {
      method: 'POST', redirect: 'follow', signal: ctrl ? ctrl.signal : undefined,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // "simple" request: no CORS preflight
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).finally(function () { clearTimeout(timer); });
  }

  var syncTimer = null;
  function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(sync, 1500); }

  function sync(manual) {
    if (!S.cfg.url || S.syncing) return Promise.resolve();
    S.syncing = true; renderSync();
    var batch = S.outbox.slice();
    return fetchJSON(S.cfg.url, { key: S.cfg.key, changes: batch }).then(function (data) {
      if (!data || !data.ok) throw new Error((data && data.error) || 'Bad response');
      S.items = data.items || [];
      S.outbox = S.outbox.filter(function (c) { return batch.indexOf(c) < 0; });
      // forget checkmarks for items that no longer exist
      var ids = {}; S.items.forEach(function (i) { ids[i.id] = 1; });
      Object.keys(S.checked).forEach(function (id) { if (!ids[id]) delete S.checked[id]; });
      S.lastSync = Date.now(); S.lastError = null;
    }).catch(function (err) {
      S.lastError = (navigator.onLine === false) ? t('offline') : String(err && err.message || err);
      if (manual === true && navigator.onLine !== false) toast(t('syncError') + ': ' + S.lastError);
    }).then(function () {
      S.syncing = false; persist();
      var active = document.activeElement;
      if (!(active && active.id === 'search')) render(); else { renderSync(); renderAllList(); }
    });
  }

  // ---------- events ----------
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || b.closest('dialog')) return;
    if (b.dataset.lang) { S.lang = b.dataset.lang; persist(); $('#main').innerHTML = ''; render(); return; }
    if (b.dataset.tab) { S.tab = b.dataset.tab; persist(); $('#main').innerHTML = ''; render(); window.scrollTo(0, 0); return; }
    if (b.id === 'syncBtn') { if (!S.cfg.url) openSettings(); else sync(true); return; }
    if (b.id === 'settingsBtn' || b.dataset.act === 'open-settings') { openSettings(); return; }
    var act = b.dataset.act, li = b.closest('[data-id]'), id = li && li.dataset.id;
    if (act === 'check') {
      if (S.checked[id]) delete S.checked[id]; else S.checked[id] = true;
      persist(); render(); return;
    }
    if (act === 'edit') { openEditor(id); return; }
    if (act === 'plus' || act === 'minus') {
      var it = view().filter(function (x) { return x.id === id; })[0];
      var q = Math.max(0, num(it.qty) + (act === 'plus' ? 1 : -1));
      queue(id, 'qty', q); return;
    }
    if (act === 'new-list') { openTrip(); return; }
    if (act === 'toggle-done') { S.hideDone = !S.hideDone; persist(); render(); return; }
    if (act === 'clear-checks' && window.confirm(t('clearConfirm'))) { S.checked = {}; persist(); render(); }
  });

  window.addEventListener('online', function () { sync(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(); });
  setInterval(function () { if (!document.hidden) { if (S.outbox.length) sync(); else renderSync(); } }, 60000);
  setInterval(function () { if (!document.hidden) sync(); }, 5 * 60000);

  // Setup link opened directly (e.g. tapped in a message)
  var fromHash = parseSetup(location.hash);
  if (fromHash) {
    S.cfg = fromHash; persist();
    history.replaceState(null, '', location.pathname + location.search);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* app still works online */ });
  }

  render();
  sync();
  window.__sva = { S: S, sync: sync, version: VERSION };
})();
