/* Call of Boba site - night mode: "打珍珠" mini-game on a click-through canvas + twinkling stars behind the page.
 * Runs requestAnimationFrame only at night while the tab is visible. prefers-reduced-motion: no Bobo, no monsters
 * (static stars only). All visuals are the game's own sprites, drawn at integer device scale.
 */
(function () {
  'use strict';
  var W = window, D = document, COB = W.COB;
  if (!COB) return;
  var T = COB.T;
  var canvas = D.getElementById('dream'), ctx = canvas.getContext('2d');
  var starsC = D.getElementById('stars'), sctx = starsC.getContext('2d');
  var counter = D.getElementById('dream-counter'), counterText = D.getElementById('dream-counter-text'),
      counterIcon = D.getElementById('dream-counter-icon');

  var SPR = null, imgs = {}, whites = {}, ready = false;
  var vw = 0, vh = 0, dpr = 1, S = 3, K = 3;           // S: CSS px per sprite px, K: device px per sprite px
  var raf = 0, last = 0, night = false, stars = [], starTick = -1;
  var G = null;                                         // per-night game state

  var MONSTERS = {
    printer: { idle: 'spr_enemy_printer_idle', move: 'spr_enemy_printer_idle', hurt: 'spr_enemy_printer_attacked', hp: 2, speed: 20, zone: [0.52, 0.84] },
    camera: { idle: 'spr_enemy_securityCamera_idle_0', move: 'spr_enemy_securityCamera_move', hp: 1, speed: 28, zone: [0.16, 0.44], bob: true },
    coffee: { idle: 'spr_enemy_coffeeMachine_idle', move: 'spr_enemy_coffeeMachine_move', hp: 2, speed: 24, zone: [0.5, 0.84] }
  };
  var NEED = ['spr_player_idle', 'spr_player_run', 'spr_selectRecipes_stars', 'spr_bullet_boba', 'spr_bullet_boba_fire',
    'spr_bullet_boba_break', 'spr_bullet_boba_hit', 'spr_bullet_boba_bounce_front', 'spr_enemy_printer_idle',
    'spr_enemy_printer_attacked', 'spr_enemy_securityCamera_idle_0', 'spr_enemy_securityCamera_move',
    'spr_enemy_coffeeMachine_idle', 'spr_enemy_coffeeMachine_move', 'spr_boss_stamp', 'spr_boss_stamp_leftHand',
    'spr_boss_stamp_rightHand', 'spr_boss_stamp_shadow', 'spr_deadEffect', T.stamp];
  var MAX_BULLETS = 6, MAX_BOUNCES = 4, BOSS_AFTER = 6, BOSS_HP = 12;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function reduced() { return COB.reduced(); }

  // ------------------------------------------------------------------ setup
  function load() {
    SPR = COB.sprites;
    var files = NEED.map(function (n) { return COB.img(SPR[n].file).then(function (im) { imgs[n] = im; }); });
    files.push(COB.img(SPR.atlas_items.file).then(function (im) { imgs.atlas_items = im; }));
    return Promise.all(files).then(function () { ready = true; });
  }
  function resize() {
    vw = W.innerWidth; vh = W.innerHeight; dpr = W.devicePixelRatio || 1;
    S = vw >= 1100 ? 3 : 2;
    K = Math.max(1, Math.round(S * dpr));
    [canvas, starsC].forEach(function (c) {
      c.width = Math.round(vw * dpr); c.height = Math.round(vh * dpr);
      c.style.width = vw + 'px'; c.style.height = vh + 'px';
    });
    layoutStars();
    if (G) { G.bobo.x = Math.min(G.bobo.x, vw - 12 * S); }
  }
  function whiteOf(name) {
    if (whites[name]) return whites[name];
    var im = imgs[name], c = D.createElement('canvas'); c.width = im.width; c.height = im.height;
    var x = c.getContext('2d'); x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    return (whites[name] = c);
  }
  /* draw sprite frame with its origin at CSS point (x, y) */
  function spr(c, name, frame, x, y, o) {
    var m = SPR[name], im = (o && o.white) ? whiteOf(name) : imgs[name];
    if (!m || !im) return;
    // bullets + their effects are drawn at the sprite's own size (1 CSS px per sprite px): in the game the
    // pearl is scaled to an 8 px diameter (Dungeon_Bullet.csv), about a third of the world scale
    var k = (o && o.native) ? Math.max(1, Math.round(dpr)) : K * ((o && o.mul) || 1);
    frame = Math.floor(frame) % m.n;
    c.save();
    c.translate(Math.round(x * dpr), Math.round(y * dpr));
    if (o && o.rot) c.rotate(o.rot);
    if (o && o.flip) c.scale(-1, 1);
    if (o && o.alpha != null) c.globalAlpha = Math.max(0, Math.min(1, o.alpha));
    c.drawImage(im, frame * m.w, 0, m.w, m.h, -m.ox * k, -m.oy * k, m.w * k, m.h * k);
    c.restore();
  }
  function box(name, x, y, mul) {   // hit box of a sprite (union of frame alpha boxes) in CSS px
    var m = SPR[name], s = S * (mul || 1);
    return { l: x + (m.bbox[0] - m.ox) * s, t: y + (m.bbox[1] - m.oy) * s, r: x + (m.bbox[2] - m.ox) * s, b: y + (m.bbox[3] - m.oy) * s };
  }

  // ------------------------------------------------------------------ stars (behind the page)
  function layoutStars() {
    var n = Math.max(8, Math.min(28, Math.round(vw * vh / 60000)));
    stars = [];
    for (var i = 0; i < n; i++) stars.push({ x: Math.random() * vw, y: 56 + Math.random() * (vh - 56), f: Math.floor(Math.random() * 12) });
    starTick = -1;
    if (night && ready && reduced()) drawStars(0);
  }
  function drawStars(tick) {
    var m = SPR.spr_selectRecipes_stars, k = Math.max(1, Math.round(2 * dpr));
    sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.imageSmoothingEnabled = false;
    sctx.clearRect(0, 0, starsC.width, starsC.height);
    stars.forEach(function (s) {
      var f = (s.f + tick) % m.n;
      sctx.drawImage(imgs.spr_selectRecipes_stars, f * m.w, 0, m.w, m.h, Math.round(s.x * dpr), Math.round(s.y * dpr), m.w * k, m.h * k);
    });
  }

  // ------------------------------------------------------------------ night state
  function newNight() {
    var bx = COB.bobo.x() + 21 * COB.bobo.scale() / 2;
    G = {
      t: 0, kills: 0, collected: 0, spawnIn: 1.4, over: false,
      bobo: { x: bx || vw / 2, tx: bx || vw / 2, dir: 'down', moving: false, shootT: 0, anim: 0 },
      bullets: [], fx: [], mobs: [], drops: [], marks: [], boss: null, bossIn: -1, lastIcon: null
    };
    counter.hidden = false;
    setCounter();
  }
  function setCounter() {
    counterText.textContent = COB.fmt(T.dream_counter, { n: G.collected });
    var it = G.lastIcon && SPR.atlas_items.items[G.lastIcon];
    counterIcon.style.visibility = it ? 'visible' : 'hidden';
    if (it) counterIcon.style.cssText = '--ix:' + it.x + ';--iy:' + it.y + ';--iw:' + it.w + ';--ih:' + it.h + ';--s:2';
  }
  function fx(name, x, y, o) {
    if (G.fx.length > 40) G.fx.shift();
    var m = SPR[name];
    G.fx.push({ name: name, x: x, y: y, t: 0, fps: (o && o.fps) || m.fps, rot: o && o.rot, mul: o && o.mul,
      native: /^spr_bullet_/.test(name) });
  }

  // ------------------------------------------------------------------ input: tap blank page = shoot
  var BLOCK = 'a,button,input,select,textarea,label,summary,video,[role="button"],[contenteditable],#rnd,.hud,.wall-pop,.dream-counter,.lamp-float';
  COB.onTap.push(function (tap) {
    if (!night || !G || G.over || reduced() || tap.selecting) return;
    if (tap.target && tap.target.closest && tap.target.closest(BLOCK)) return;
    if (tap.type !== 'mouse') G.bobo.tx = tap.x;
    shoot(tap.x, tap.y);
  });
  D.addEventListener('pointermove', function (e) {
    if (night && G && e.pointerType === 'mouse') G.bobo.tx = e.clientX;
  }, { passive: true });

  function gun() { return { x: G.bobo.x, y: vh - 14 * S }; }
  function shoot(x, y) {
    var g = gun(), dx = x - g.x, dy = y - g.y, len = Math.hypot(dx, dy) || 1;
    var a = Math.atan2(dy, dx), sp = 210 * S;
    if (G.bullets.length >= MAX_BULLETS) { var old = G.bullets.shift(); fx('spr_bullet_boba_break', old.x, old.y); }
    var mx = g.x + dx / len * 8 * S, my = g.y + dy / len * 8 * S;
    G.bullets.push({ x: mx, y: my, vx: dx / len * sp, vy: dy / len * sp, bounces: 0, age: 0 });
    fx('spr_bullet_boba_fire', g.x + dx / len * 6 * S, g.y + dy / len * 6 * S, { rot: a, fps: 20 });
    var deg = a * 180 / Math.PI;
    G.bobo.dir = (deg > -135 && deg < -45) ? 'up' : (deg >= -45 && deg <= 45) ? 'right' : (deg > 45 && deg < 135) ? 'down' : 'left';
    G.bobo.shootT = 0.28;
    start();
  }

  // ------------------------------------------------------------------ update
  function update(dt) {
    G.t += dt;
    var b = G.bobo;
    // Bobo strolls after the pointer; plants his feet for a moment after each shot
    b.shootT = Math.max(0, b.shootT - dt);
    var dx = b.tx - b.x, sp = 40 * S;
    b.moving = b.shootT === 0 && Math.abs(dx) > 4;
    if (b.moving) { b.x += Math.sign(dx) * Math.min(Math.abs(dx), sp * dt); b.dir = dx < 0 ? 'left' : 'right'; }
    else if (b.shootT === 0 && b.dir !== 'down' && G.t - (b.idleSince || 0) > 1.2) b.dir = 'down';
    if (b.moving || b.shootT > 0) b.idleSince = G.t;
    b.x = Math.max(11 * S, Math.min(vw - 11 * S, b.x));
    b.anim += dt;

    // bullets: bounce off the viewport edges up to 4 times, then break
    for (var i = G.bullets.length - 1; i >= 0; i--) {
      var u = G.bullets[i], r = 11, hitWall = false;
      u.age += dt; u.x += u.vx * dt; u.y += u.vy * dt;
      if (u.x < r) { u.x = r; u.vx = Math.abs(u.vx); hitWall = true; }
      if (u.x > vw - r) { u.x = vw - r; u.vx = -Math.abs(u.vx); hitWall = true; }
      if (u.y < r + 56) { u.y = r + 56; u.vy = Math.abs(u.vy); hitWall = true; }
      if (u.y > vh - r) { u.y = vh - r; u.vy = -Math.abs(u.vy); hitWall = true; }
      if (hitWall) {
        u.bounces++;
        if (u.bounces > MAX_BOUNCES) { fx('spr_bullet_boba_break', u.x, u.y); G.bullets.splice(i, 1); continue; }
        fx('spr_bullet_boba_bounce_front', u.x, u.y, { fps: 20 });
      }
      if (u.age > 8) { fx('spr_bullet_boba_break', u.x, u.y); G.bullets.splice(i, 1); continue; }
      if (hitTest(u, r + 4)) { G.bullets.splice(i, 1); }
    }

    // monsters
    if (!G.boss && G.bossIn < 0 && G.kills < BOSS_AFTER) {
      G.spawnIn -= dt;
      var cap = vw < 720 ? 2 : 3;
      if (G.spawnIn <= 0) { if (G.mobs.length < cap) spawnMob(); G.spawnIn = rnd(2.2, 3.8); }
    }
    G.mobs.forEach(function (m) {
      var def = MONSTERS[m.type];
      m.anim += dt; m.flash = Math.max(0, m.flash - dt); m.hurt = Math.max(0, m.hurt - dt);
      if (m.pause > 0) { m.pause -= dt; if (m.pause <= 0) m.tx = rnd(0.1, 0.9) * vw; return; }
      var d = m.tx - m.x, v = def.speed * S * (m.entering ? 1.6 : 1);
      if (Math.abs(d) < 3) { m.entering = false; m.pause = rnd(0.6, 1.8); return; }
      m.x += Math.sign(d) * Math.min(Math.abs(d), v * dt);
    });

    // boss
    if (G.bossIn >= 0) { G.bossIn -= dt; if (G.bossIn < 0) spawnBoss(); }
    if (G.boss) updateBoss(dt);

    // flying ingredient icons -> counter
    var cr = counterIcon.getBoundingClientRect();
    var tx = cr.left + cr.width / 2 || 40, ty = cr.top + cr.height / 2 || vh - 30;
    for (i = G.drops.length - 1; i >= 0; i--) {
      var p = G.drops[i];
      p.t += dt;
      var q = Math.min(1, p.t / p.dur), e = q * q * (3 - 2 * q);
      var cx = (p.sx + tx) / 2, cy = Math.min(p.sy, ty) - 120;
      p.x = (1 - e) * (1 - e) * p.sx + 2 * (1 - e) * e * cx + e * e * tx;
      p.y = (1 - e) * (1 - e) * p.sy + 2 * (1 - e) * e * cy + e * e * ty;
      if (q >= 1) {
        G.drops.splice(i, 1); G.collected++; G.lastIcon = p.iid; setCounter();
        counter.classList.remove('bump'); void counter.offsetWidth; counter.classList.add('bump');
      }
    }
    // effects + stamp marks
    for (i = G.fx.length - 1; i >= 0; i--) { var f = G.fx[i]; f.t += dt; if (f.t * f.fps >= SPR[f.name].n) G.fx.splice(i, 1); }
    for (i = G.marks.length - 1; i >= 0; i--) {
      var mk = G.marks[i]; mk.t += dt;
      if (mk.breaking) { mk.bt += dt; if (mk.bt > 0.45) G.marks.splice(i, 1); }
      else if (mk.t > mk.life) G.marks.splice(i, 1);
    }
  }

  function hitTest(u, r) {
    for (var i = 0; i < G.mobs.length; i++) {
      var m = G.mobs[i], def = MONSTERS[m.type], y = m.y + (def.bob ? Math.sin(m.anim * 2.4 + m.seed) * 4 * S : 0);
      var bb = box(def.idle, m.x, y);
      if (u.x + r * 0.6 > bb.l && u.x - r * 0.6 < bb.r && u.y + r * 0.6 > bb.t && u.y - r * 0.6 < bb.b) {
        fx('spr_bullet_boba_hit', u.x, u.y, { rot: Math.atan2(u.vy, u.vx) + Math.PI, fps: 20 });
        m.hp--; m.flash = 0.12; m.x += Math.sign(u.vx) * 5 * S; if (def.hurt) m.hurt = SPR[def.hurt].n / SPR[def.hurt].fps;
        if (m.hp <= 0) kill(m, (bb.l + bb.r) / 2, (bb.t + bb.b) / 2);
        return true;
      }
    }
    var B = G.boss;
    if (B && B.state !== 'dead' && B.state !== 'fall') {
      var bb2 = box('spr_boss_stamp', B.x, B.y);
      if (u.x + r * 0.6 > bb2.l && u.x - r * 0.6 < bb2.r && u.y + r * 0.6 > bb2.t && u.y - r * 0.6 < bb2.b) {
        fx('spr_bullet_boba_hit', u.x, u.y, { rot: Math.atan2(u.vy, u.vx) + Math.PI, fps: 20 });
        B.hp--; B.flash = 0.12;
        if (B.hp <= 0) bossDown();
        return true;
      }
    }
    return false;
  }

  function spawnMob() {
    var types = Object.keys(MONSTERS), type = types[Math.floor(Math.random() * types.length)], def = MONSTERS[type];
    var left = Math.random() < 0.5, m = SPR[def.idle];
    var x = left ? -(m.w - m.ox) * S : vw + m.ox * S;
    var top = 56 + (m.oy - m.bbox[1]) * S + 8, bottom = vh - 34 * S;
    var y = Math.max(top, Math.min(bottom, rnd(def.zone[0], def.zone[1]) * vh));
    G.mobs.push({ type: type, x: x, y: y, tx: rnd(0.15, 0.85) * vw, hp: def.hp, flash: 0, hurt: 0, anim: Math.random(), pause: 0, entering: true, seed: Math.random() * 6 });
  }
  var ITEM_POOL = null;
  function kill(m, cx, cy) {
    G.mobs.splice(G.mobs.indexOf(m), 1);
    fx('spr_deadEffect', cx, cy + 10 * S, { mul: 2 });
    if (!ITEM_POOL) {
      ITEM_POOL = Object.keys(COB.data.ingredients).filter(function (id) { return /^spr_item_ingredient_/.test(COB.data.ingredients[id].icon); });
    }
    var iid = ITEM_POOL[Math.floor(Math.random() * ITEM_POOL.length)];
    if (G.drops.length < 10) G.drops.push({ iid: iid, sx: cx, sy: cy, x: cx, y: cy, t: 0, dur: 0.75 });
    G.kills++;
    var r = COB.unlockRandomDream && COB.unlockRandomDream();
    if (r) COB.toast(COB.fmt(T.dream_recipe, { name: COB.recipeName(r) }));
    if (G.kills >= BOSS_AFTER && !G.boss && G.bossIn < 0) G.bossIn = 1.4;
  }

  // ------------------------------------------------------------------ Mr. Stamp
  function spawnBoss() {
    var ty = Math.max(56 + 86 * S, vh * 0.36);
    G.boss = { x: vw / 2, y: -40 * S, ty: ty, vy: 0, hp: BOSS_HP, flash: 0, state: 'fall', t: 0, next: 2.2, anim: 0, hx: vw / 2, sx: 0, sy: 0 };
  }
  function updateBoss(dt) {
    var B = G.boss;
    B.t += dt; B.anim += dt; B.flash = Math.max(0, B.flash - dt);
    var minY = 56 + 80 * S, maxY = Math.max(minY, vh - 60 * S), minX = 55 * S, maxX = Math.max(minX, vw - 55 * S);
    if (B.state === 'fall') {
      B.vy += 1400 * dt; B.y += B.vy * dt;
      if (B.y >= B.ty) { B.y = B.ty; B.state = 'idle'; B.t = 0; fx('spr_deadEffect', B.x - 30 * S, B.y + 4 * S, { mul: 2 }); fx('spr_deadEffect', B.x + 30 * S, B.y + 4 * S, { mul: 2 }); }
    } else if (B.state === 'idle') {
      if (Math.abs(B.hx - B.x) < 4) B.hx = rnd(minX, maxX);
      B.x += Math.sign(B.hx - B.x) * Math.min(Math.abs(B.hx - B.x), 22 * S * dt);
      B.next -= dt;
      if (B.next <= 0) {   // pick a spot, hop up, slam down, leave a stamp
        B.state = 'rise'; B.t = 0; B.sx = B.x; B.sy = B.y;
        B.tx = rnd(minX, maxX); B.tyy = rnd(minY, maxY);
      }
    } else if (B.state === 'rise') {
      var q = Math.min(1, B.t / 0.3); B.y = B.sy - Math.sin(q * Math.PI / 2) * 18 * S;
      if (q >= 1) { B.state = 'move'; B.t = 0; B.sy = B.y; }
    } else if (B.state === 'move') {
      var e = Math.min(1, B.t / 0.32), ee = e * e;
      B.x = B.sx + (B.tx - B.sx) * e; B.y = B.sy + (B.tyy - B.sy) * ee;
      if (e >= 1) {
        B.state = 'idle'; B.t = 0; B.next = rnd(2.6, 3.6); B.hx = B.x;
        stamp(B.x, B.y);
      }
    }
  }
  function stamp(x, y) {
    if (G.marks.length >= 8) G.marks.shift();
    G.marks.push({ x: x, docY: y + W.scrollY - 2 * S, t: 0, life: 9, breaking: false, bt: 0 });
    fx('spr_deadEffect', x - 36 * S, y, { mul: 2 }); fx('spr_deadEffect', x + 36 * S, y, { mul: 2 });
  }
  function bossDown() {
    var B = G.boss; B.state = 'dead';
    for (var i = 0; i < 6; i++) fx('spr_deadEffect', B.x + rnd(-40, 40) * S, B.y + rnd(-50, 10) * S, { mul: 3 });
    G.marks.forEach(function (mk) { mk.breaking = true; mk.bt = 0; fx('spr_deadEffect', mk.x, mk.docY - W.scrollY + 14 * S, { mul: 3 }); });
    G.boss = null; G.over = true;
    G.mobs.forEach(function (m) { fx('spr_deadEffect', m.x, m.y, { mul: 2 }); }); G.mobs = [];
    var n = G.collected + G.drops.length;
    COB.toast(COB.fmt(T.dream_end, { n: n }));
    setTimeout(function () {
      if (!night) return;
      COB.unlockAllDream && COB.unlockAllDream();
      COB.setTime('day', { reason: 'boss' });
    }, 1900);
  }

  // ------------------------------------------------------------------ render
  var DIRS = { idle: { right: 0, up: 5, left: 10, down: 15 }, run: { right: 0, up: 8, left: 16, down: 24 } };
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    var sy = W.scrollY;
    G.marks.forEach(function (mk) {
      var y = mk.docY - sy; if (y < -200 || y > vh + 200) return;
      var a = mk.breaking ? 1 - mk.bt / 0.45 : (mk.t < mk.life - 6 ? 1 : (mk.life - mk.t) / 6);
      spr(ctx, T.stamp, 0, mk.x, y, { alpha: a * 0.9 });
    });
    G.mobs.forEach(function (m) {
      var def = MONSTERS[m.type], y = m.y + (def.bob ? Math.sin(m.anim * 2.4 + m.seed) * 4 * S : 0);
      var moving = m.pause <= 0, name = m.hurt > 0 && def.hurt ? def.hurt : (moving ? def.move : def.idle);
      var meta = SPR[name], fr = m.hurt > 0 && def.hurt ? (SPR[def.hurt].n - 1 - Math.floor(m.hurt * meta.fps)) : m.anim * meta.fps;
      spr(ctx, name, Math.max(0, fr), m.x, y, { white: m.flash > 0 });
    });
    var B = G.boss;
    if (B) {
      var bob = Math.sin(B.anim * 3) * 2 * S;
      if (B.state !== 'fall') spr(ctx, 'spr_boss_stamp_shadow', 0, B.x, B.y + 6 * S + (B.state === 'rise' || B.state === 'move' ? (B.sy - B.y) * 0 : 0), { alpha: 0.5 });
      spr(ctx, 'spr_boss_stamp_leftHand', 0, B.x - 52 * S, B.y - 8 * S + bob, { white: B.flash > 0 });
      spr(ctx, 'spr_boss_stamp_rightHand', 0, B.x + 52 * S, B.y - 8 * S - bob, { white: B.flash > 0 });
      spr(ctx, 'spr_boss_stamp', 0, B.x, B.y, { white: B.flash > 0 });
    }
    G.bullets.forEach(function (u) { spr(ctx, 'spr_bullet_boba', 0, u.x, u.y, { native: true }); });
    G.fx.forEach(function (f) { spr(ctx, f.name, f.t * f.fps, f.x, f.y, { rot: f.rot, mul: f.mul, native: f.native }); });
    // Bobo
    var b = G.bobo, run = b.moving, set = run ? 'run' : 'idle', m = SPR[run ? 'spr_player_run' : 'spr_player_idle'];
    var cnt = run ? 8 : 5;
    spr(ctx, run ? 'spr_player_run' : 'spr_player_idle', DIRS[set][b.dir] + Math.floor(b.anim * m.fps) % cnt, b.x, vh - 1);
    // flying icons
    var ia = SPR.atlas_items, im = imgs.atlas_items;
    G.drops.forEach(function (p) {
      var it = ia.items[p.iid], kk = K;
      ctx.drawImage(im, it.x, it.y, it.w, it.h, Math.round(p.x * dpr - it.w * kk / 2), Math.round(p.y * dpr - it.h * kk / 2), it.w * kk, it.h * kk);
    });
  }

  // ------------------------------------------------------------------ loop control
  function frame(t) {
    raf = 0;
    if (!night || D.hidden || !G) return;
    var dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
    update(dt);
    render();
    var tick = Math.floor(t / 100);
    if (tick !== starTick) { starTick = tick; drawStars(tick); }
    raf = W.requestAnimationFrame(frame);
  }
  function start() { if (!raf && night && !D.hidden && ready && !reduced()) { last = performance.now(); raf = W.requestAnimationFrame(frame); } }
  function stop() { if (raf) W.cancelAnimationFrame(raf); raf = 0; }

  function setNight(on) {
    night = on;
    if (!ready) return;
    if (on) {
      resize();
      if (reduced()) { G = null; counter.hidden = true; drawStars(0); return; }
      newNight();
      start();
    } else {
      stop();
      if (G) COB.bobo.set(Math.round(G.bobo.x - 21 * COB.bobo.scale() / 2));
      G = null;
      counter.hidden = true;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.clearRect(0, 0, starsC.width, starsC.height);
    }
  }

  // read-only peek for tools/shoot.mjs (headless play-test); not used by the page itself
  COB.debug = { dream: function () { return G && { mobs: G.mobs.map(function (m) { return { type: m.type, x: m.x, y: m.y, hp: m.hp, box: box(MONSTERS[m.type].idle, m.x, m.y) }; }),
    boss: G.boss && { x: G.boss.x, y: G.boss.y, hp: G.boss.hp, state: G.boss.state, box: box('spr_boss_stamp', G.boss.x, G.boss.y) },
    kills: G.kills, collected: G.collected, bullets: G.bullets.length, marks: G.marks.length, bobo: G.bobo.x, over: G.over }; } };

  W.addEventListener('cob:time', function (e) { setNight(e.detail.time === 'night'); });
  D.addEventListener('visibilitychange', function () { if (D.hidden) stop(); else start(); });
  var rt = 0;
  W.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (night) { resize(); if (reduced()) drawStars(0); } }, 100); });
  function boot() {
    load().then(function () { setNight(COB.isNight()); });
  }
  if (COB.ready) boot(); else W.addEventListener('cob:ready', boot, { once: true });
})();
