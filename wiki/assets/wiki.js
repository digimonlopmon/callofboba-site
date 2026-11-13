/* Call of Boba / 啵啵鸡物语 Wiki — language switch, lamp (day/night), search, sortable/filterable tables, tabs.
 * Vanilla JS, no external requests. The language and time are already applied by the <head> script before the
 * first paint; this file only handles interaction. Same localStorage keys as the main site: cob.lang, cob.time.
 */
(function () {
  'use strict';
  var D = document, H = D.documentElement, W = window;
  var ROOT = H.getAttribute('data-root') || './';
  function lang() { return H.getAttribute('data-lang') === 'zh' ? 'zh' : 'en'; }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function $$(sel, el) { return Array.prototype.slice.call((el || D).querySelectorAll(sel)); }

  // ------------------------------------------------------------------ language
  function applyLang(l) {
    H.setAttribute('data-lang', l);
    H.lang = l === 'zh' ? 'zh-CN' : 'en';
    var tt = H.getAttribute('data-title-' + l); if (tt) D.title = tt;
    $$('[data-ph-' + l + ']').forEach(function (el) { el.setAttribute('placeholder', el.getAttribute('data-ph-' + l)); });
    $$('[data-label-' + l + ']').forEach(function (el) { el.setAttribute('aria-label', el.getAttribute('data-label-' + l)); });
    $$('[data-lang-switch]').forEach(function (a) { a.setAttribute('href', '?lang=' + (l === 'zh' ? 'en' : 'zh')); });
    $$('table[data-sortable]').forEach(function (t) { if (t._resort) t._resort(); });
    W.dispatchEvent(new CustomEvent('cob:lang', { detail: { lang: l } }));
  }
  $$('[data-lang-switch]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var l = lang() === 'zh' ? 'en' : 'zh';
      store('cob.lang', l);
      applyLang(l);
    });
  });
  applyLang(lang());

  // ------------------------------------------------------------------ lamp = day / night
  var lamp = D.getElementById('lamp');
  if (lamp) {
    var setPressed = function () { lamp.setAttribute('aria-pressed', H.getAttribute('data-time') === 'night' ? 'true' : 'false'); };
    setPressed();
    lamp.addEventListener('click', function () {
      var t = H.getAttribute('data-time') === 'night' ? 'day' : 'night';
      H.setAttribute('data-time', t);
      store('cob.time', t);
      setPressed();
    });
  }

  // ------------------------------------------------------------------ text of the visible language
  function visibleText(el) {
    var l = lang(), out = '';
    (function walk(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) out += c.nodeValue;
        else if (c.nodeType === 1) {
          var cl = c.getAttribute('lang');
          if ((cl === 'zh' || cl === 'en') && cl !== l) continue;
          walk(c);
        }
      }
    })(el);
    return out.replace(/\s+/g, ' ').trim();
  }

  // ------------------------------------------------------------------ tables: sort + filter
  $$('table[data-sortable]').forEach(function (table) {
    var tbody = table.tBodies[0];
    var rows = Array.prototype.slice.call(tbody.rows);
    rows.forEach(function (r, i) { r._i = i; });
    var heads = $$('thead th', table);
    var state = { col: -1, dir: 0 };
    function key(r, ci, numeric) {
      var c = r.cells[ci];
      var v = c.getAttribute('data-v');
      if (v === null) v = visibleText(c);
      if (numeric) { var f = parseFloat(v); return isNaN(f) ? -Infinity : f; }
      return v.toLowerCase();
    }
    function sort() {
      if (state.col < 0) return;
      var numeric = heads[state.col].hasAttribute('data-num');
      var coll = typeof Intl !== 'undefined' ? new Intl.Collator(lang() === 'zh' ? 'zh-Hans-CN-u-co-pinyin' : 'en', { numeric: true, sensitivity: 'base' }) : null;
      var sorted = rows.slice().sort(function (a, b) {
        var x = key(a, state.col, numeric), y = key(b, state.col, numeric), d;
        if (numeric) d = x < y ? -1 : x > y ? 1 : 0;
        else d = coll ? coll.compare(x, y) : (x < y ? -1 : x > y ? 1 : 0);
        return d !== 0 ? d * state.dir : a._i - b._i;           // stable
      });
      sorted.forEach(function (r) { tbody.appendChild(r); });
    }
    table._resort = sort;
    heads.forEach(function (th, ci) {
      var b = th.querySelector('button.sort');
      if (!b) return;
      b.addEventListener('click', function () {
        if (state.col === ci) state.dir = -state.dir;
        else { state.col = ci; state.dir = 1; }
        heads.forEach(function (h) { if (h.hasAttribute('aria-sort')) h.setAttribute('aria-sort', 'none'); });
        th.setAttribute('aria-sort', state.dir === 1 ? 'ascending' : 'descending');
        sort();
      });
    });
  });

  $$('.filters').forEach(function (box) {
    var table = D.getElementById(box.getAttribute('data-table'));
    if (!table) return;
    var groups = table._filters || (table._filters = {});
    var count = D.querySelector('[data-count-for="' + table.id + '"]');
    var countTpl = count ? count.innerHTML : '';
    function apply() {
      var shown = 0;
      Array.prototype.forEach.call(table.tBodies[0].rows, function (r) {
        var ok = true;
        for (var g in groups) {
          if (!groups[g]) continue;
          var tags = (r.getAttribute('data-f-' + g) || '').split(' ');
          if (tags.indexOf(groups[g]) < 0) { ok = false; break; }
        }
        r.hidden = !ok;
        if (ok) shown++;
      });
      if (count) count.innerHTML = countTpl.replace(/\d+/g, String(shown));
    }
    $$('.fbtn', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var g = b.getAttribute('data-group');
        $$('.fbtn[data-group="' + g + '"]', box).forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        groups[g] = b.getAttribute('data-value') || '';
        apply();
      });
    });
  });

  // ------------------------------------------------------------------ tabs (#panel-id opens a tab)
  $$('[data-tabs]').forEach(function (box) {
    var tabs = $$('[role="tab"]', box);
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var p = D.getElementById(t.getAttribute('aria-controls'));
        if (p) p.classList.toggle('on', on);
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () {
        select(t);
        if (history.replaceState) history.replaceState(null, '', '#' + t.getAttribute('aria-controls'));
      });
      t.addEventListener('keydown', function (e) {
        var j = null;
        if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = tabs.length - 1;
        if (j !== null) { e.preventDefault(); select(tabs[j], true); }
      });
    });
    function fromHash() {
      var id = decodeURIComponent(location.hash.slice(1));
      if (!id) return;
      var el = D.getElementById(id);
      if (!el || !box.contains(el)) return;
      var panel = el.closest('[role="tabpanel"]');
      var tab = panel && D.getElementById('tab-' + panel.id);
      if (tab) { select(tab); if (el !== panel) el.scrollIntoView(); }
    }
    fromHash();
    W.addEventListener('hashchange', fromHash);
  });

  // ------------------------------------------------------------------ search (assets/search.json)
  var INDEX = null, loading = null;
  function load() {
    if (INDEX) return Promise.resolve(INDEX);
    if (!loading) {
      loading = fetch(ROOT + 'assets/search.json').then(function (r) { return r.json(); })
        .then(function (j) { INDEX = j; return j; }).catch(function () { loading = null; return null; });
    }
    return loading;
  }
  function norm(s) { return (s || '').toLowerCase().replace(/[\s·・'’\-]+/g, ''); }
  function find(q) {
    var n = norm(q);
    if (!n || !INDEX) return [];
    var out = [];
    INDEX.items.forEach(function (it, i) {
      var z = norm(it.z), e = norm(it.e), score = -1;
      if (z === n || e === n) score = 0;
      else if (z.indexOf(n) === 0 || e.indexOf(n) === 0) score = 1;
      else if (z.indexOf(n) > 0 || e.indexOf(n) > 0) score = 2;
      if (score >= 0) out.push({ it: it, s: score, i: i });
    });
    out.sort(function (a, b) { return a.s - b.s || a.i - b.i; });
    return out.slice(0, 12).map(function (x) { return x.it; });
  }
  $$('.search').forEach(function (box) {
    var input = box.querySelector('input'), list = box.querySelector('.q-res');
    if (!input || !list) return;
    var items = [], active = -1;
    function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; }
    function setActive(i) {
      var lis = list.children;
      for (var k = 0; k < lis.length; k++) lis[k].setAttribute('aria-selected', k === i ? 'true' : 'false');
      active = i;
      if (i >= 0 && lis[i]) { input.setAttribute('aria-activedescendant', lis[i].id); lis[i].scrollIntoView({ block: 'nearest' }); }
    }
    function go(it) { location.href = ROOT + it.u; }
    function render() {
      var q = input.value;
      items = find(q);
      list.innerHTML = '';
      if (!q.trim()) { close(); return; }
      var l = lang();
      if (!items.length) {
        var li = D.createElement('li'); li.className = 'qempty'; li.setAttribute('role', 'option'); li.setAttribute('aria-disabled', 'true');
        li.id = input.id + '-none';
        li.textContent = l === 'zh' ? (input.getAttribute('data-none-zh') || '没有找到') : (input.getAttribute('data-none-en') || 'No results');
        list.appendChild(li);
      }
      items.forEach(function (it, i) {
        var li = D.createElement('li');
        li.id = input.id + '-o' + i; li.setAttribute('role', 'option'); li.setAttribute('aria-selected', 'false');
        if (it.i) { var ic = D.createElement('span'); ic.className = 'ic ' + it.i; ic.setAttribute('aria-hidden', 'true'); li.appendChild(ic); }
        var nm = D.createElement('span'); nm.className = 'qn'; nm.textContent = (l === 'zh' ? it.z : it.e) || it.z || it.e; li.appendChild(nm);
        var k = INDEX.kinds[it.k]; if (k) { var kk = D.createElement('span'); kk.className = 'qk'; kk.textContent = l === 'zh' ? k[0] : k[1]; li.appendChild(kk); }
        li.addEventListener('mousedown', function (e) { e.preventDefault(); go(it); });
        list.appendChild(li);
      });
      list.hidden = false; input.setAttribute('aria-expanded', 'true'); setActive(items.length ? 0 : -1);
    }
    input.addEventListener('focus', function () { load(); });
    input.addEventListener('input', function () { load().then(render); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) render(); else setActive(Math.min(items.length - 1, active + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(0, active - 1)); }
      else if (e.key === 'Enter') { if (items[active]) { e.preventDefault(); go(items[active]); } }
      else if (e.key === 'Escape') { close(); }
    });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
    W.addEventListener('cob:lang', function () { if (!list.hidden) render(); });
  });
})();
