/* Call of Boba / 啵啵鸡物语 - page logic: theme (lamp), HUD, lazy clips, R&D room mixer, menu wall, day Bobo.
 * Vanilla JS, no external requests. The night mini-game lives in dream.js and talks to this file via window.COB.
 */
(function () {
  'use strict';
  var D = document, H = D.documentElement, W = window;
  var T = JSON.parse(D.getElementById('i18n').textContent);
  var LANG = T.lang;
  var A = H.getAttribute('data-assets') || 'assets/';
  var reduceMQ = W.matchMedia('(prefers-reduced-motion: reduce)');
  var DREAM_MIN_ESSENCE = 6;   // the 18 costliest recipes are "brought back from Dreamland"; 33 of 51 are visible by day

  function $(id) { return D.getElementById(id); }
  function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, function (_, k) { return o[k] != null ? o[k] : ''; }); }
  function el(tag, cls, text) { var e = D.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
    raw: function (k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  };
  function emit(name, detail) { W.dispatchEvent(new CustomEvent(name, { detail: detail })); }
  var COB = W.COB = { T: T, lang: LANG, assets: A, store: store, fmt: fmt, emit: emit, ready: false };
  COB.reduced = function () { return reduceMQ.matches; };
  COB.isNight = function () { return H.getAttribute('data-time') === 'night'; };

  // ------------------------------------------------------------------ image cache
  var imgCache = {};
  COB.img = function (file) {
    if (!imgCache[file]) {
      imgCache[file] = new Promise(function (res, rej) {
        var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = A + file;
      });
    }
    return imgCache[file];
  };

  // ------------------------------------------------------------------ toasts
  var toasts = $('toasts');
  COB.toast = function (text) {
    while (toasts.children.length >= 3) toasts.removeChild(toasts.firstChild);
    var t = el('div', 'toast textbox', text);
    toasts.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, reduceMQ.matches ? 5000 : 3300);
  };

  // ------------------------------------------------------------------ HUD: season / weekday / clock from the visitor's own time
  var hudSeason = $('hud-season'), hudWeek = $('hud-week'), hudTime = $('hud-time'), hudTb = $('hud-tb');
  var digits = [];
  (function buildClock() {
    for (var i = 0; i < 5; i++) {
      var s = el('span', i === 2 ? 'spr s-spr_hud_colon colon' : 'spr s-spr_hud_number');
      hudTime.appendChild(s); if (i !== 2) digits.push(s);
    }
  })();
  function hudTick() {
    var d = new Date(), m = d.getMonth() + 1;
    var season = (m >= 3 && m <= 5) ? 0 : (m >= 6 && m <= 8) ? 1 : (m >= 9 && m <= 11) ? 2 : 3;
    hudSeason.style.setProperty('--f', season);
    hudWeek.style.setProperty('--f', d.getDay());          // spr_hud_week frame 0 = SUN
    var hh = d.getHours(), mm = d.getMinutes();
    [Math.floor(hh / 10), hh % 10, Math.floor(mm / 10), mm % 10].forEach(function (v, i) { digits[i].style.setProperty('--f', v); });
  }
  hudTick();
  setInterval(hudTick, 15000);
  function updateTimeblock() {
    hudTb.classList.toggle('s-spr_hud_timeblock_morning', !COB.isNight());
    hudTb.classList.toggle('s-spr_hud_timeblock_evening', COB.isNight());
  }

  // ------------------------------------------------------------------ clips (lazy: poster near viewport, play only while visible)
  var CLIPS = T.clips || {};
  function clipPoster(box) {
    var m = CLIPS[box.getAttribute('data-clip')];
    if (m) box.style.backgroundImage = 'url(' + A + m.poster + ')';
    box.classList.toggle('clip-px', !!(m && m.pixel));
  }
  function clipLoad(box) {
    var name = box.getAttribute('data-clip'), m = CLIPS[name], v = box.querySelector('video');
    if (!m || v.getAttribute('data-src') === name) return v;
    while (v.firstChild) v.removeChild(v.firstChild);
    [['mp4', 'video/mp4'], ['webm', 'video/webm']].forEach(function (p) {
      if (!m[p[0]]) return;
      var s = D.createElement('source'); s.src = A + m[p[0]]; s.type = p[1]; v.appendChild(s);
    });
    v.setAttribute('data-src', name);
    box.classList.remove('playing');
    v.load();
    return v;
  }
  function clipPlay(box) {
    if (reduceMQ.matches) return;
    var v = clipLoad(box);
    var p = v.play(); if (p && p.catch) p.catch(function () { });
  }
  function clipPause(box) { var v = box.querySelector('video'); if (v && !v.paused) v.pause(); }
  var visibleClips = new Set();
  var nearIO = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { clipPoster(e.target); nearIO.unobserve(e.target); } });
  }, { rootMargin: '600px 0px' });
  var playIO = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting) { visibleClips.add(e.target); if (!D.hidden) clipPlay(e.target); }
      else { visibleClips.delete(e.target); clipPause(e.target); }
    });
  }, { threshold: 0.2 });
  D.querySelectorAll('.clip').forEach(function (box) {
    var v = box.querySelector('video');
    v.addEventListener('playing', function () { box.classList.add('playing'); });
    nearIO.observe(box); playIO.observe(box);
    if (reduceMQ.matches) {     // no autoplay: offer the controls instead
      v.controls = true; v.removeAttribute('aria-hidden'); v.removeAttribute('tabindex');
      var h = box.parentNode.querySelector('h3');
      v.setAttribute('aria-label', h ? h.textContent : T.name);
      v.preload = 'none'; box.classList.add('has-controls');
      clipLoad(box);
    }
  });
  var heroClip = $('hero-clip');
  function swapHeroClip() {
    var name = COB.isNight() ? T.clip_night : T.clip_day;
    if (heroClip.getAttribute('data-clip') === name) return;
    heroClip.setAttribute('data-clip', name);
    clipPoster(heroClip);
    if (reduceMQ.matches) clipLoad(heroClip);
    else if (visibleClips.has(heroClip)) clipPlay(heroClip);
  }

  // ------------------------------------------------------------------ gameplay cards: at night the dream card goes first
  var cardList = $('cards');
  function reorderCards() {
    var cards = [].slice.call(cardList.children);
    cards.sort(function (a, b) {
      var ka = +a.getAttribute('data-order'), kb = +b.getAttribute('data-order');
      if (COB.isNight()) { if (a.getAttribute('data-card') === 'combat') ka = -1; if (b.getAttribute('data-card') === 'combat') kb = -1; }
      return ka - kb;
    });
    cards.forEach(function (c) { cardList.appendChild(c); });
  }

  // ------------------------------------------------------------------ lamp = day/night switch
  var lamp = $('lamp'), lampFloat = $('lamp-float'), lampHint = $('lamp-hint'), fade = $('fade');
  var zzz = D.querySelector('.zzz');
  var switching = false;
  function updateLamp() { lampHint.textContent = COB.isNight() ? T.lamp_night : T.lamp_day; }
  function applyTime(t, reason) {
    H.setAttribute('data-time', t);
    updateLamp(); updateTimeblock(); swapHeroClip(); reorderCards(); boboTime();
    emit('cob:time', { time: t, reason: reason || 'user' });
  }
  COB.setTime = function (t, opts) {
    opts = opts || {};
    if (switching || t === H.getAttribute('data-time')) return;
    if (opts.persist !== false) store.raw('cob.time', t);
    if (reduceMQ.matches) { applyTime(t, opts.reason); return; }
    switching = true;
    if (t === 'night' && zzz) { zzz.classList.remove('on'); void zzz.offsetWidth; zzz.classList.add('on'); }
    fade.classList.add('on');
    setTimeout(function () {
      applyTime(t, opts.reason);
      fade.classList.remove('on');
      setTimeout(function () { switching = false; }, 300);
    }, 300);
  };
  function toggle() { COB.setTime(COB.isNight() ? 'day' : 'night'); }
  lamp.addEventListener('click', toggle);
  lampFloat.addEventListener('click', toggle);
  new IntersectionObserver(function (es) {
    es.forEach(function (e) { lampFloat.hidden = e.isIntersecting; });
  }, { rootMargin: '-56px 0px 0px 0px' }).observe(lamp);

  // ------------------------------------------------------------------ tab title, todo links, QQ copy
  var baseTitle = D.title;
  D.addEventListener('visibilitychange', function () {
    D.title = D.hidden ? T.tab_away : baseTitle;
    visibleClips.forEach(function (b) { if (D.hidden) clipPause(b); else clipPlay(b); });
  });
  D.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-todo]');
    if (a) e.preventDefault();
  });
  var qq = $('qq-copy');
  if (qq) {
    qq.addEventListener('click', function () {
      var num = qq.getAttribute('data-qq'), label = qq.textContent;
      function done() {
        qq.textContent = qq.getAttribute('data-done'); $('qq-status').textContent = qq.getAttribute('data-done');
        setTimeout(function () { qq.textContent = label; $('qq-status').textContent = ''; }, 2000);
      }
      function legacy() {
        var ta = el('textarea'); ta.value = num; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        D.body.appendChild(ta); ta.select();
        try { if (D.execCommand('copy')) done(); } catch (e) { }
        D.body.removeChild(ta);
      }
      if (navigator.clipboard && W.isSecureContext) navigator.clipboard.writeText(num).then(done, legacy); else legacy();
    });
  }

  // ------------------------------------------------------------------ day Bobo: walks along the bottom edge after the pointer (CSS only, no rAF)
  var bobo = $('bobo-day');
  var boboX = Math.round(W.innerWidth * 0.5);
  function boboScale() { return W.innerWidth >= 1100 ? 3 : 2; }
  function boboW() { return 21 * boboScale(); }
  function boboPose(run, dir) {
    bobo.classList.toggle('s-spr_player_run', run);
    bobo.classList.toggle('s-spr_player_idle', !run);
    // 4-direction blocks: idle R0-4 U5-9 L10-14 D15-19 / run R0-7 U8-15 L16-23 D24-31
    var f0 = run ? (dir < 0 ? 16 : 0) : 15, cnt = run ? 8 : 5;
    bobo.style.setProperty('--f0', f0); bobo.style.setProperty('--cnt', cnt); bobo.style.setProperty('--f', f0);
  }
  function boboCurrentX() {
    var m = getComputedStyle(bobo).transform;
    if (m && m !== 'none') { var p = m.match(/matrix(?:3d)?\(([^)]+)\)/); if (p) { var v = p[1].split(','); return parseFloat(v[v.length === 16 ? 12 : 4]); } }
    return boboX;
  }
  function boboGo(cx) {
    if (COB.isNight() || reduceMQ.matches) return;
    var target = Math.max(0, Math.min(W.innerWidth - boboW(), Math.round(cx - boboW() / 2)));
    var cur = boboCurrentX();
    var dx = target - cur;
    if (Math.abs(dx) < 6) return;
    var speed = 40 * boboScale();              // px/s, an easy stroll
    bobo.style.transition = 'none';
    bobo.style.setProperty('--bx', cur + 'px');
    void bobo.offsetWidth;
    bobo.style.transition = 'transform ' + (Math.abs(dx) / speed).toFixed(2) + 's linear';
    bobo.style.setProperty('--bx', target + 'px');
    boboX = target;
    boboPose(true, dx);
  }
  bobo.addEventListener('transitionend', function () { boboPose(false); });
  function boboPlace(x) {
    boboX = Math.max(0, Math.min(W.innerWidth - boboW(), Math.round(x)));
    bobo.style.transition = 'none'; bobo.style.setProperty('--bx', boboX + 'px'); boboPose(false);
  }
  COB.bobo = {
    x: function () { return COB.isNight() ? boboX : boboCurrentX(); },
    set: function (x) { boboX = x; },
    scale: boboScale
  };
  function boboTime() {
    bobo.style.setProperty('--s', boboScale());
    if (!COB.isNight()) boboPlace(boboX);
  }
  var lastMove = 0;
  D.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    var now = performance.now(); if (now - lastMove < 140) return; lastMove = now;
    boboGo(e.clientX);
  }, { passive: true });
  COB.onTap = [];   // dream.js subscribes; a "tap" = press + release without dragging/scrolling
  (function tapDetector() {
    var start = null;
    D.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) { start = null; return; }
      start = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, type: e.pointerType, target: e.target };
    }, { passive: true });
    D.addEventListener('pointermove', function (e) {
      if (start && e.pointerId === start.id && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) start = null;
    }, { passive: true });
    D.addEventListener('pointercancel', function () { start = null; }, { passive: true });
    W.addEventListener('scroll', function () { if (start && start.type !== 'mouse') start = null; }, { passive: true });
    D.addEventListener('pointerup', function (e) {
      var s = start; start = null;
      if (!s || e.pointerId !== s.id || performance.now() - s.t > 600) return;
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) return;
      var sel = W.getSelection && W.getSelection();
      var tap = { x: e.clientX, y: e.clientY, type: s.type, target: s.target, selecting: !!(sel && String(sel).length) };
      if (s.type !== 'mouse') boboGo(e.clientX);
      COB.onTap.forEach(function (fn) { fn(tap); });
    }, { passive: true });
  })();
  W.addEventListener('resize', function () { bobo.style.setProperty('--s', boboScale()); boboPlace(Math.min(boboX, W.innerWidth - boboW())); });

  // ------------------------------------------------------------------ data
  var DATA, SPR, IDX, RECIPES, RBYID = {}, ING;
  function name(r) { return LANG === 'zh' ? r.zh : (r.en || r.zh); }
  function ingName(id) { if (id === 'ice') return T.ice; var g = ING[id]; return LANG === 'zh' ? g.zh : (g.en || g.zh); }
  COB.recipeName = function (r) { return name(r); };
  function atl(atlasKey, itemKey, scale) {
    var a = SPR[atlasKey], it = a.items[itemKey];
    var s = el('span', 'atl a-' + atlasKey);
    s.style.cssText = '--ix:' + it.x + ';--iy:' + it.y + ';--iw:' + it.w + ';--ih:' + it.h + (scale ? ';--s:' + scale : '');
    return s;
  }
  COB.atl = function (a, k, s) { return atl(a, k, s); };

  Promise.all([
    fetch(A + 'data/recipes.json').then(function (r) { return r.json(); }),
    fetch(A + 'data/sprites.json').then(function (r) { return r.json(); })
  ]).then(function (res) {
    DATA = res[0]; SPR = res[1];
    RECIPES = DATA.recipes; ING = DATA.ingredients;
    RECIPES.forEach(function (r) { RBYID[r.id] = r; });
    IDX = W.CobMatcher.build(RECIPES);
    COB.data = DATA; COB.sprites = SPR;
    initWall();
    initMixer();
    COB.ready = true;
    emit('cob:ready');
  }).catch(function (err) { if (W.console) console.error('[cob] data load failed', err); });

  // ------------------------------------------------------------------ menu wall
  var unlocked = store.get('cob.unlocked', []), mixed = store.get('cob.mixed', []);
  if (!Array.isArray(unlocked)) unlocked = [];
  if (!Array.isArray(mixed)) mixed = [];
  function isDream(r) { return (r.dream || 0) >= DREAM_MIN_ESSENCE; }
  function isHidden(r) { return isDream(r) && unlocked.indexOf(r.id) < 0 && mixed.indexOf(r.id) < 0; }
  var wallItems = {}, pop = null, popFor = null, popPinned = false, popTimer = 0;

  function initWall() {
    var groups = $('wall-groups');
    DATA.categories.forEach(function (c) {
      var list = RECIPES.filter(function (r) { return r.cat === c.id; });
      if (!list.length) return;
      var sec = el('div', 'wall-cat');
      var h = el('h3', 'f-head');
      var t = atl('atlas_menu', list[0].id, 1); t.setAttribute('aria-hidden', 'true'); h.appendChild(t);
      h.appendChild(D.createTextNode(T['cat_' + c.id] || c.id));
      sec.appendChild(h);
      var ul = el('ul', 'wall-items');
      list.forEach(function (r) {
        var li = el('li');
        var b = el('button', 'wall-item');
        b.type = 'button';
        b.setAttribute('aria-expanded', 'false');
        b.appendChild(atl('atlas_menu', r.id, 2));
        b.addEventListener('click', function () {
          if (popFor === r.id && popPinned) closePop(); else openPop(r, b, true);
        });
        b.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' && !popPinned) { clearTimeout(popTimer); openPop(r, b, false); } });
        b.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !popPinned) schedulePopClose(); });
        li.appendChild(b); ul.appendChild(li);
        wallItems[r.id] = b;
        paintItem(r);
      });
      sec.appendChild(ul);
      groups.appendChild(sec);
    });
    D.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pop && popFor) { var b = wallItems[popFor]; closePop(); if (b) b.focus(); } });
    D.addEventListener('pointerdown', function (e) {
      if (popPinned && pop && !pop.contains(e.target) && !(e.target.closest && e.target.closest('.wall-item'))) closePop();
    });
    W.addEventListener('resize', function () { if (popFor) placePop(wallItems[popFor]); });
    updateCount();
  }
  function paintItem(r, fresh) {
    var b = wallItems[r.id]; if (!b) return;
    var hidden = isHidden(r), made = mixed.indexOf(r.id) >= 0;
    b.classList.toggle('locked', hidden);
    var q = b.querySelector('.q'), tk = b.querySelector('.tick');
    if (hidden && !q) { q = el('span', 'q'); q.setAttribute('aria-hidden', 'true'); q.appendChild(atl('atlas_menu', RECIPES[0].id, 2)); q.appendChild(el('span', 'qm', '?')); b.appendChild(q); }
    if (!hidden && q) b.removeChild(q);
    if (made && !tk) { tk = el('span', 'spr s-spr_check tick'); tk.setAttribute('aria-hidden', 'true'); b.appendChild(tk); }
    b.setAttribute('aria-label', hidden ? T.unknown : name(r) + (made ? (LANG === 'zh' ? '，' : ', ') + T.made : ''));
    if (fresh && !reduceMQ.matches) { b.classList.remove('fresh'); void b.offsetWidth; b.classList.add('fresh'); }
  }
  function updateCount() {
    var known = RECIPES.filter(function (r) { return !isHidden(r); }).length;
    $('wall-count').textContent = fmt(T.wall_count, { n: known, total: RECIPES.length });
    $('wall-dream').hidden = !RECIPES.some(isHidden);
  }
  function schedulePopClose() { clearTimeout(popTimer); popTimer = setTimeout(function () { if (!popPinned) closePop(); }, 220); }
  function closePop() {
    clearTimeout(popTimer);
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    if (popFor && wallItems[popFor]) wallItems[popFor].setAttribute('aria-expanded', 'false');
    popFor = null; popPinned = false;
  }
  function openPop(r, btn, pinned) {
    if (popFor && popFor !== r.id) closePop();
    if (!pop) {
      pop = el('li', 'wall-pop textbox');
      pop.id = 'wall-pop';
      pop.addEventListener('pointerenter', function () { clearTimeout(popTimer); });
      pop.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !popPinned) schedulePopClose(); });
    }
    popPinned = pinned || popPinned;
    if (popFor === r.id) return;
    popFor = r.id;
    pop.innerHTML = '';
    var hidden = isHidden(r);
    var h = el('h4', null, hidden ? T.unknown : name(r));
    pop.appendChild(h);
    if (hidden) {
      pop.appendChild(el('p', null, T.wall_dream));
    } else if (r.ings && r.ings.length) {
      var ul = el('ul', 'pop-ings');
      r.ings.forEach(function (id) {
        var li = el('li'); var icon = atl('atlas_items', id, 2);
        icon.setAttribute('role', 'img'); icon.setAttribute('aria-label', ingName(id)); icon.title = ingName(id);
        li.appendChild(icon); ul.appendChild(li);
      });
      pop.appendChild(ul);
    }
    var act = el('div', 'pop-actions');
    if (!hidden && r.ings && r.ings.length) {
      var go = el('button', 'btn btn-sm btn-primary', T.show_me); go.type = 'button';
      go.addEventListener('click', function () { closePop(); COB.mixer && COB.mixer.hint(r); });
      act.appendChild(go);
    }
    var x = el('button', 'btn btn-sm', T.close); x.type = 'button';
    x.addEventListener('click', function () { closePop(); btn.focus(); });
    act.appendChild(x);
    pop.appendChild(act);
    btn.parentNode.parentNode.insertBefore(pop, btn.parentNode.nextSibling);
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-controls', 'wall-pop');
    placePop(btn);
  }
  function placePop(btn) {
    if (!pop || !btn) return;
    var host = $('wall-groups').getBoundingClientRect(), b = btn.getBoundingClientRect();
    var pw = pop.offsetWidth || 280;
    var left = b.left - host.left + b.width / 2 - pw / 2;
    left = Math.max(0, Math.min(host.width - pw, left));
    pop.style.left = left + 'px';
    pop.style.top = (b.bottom - host.top + 8) + 'px';
  }
  function markMixed(r) {
    if (mixed.indexOf(r.id) < 0) { mixed.push(r.id); store.set('cob.mixed', mixed); }
    paintItem(r, true); updateCount();
  }
  COB.unlockRandomDream = function () {
    var pool = RECIPES.filter(isHidden);
    if (!pool.length) return null;
    var r = pool[Math.floor(Math.random() * pool.length)];
    unlocked.push(r.id); store.set('cob.unlocked', unlocked);
    paintItem(r, true); updateCount();
    if (popFor === r.id) closePop();
    return r;
  };
  COB.unlockAllDream = function () {
    var pool = RECIPES.filter(isHidden);
    pool.forEach(function (r) { unlocked.push(r.id); paintItem(r, true); });
    store.set('cob.unlocked', unlocked); updateCount();
    return pool.length;
  };

  // ------------------------------------------------------------------ R&D room: the mixer
  function initMixer() {
    var canvas = $('cup'), ctx = canvas.getContext('2d');
    var off = D.createElement('canvas'), octx = off.getContext('2d');
    var CUPS = { plastic: 'plasticCup', cold: 'coldDrinkCup', hot: 'hotDrinkCup' };
    var LW = 192, LH = 180, k = 2, css = 2;       // logical size (sprite px) and device scale
    var imgs = {};
    var need = ['spr_background_makeStation', 'spr_liquid'];
    Object.keys(CUPS).forEach(function (c) { ['bottom', 'top'].forEach(function (p) { need.push('spr_cup_' + CUPS[c] + '_' + p); }); });
    Object.keys(ING).forEach(function (id) { if (ING[id].jam) need.push(ING[id].jam); });
    var hb = SPR.atlas_hardbody;
    var st, raf = 0, last = 0, hm = null, geo = null;
    var buttons = {};
    var showing = null;

    function reset() {
      st = { order: [], liquids: [], goo: [], lids: [], powders: [], pieces: [], ice: false, cup: 'plastic' };
      geo = geometry('plastic'); hm = floorMap();
      Object.keys(buttons).forEach(function (id) { buttons[id].classList.remove('in-cup'); buttons[id].removeAttribute('aria-disabled'); });
      $('rnd-note').textContent = '';
      hideResult(); clearHint(); status(); updateServe();
      draw();
    }
    function geometry(cup) {
      var name = CUPS[cup], m = SPR['spr_cup_' + name + '_mask'];
      var cx = LW / 2 + (cup === 'hot' ? 18 : 0), cy = 90;
      var dx = cx - m.ox, dy = cy - m.oy;
      var top = [], bot = [], bottomMax = -1, rim = 1e9;
      for (var x = 0; x < LW; x++) {
        var sx = x - dx, t = (sx >= 0 && sx < m.w) ? m.colTop[sx] : -1;
        top.push(t >= 0 ? t + dy : -1); bot.push(t >= 0 ? m.colBottom[sx] + dy : -1);
        if (t >= 0) { bottomMax = Math.max(bottomMax, m.colBottom[sx] + dy); rim = Math.min(rim, t + dy); }
      }
      // interior columns whose floor is near the lowest point = where things can rest
      var floorCols = [];
      for (x = 0; x < LW; x++) if (bot[x] >= bottomMax - 14) floorCols.push(x);
      var clip = new Path2D();
      m.rows.forEach(function (r) { clip.rect(r[1] + dx, r[0] + dy, r[2] - r[1], 1); });
      return { name: name, cx: cx, dx: dx, dy: dy, top: top, bot: bot, bottom: bottomMax, rim: rim, clip: clip,
               fmin: floorCols[0], fmax: floorCols[floorCols.length - 1], height: bottomMax - rim };
    }
    function floorMap() { return geo.bot.map(function (b) { return b >= 0 ? b : -1; }); }

    function totals() {
      var t = 0;
      [st.goo, st.liquids, st.lids].forEach(function (L) { L.forEach(function (l) { t += l.shown; }); });
      return t;
    }
    function surfaceY() {
      var t = totals(), max = geo.height * 0.86, f = t > max ? max / t : 1;
      return { y: geo.bottom - t * f, f: f, any: t > 0.5 };
    }
    function hasLiquid() { return st.goo.length + st.liquids.length + st.lids.length > 0; }

    // --- drawing helpers (logical coordinates, device scale k, nearest neighbour)
    function spr(c, name, frame, x, y) {
      var m = SPR[name], im = imgs[name]; if (!im) return;
      c.drawImage(im, frame * m.w, 0, m.w, m.h, Math.round(x - m.ox), Math.round(y - m.oy), m.w, m.h);
    }
    function piece(c, p) {
      var it = hb.items[p.body], im = imgs.atlas_hardbody; if (!im) return;
      c.save(); c.translate(p.x, p.y); if (p.rot) c.rotate(p.rot);
      c.drawImage(im, it.x, it.y, it.w, it.h, -it.ox, -it.oy, it.w, it.h);
      c.restore();
    }
    function mix(a, b) { return [(a[0] + b[0]) >> 1, (a[1] + b[1]) >> 1, (a[2] + b[2]) >> 1, (a[3] + b[3]) / 2]; }
    function rgba(c) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (c[3] == null ? 1 : c[3]) + ')'; }
    function layerColor(l) {
      var g = ING[l.id];
      if (g.kind === 'liquid') return g.rgba;
      if (g.tint) return [g.tint[0], g.tint[1], g.tint[2], 1];
      return [255, 255, 255, 1];
    }

    function draw() {
      if (!imgs.spr_background_makeStation) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      spr(ctx, 'spr_background_makeStation', 0, LW / 2 - 80, 0);
      var cx = geo.cx, cy = 90;
      spr(ctx, 'spr_cup_' + geo.name + '_bottom', 0, cx, cy);

      // contents -> offscreen, clipped to the inside of the cup wall (derived from spr_cup_*_mask)
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.clearRect(0, 0, off.width, off.height);
      octx.imageSmoothingEnabled = false;
      octx.setTransform(k, 0, 0, k, 0, 0);
      octx.save();
      octx.clip(geo.clip);
      var s = surfaceY(), y = geo.bottom + 1, prev = null;
      var layers = st.goo.concat(st.liquids, st.lids);
      layers.forEach(function (l) {
        var h = l.shown * s.f; if (h <= 0.2) return;
        var g = ING[l.id], top = y - h;
        if (g.kind === 'jam' && imgs[g.jam]) {
          var pat = octx.createPattern(imgs[g.jam], 'repeat');
          octx.fillStyle = pat;
          octx.fillRect(0, Math.round(top), LW, Math.ceil(y - Math.round(top)));
        } else {
          var col = layerColor(l);
          octx.fillStyle = rgba(col);
          octx.fillRect(0, Math.round(top), LW, Math.ceil(y - Math.round(top)));
          if (prev && g.kind === 'liquid' && ING[prev.id].kind === 'liquid') {   // soft seam between two liquids
            octx.fillStyle = rgba(mix(layerColor(prev), col));
            octx.fillRect(0, Math.round(y) - 1, LW, 2);
          }
        }
        prev = l; y = top;
      });
      st.powders.forEach(function (pw) {
        pw.dots.forEach(function (d) { octx.fillStyle = 'rgb(' + d.c.join(',') + ')'; octx.fillRect(d.x, Math.round(s.y) - d.dy, 1, 1); });
      });
      st.pieces.forEach(function (p) { if (p.landed) { if (p.float && s.any) p.y = s.y + p.dy; piece(octx, p); } });
      octx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(off, 0, 0);
      ctx.setTransform(k, 0, 0, k, 0, 0);
      st.pieces.forEach(function (p) { if (!p.landed) piece(ctx, p); });
      spr(ctx, 'spr_cup_' + geo.name + '_top', 0, cx, cy);
    }

    function size() {
      css = W.innerWidth < 720 ? 1 : 2;      // phones: x1 CSS (still 2-3 device px per sprite px)
      LW = W.innerWidth < 420 ? 168 : 192;
      var dpr = W.devicePixelRatio || 1;
      k = Math.max(1, Math.round(css * dpr));     // device px per sprite px (integer)
      canvas.width = off.width = LW * k; canvas.height = off.height = LH * k;
      canvas.style.width = (LW * k / dpr) + 'px'; canvas.style.height = (LH * k / dpr) + 'px';
      if (st) { geo = geometry(st.cup); restack(); draw(); }
    }

    // --- physics-lite: fall, then rest on a per-column height map
    function landY(p) {
      var r = p.r, y = 1e9;
      for (var x = Math.floor(p.x - r * 0.8); x <= Math.ceil(p.x + r * 0.8); x++) if (hm[x] > 0) y = Math.min(y, hm[x]);
      return (y === 1e9 ? geo.bottom : y) - r * 0.85;
    }
    function settle(p) {
      for (var x = Math.floor(p.x - p.r * 0.75); x <= Math.ceil(p.x + p.r * 0.75); x++) {
        if (hm[x] > 0) hm[x] = Math.min(hm[x], Math.round(p.y - p.r * 0.55));
      }
    }
    // a piece that lands on another one rolls sideways to the lowest nearby spot
    function roll(p) {
      var best = p.x, bestY = landY(p), x0 = p.x;
      for (var d = -2 * p.r; d <= 2 * p.r; d += 2) {
        var x = Math.max(geo.fmin + p.r, Math.min(geo.fmax - p.r, x0 + d));
        p.x = x; var y = landY(p);
        if (y > bestY + 1 || (Math.abs(y - bestY) <= 1 && Math.abs(x - x0) < Math.abs(best - x0))) { best = x; bestY = y; }
      }
      p.x = best;
    }
    function restack() {
      hm = floorMap();
      st.pieces.forEach(function (p) {
        p.x = Math.max(geo.fmin + p.r, Math.min(geo.fmax - p.r, p.x));
        if (p.landed && !(p.float && hasLiquid())) { roll(p); p.y = landY(p); settle(p); }
      });
    }
    function spawn(body, n, float) {
      var it = hb.items[body]; if (!it) return;
      for (var i = 0; i < n; i++) {
        if (st.pieces.length >= 90) return;
        var r = Math.max(it.w, it.h) / 2;
        var span = Math.max(1, geo.fmax - geo.fmin - 2 * r);
        st.pieces.push({
          body: body, r: r, float: float,
          x: geo.fmin + r + Math.random() * span,
          y: geo.rim - 26 - i * 14 - Math.random() * 6, vy: 0,
          rot: Math.random() < 0.5 ? 0 : (Math.random() - 0.5) * 1.4,
          dy: -Math.round(it.h * 0.25) + Math.round(Math.random() * 3), landed: false
        });
      }
      run();
    }
    function step(dt) {
      var busy = false;
      [st.goo, st.liquids, st.lids].forEach(function (L) {
        L.forEach(function (l) {
          if (Math.abs(l.amt - l.shown) > 0.15) { l.shown += (l.amt - l.shown) * Math.min(1, dt * 7); busy = true; } else l.shown = l.amt;
        });
      });
      var s = surfaceY();
      st.pieces.forEach(function (p) {
        if (p.landed) return;
        busy = true;
        p.vy += 900 * dt; p.y += p.vy * dt;
        var target = (p.float && s.any) ? s.y + p.dy : landY(p);
        if (p.y >= target) {
          if (!(p.float && s.any)) roll(p);
          p.y = (p.float && s.any) ? target : landY(p); p.landed = true;
          if (!(p.float && s.any)) settle(p);
        }
      });
      return busy;
    }
    function frame(t) {
      var dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
      var busy = reduceMQ.matches ? finishNow() : step(dt);
      draw();
      raf = busy ? requestAnimationFrame(frame) : 0;
    }
    function finishNow() { for (var i = 0; i < 400 && step(0.05);) i++; return false; }
    function run() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

    // --- adding ingredients
    function add(id) {
      hideResult();
      var note = $('rnd-note');
      note.textContent = '';
      if (id === 'ice') {
        st.ice = true; spawn('spr_hardbody_ice', 2, true);
      } else {
        var g = ING[id];
        if (g.kind === 'liquid') {
          var l = st.liquids.filter(function (x) { return x.id === id; })[0];
          if (!l) {
            if (st.liquids.length >= 3) { note.textContent = T.liquid_max; return; }
            l = { id: id, amt: 14, shown: 0 }; st.liquids.push(l);
          }
          l.amt += 16;
        } else if (g.kind === 'jam' || g.kind === 'paste' || g.kind === 'mochi') {
          var gl = st.goo.filter(function (x) { return x.id === id; })[0];
          if (!gl) { gl = { id: id, amt: 0, shown: 0 }; st.goo.push(gl); }
          gl.amt += 9;
        } else if (g.kind === 'lid') {
          var ll = st.lids.filter(function (x) { return x.id === id; })[0];
          if (!ll) { ll = { id: id, amt: 0, shown: 0 }; st.lids.push(ll); }
          ll.amt += 8;
        } else if (g.kind === 'powder') {
          var pw = st.powders.filter(function (x) { return x.id === id; })[0];
          if (!pw) { pw = { id: id, dots: [] }; st.powders.push(pw); }
          for (var i = 0; i < 46 && pw.dots.length < 220; i++) {
            pw.dots.push({ x: geo.fmin - 6 + Math.floor(Math.random() * (geo.fmax - geo.fmin + 12)), dy: Math.floor(Math.random() * 3), c: g.colors[Math.floor(Math.random() * g.colors.length)] });
          }
        } else {
          spawn(g.body, g.count || 3, g.kind === 'topping');
        }
        if (st.order.indexOf(id) < 0) st.order.push(id);
      }
      var cup = W.CobMatcher.cupFor(st.order, st.ice);
      if (cup !== st.cup) { st.cup = cup; geo = geometry(cup); restack(); }
      if (buttons[id]) buttons[id].classList.add('in-cup');
      var full = st.liquids.length >= 3;
      Object.keys(buttons).forEach(function (bid) {
        if (bid !== 'ice' && ING[bid] && ING[bid].kind === 'liquid') {
          var inCup = st.liquids.some(function (x) { return x.id === bid; });
          if (full && !inCup) buttons[bid].setAttribute('aria-disabled', 'true'); else buttons[bid].removeAttribute('aria-disabled');
        }
      });
      status(); updateServe(); run();
    }
    function status() {
      var names = st.order.map(ingName); if (st.ice) names.push(T.ice);
      $('cup-status').textContent = names.length ? fmt(T.cup_has, { list: names.join(T.list_sep) }) : T.cup_empty;
    }
    function updateServe() { $('serve').disabled = !st.order.length; }

    // --- serve: compare ingredient sets only
    var result = $('result');
    function hideResult() { result.hidden = true; result.innerHTML = ''; }
    function serve() {
      var res = W.CobMatcher.match(IDX, st.order, st.cup);
      result.innerHTML = '';
      var art = el('div', 'r-art'), txt = el('div', 'r-text');
      if (res.type === 'exact') {
        var r = res.recipe;
        if (r.card) {
          var img = new Image(); var sc = result.parentNode.clientWidth >= 380 ? 2 : 1;
          img.src = A + SPR.cards.dir + r.id + '.png'; img.width = 88 * sc; img.height = 107 * sc; img.alt = name(r);
          art.appendChild(img);
        } else {
          var ic = atl('atlas_menu', r.id, 3); ic.setAttribute('role', 'img'); ic.setAttribute('aria-label', name(r)); art.appendChild(ic);
        }
        txt.appendChild(el('p', null, fmt(T.ok, { name: name(r) })));
        if (r.price != null) {
          var pr = el('p', 'r-price'); pr.setAttribute('aria-label', fmt(T.price, { n: r.price }));
          var coin = el('span', 'spr s-spr_hud_money'); coin.style.setProperty('--s', 3); coin.setAttribute('aria-hidden', 'true');
          var num = el('span', null, String(r.price)); num.setAttribute('aria-hidden', 'true');
          pr.appendChild(coin); pr.appendChild(num); txt.appendChild(pr);
        }
        markMixed(r);
        if (showing && showing.id === r.id) clearHint();
      } else {
        var f = el('span', 'spr s-spr_menu_failure'); f.style.setProperty('--s', 3); f.setAttribute('aria-hidden', 'true');
        art.appendChild(f);
        txt.appendChild(el('p', null, T.fail));
        if (res.type === 'near') {
          var tpl = res.missing ? T.near_missing : T.near_extra;
          txt.appendChild(el('p', null, fmt(tpl, { name: name(res.recipe), x: ingName(res.missing || res.extra) })));
        }
      }
      result.appendChild(art); result.appendChild(txt);
      result.hidden = false;
      if (result.getBoundingClientRect().bottom > W.innerHeight) result.scrollIntoView({ block: 'nearest', behavior: reduceMQ.matches ? 'auto' : 'smooth' });
    }

    // --- "show me": highlight one recipe's ingredients (a hint, it doesn't mix for you)
    function clearHint() {
      showing = null;
      Object.keys(buttons).forEach(function (id) { buttons[id].classList.remove('hint'); });
      var s = $('rnd-showing'); s.hidden = true; s.textContent = '';
    }
    function hint(r) {
      clearHint();
      showing = r;
      var ids = r.ings.slice();
      (DATA.dupes || []).forEach(function (g) { if (g.indexOf(r.id) >= 0 && r.cup === 'cold') ids.push('ice'); });
      ids.forEach(function (id) { if (buttons[id]) buttons[id].classList.add('hint'); });
      var s = $('rnd-showing'); s.textContent = fmt(T.showing, { name: name(r) }); s.hidden = false;
      $('rnd').scrollIntoView({ behavior: reduceMQ.matches ? 'auto' : 'smooth', block: 'start' });
      var first = buttons[ids[0]];
      if (first) {
        setTimeout(function () { first.focus({ preventScroll: true }); if (first.scrollIntoView && first.parentNode.scrollWidth > first.parentNode.clientWidth) first.scrollIntoView({ block: 'nearest', inline: 'center' }); }, reduceMQ.matches ? 0 : 400);
      }
    }

    // --- shelf buttons
    function makeButton(id, label) {
      var b = el('button', 'ing'); b.type = 'button'; b.setAttribute('data-id', id);
      var ic = atl('atlas_ingbtn', id); ic.setAttribute('aria-hidden', 'true');
      b.appendChild(ic);
      b.appendChild(el('span', 'ing-name', label));
      b.addEventListener('click', function () { if (b.getAttribute('aria-disabled') === 'true') { $('rnd-note').textContent = T.liquid_max; return; } add(id); });
      buttons[id] = b;
      return b;
    }
    Object.keys(ING).forEach(function (id) {
      var g = ING[id];
      $(g.kind === 'liquid' ? 'shelf-liquid' : 'shelf-solid').appendChild(makeButton(id, ingName(id)));
    });
    $('shelf-ice').appendChild(makeButton('ice', T.ice));
    $('serve').addEventListener('click', serve);
    $('reset').addEventListener('click', reset);

    COB.mixer = { hint: hint };
    var loads = need.map(function (n) { return COB.img(SPR[n].file).then(function (im) { imgs[n] = im; }); });
    loads.push(COB.img(hb.file).then(function (im) { imgs.atlas_hardbody = im; }));
    reset();
    size();
    Promise.all(loads).then(function () { draw(); });
    var rt = 0;
    W.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(size, 120); });
    if (W.matchMedia) { try { W.matchMedia('(resolution: ' + (W.devicePixelRatio || 1) + 'dppx)').addEventListener('change', size); } catch (e) { } }
  }

  // initial paint of theme-dependent bits
  updateLamp(); updateTimeblock(); swapHeroClip(); clipPoster(heroClip); reorderCards(); boboTime();
})();
