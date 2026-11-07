/* FreeCell - vanilla JS, no dependencies. Shared by the ja and ko pages by Kaloo Dinaz. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var I18N = {};
  try { I18N = JSON.parse($('#i18n').textContent); } catch (e) {}
  var BASE = new URL(root.getAttribute('data-assets') || './', document.baseURI).href;

  /*  storage */
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  // boolean options (defaults); hints and safe auto-play are off by default
  var opts = { sound: true, auto: true, hint: false, safe: false, stats: true, c4: false, swap: false, anim: true, bg: 'emerald' };
  var BOOL_OPTS = ['sound', 'auto', 'hint', 'safe', 'stats', 'c4', 'swap', 'anim'];
  (function () {
    var o = store.get('fc.opts');
    if (o && typeof o === 'object') BOOL_OPTS.forEach(function (k) { if (typeof o[k] === 'boolean') opts[k] = o[k]; });
    try { var b = localStorage.getItem('fc.bg'); if (/^(emerald|royal|wine|slate)$/.test(b)) opts.bg = b; } catch (e) {}
  })();

  /*  rules */
  // card id = suit*13 + rank0 ; suits: 0 club, 1 diamond, 2 heart, 3 spade
  var RANK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var FACE_NAME = ['', '', '', '', '', '', '', '', '', '', 'jack', 'queen', 'king'];
  var SUIT_NAME = ['club', 'diamond', 'heart', 'spade'];
  var rank = function (id) { return id % 13; };
  var suit = function (id) { return (id / 13) | 0; };
  var isRed = function (id) { var s = suit(id); return s === 1 || s === 2; };
  var fits = function (c, onto) { return rank(onto) === rank(c) + 1 && isRed(c) !== isRed(onto); };
  function isSeq(a) {
    for (var i = 1; i < a.length; i++) if (!fits(a[i], a[i - 1])) return false;
    return true;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function newState(seed) {
    var rnd = mulberry32(seed), deck = [], i, j, t;
    for (i = 0; i < 52; i++) deck.push(i);
    for (i = 51; i > 0; i--) { j = Math.floor(rnd() * (i + 1)); t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    var col = [[], [], [], [], [], [], [], []];
    for (i = 0; i < 52; i++) col[i % 8].push(deck[i]);
    return { col: col, cell: [-1, -1, -1, -1], found: [[], [], [], []], moves: 0, secs: 0, seed: seed, won: false };
  }
  function validState(s) {
    try {
      if (!s || s.col.length !== 8 || s.cell.length !== 4 || s.found.length !== 4) return false;
      var seen = {}, n = 0, add = function (id) { if (id < 0) return; if (id > 51 || seen[id]) throw 0; seen[id] = 1; n++; };
      s.col.forEach(function (c) { c.forEach(add); });
      s.cell.forEach(add);
      s.found.forEach(function (c) { c.forEach(add); });
      s.moves = +s.moves || 0; s.secs = +s.secs || 0; s.seed = +s.seed || 1;
      return n === 52 && !s.won;
    } catch (e) { return false; }
  }

  var S, hist = [];

  function freeCells() { return S.cell.filter(function (c) { return c < 0; }).length; }
  function emptyCols(skip) { var n = 0; S.col.forEach(function (c, i) { if (!c.length && i !== skip) n++; }); return n; }
  // classic supermove limit: (free cells + 1) * 2^(empty columns); the target column doesn't count if it is empty
  function maxMove(dstCol) {
    var skip = (dstCol >= 0 && S.col[dstCol] && !S.col[dstCol].length) ? dstCol : -1;
    return (freeCells() + 1) * Math.pow(2, emptyCols(skip));
  }
  function foundSlot(id) {
    var s = suit(id), r = rank(id), i, f;
    for (i = 0; i < 4; i++) {
      f = S.found[i];
      if (f.length && suit(f[0]) === s) return rank(f[f.length - 1]) === r - 1 ? i : -1;
    }
    if (r !== 0) return -1;
    for (i = 0; i < 4; i++) if (!S.found[i].length) return i;
    return -1;
  }
  function locate(id) {
    var i, idx;
    for (i = 0; i < 8; i++) { idx = S.col[i].indexOf(id); if (idx >= 0) return { k: 'col', i: i, idx: idx }; }
    idx = S.cell.indexOf(id); if (idx >= 0) return { k: 'cell', i: idx, idx: 0 };
    for (i = 0; i < 4; i++) { idx = S.found[i].indexOf(id); if (idx >= 0) return { k: 'found', i: i, idx: idx }; }
    return null;
  }
  function dragGroup(id) {
    var L = locate(id);
    if (!L || L.k === 'found') return null;
    if (L.k === 'cell') return { src: { k: 'cell', i: L.i }, ids: [id] };
    var ids = S.col[L.i].slice(L.idx);
    return isSeq(ids) ? { src: { k: 'col', i: L.i }, ids: ids } : null;
  }
  // returns '' when the move is legal, otherwise a reason key
  function why(ids, dst, src) {
    var n = ids.length, f = ids[0];
    if (dst.k === 'cell') return n > 1 ? 'single' : (S.cell[dst.i] >= 0 ? 'occupied' : '');
    if (dst.k === 'found') return n > 1 ? 'single' : (foundSlot(f) >= 0 ? '' : 'nofit');
    if (src.k === 'col' && src.i === dst.i) return 'same';
    var d = S.col[dst.i];
    if (d.length && !fits(f, d[d.length - 1])) return 'nofit';
    if (n > maxMove(dst.i)) return 'limit';
    return '';
  }
  function applyMove(src, n, dst) {
    var fi = dst.k === 'found' ? foundSlot((src.k === 'col' ? S.col[src.i].slice(-n) : [S.cell[src.i]])[0]) : -1;
    var ids;
    if (src.k === 'col') ids = S.col[src.i].splice(-n, n);
    else { ids = [S.cell[src.i]]; S.cell[src.i] = -1; }
    if (dst.k === 'col') S.col[dst.i] = S.col[dst.i].concat(ids);
    else if (dst.k === 'cell') S.cell[dst.i] = ids[0];
    else S.found[fi].push(ids[0]);
  }
  function snap() { return JSON.stringify({ col: S.col, cell: S.cell, found: S.found, moves: S.moves }); }
  function foundCount() { return S.found.reduce(function (a, f) { return a + f.length; }, 0); }
  // every column already descends in rank => the game is guaranteed to finish
  function canAutoFinish() {
    return S.col.every(function (c) {
      for (var i = 1; i < c.length; i++) if (rank(c[i]) > rank(c[i - 1])) return false;
      return true;
    });
  }

  /*  DOM refs */
  var table = $('#table'), colsEl = $('#cols');
  var colEls = $$('.col'), cellEls = $$('.slot[data-k=cell]'), foundEls = $$('.slot[data-k=found]');
  var toastEl = $('#toast');
  var els = [];
  var M = { ch: 140, H: 560 };
  var busy = false, sel = -1, running = false, tick = null, gen = 0;
  var sysReduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var reduceMotion = sysReduce || !opts.anim;

  function fmt(t, p) { return String(t).replace(/\{(\w+)\}/g, function (_, k) { return p && p[k] != null ? p[k] : ''; }); }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtTime(s) { var h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0; return (h ? h + ':' + pad2(m) : m) + ':' + pad2(s % 60); }
  function cardLabel(id) {
    var r = (I18N.ranks || RANK)[rank(id)], s = (I18N.suits || SUIT_NAME)[suit(id)];
    return fmt(I18N.card || '{s} {r}', { r: r, s: s });
  }

  /*  build cards */
  // pip layouts (x,y in % of the pip area); y > 50 pips are drawn upside down
  var L_ = 20, C_ = 50, R_ = 80;
  var PIPS = {
    1: [[C_, 0], [C_, 100]],
    2: [[C_, 0], [C_, 50], [C_, 100]],
    3: [[L_, 0], [R_, 0], [L_, 100], [R_, 100]],
    4: [[L_, 0], [R_, 0], [C_, 50], [L_, 100], [R_, 100]],
    5: [[L_, 0], [R_, 0], [L_, 50], [R_, 50], [L_, 100], [R_, 100]],
    6: [[L_, 0], [R_, 0], [L_, 50], [R_, 50], [L_, 100], [R_, 100], [C_, 25]],
    7: [[L_, 0], [R_, 0], [L_, 50], [R_, 50], [L_, 100], [R_, 100], [C_, 25], [C_, 75]],
    8: [[L_, 0], [R_, 0], [L_, 33], [R_, 33], [L_, 67], [R_, 67], [L_, 100], [R_, 100], [C_, 50]],
    9: [[L_, 0], [R_, 0], [L_, 33], [R_, 33], [L_, 67], [R_, 67], [L_, 100], [R_, 100], [C_, 17], [C_, 83]]
  };
  function pipsHtml(r, su) {
    var p = PIPS[r];
    if (!p) return '';
    var h = '<span class="pips">';
    for (var i = 0; i < p.length; i++)
      h += '<span class="pp s' + su + (r >= 8 ? ' sm' : '') + (p[i][1] > 50 ? ' d' : '') + '" style="left:' + p[i][0] + '%;top:' + p[i][1] + '%"></span>';
    return h + '</span>';
  }
  function buildCards() {
    var frag = document.createDocumentFragment();
    for (var id = 0; id < 52; id++) {
      var r = rank(id), s = suit(id), el = document.createElement('div');
      el.className = 'card' + (isRed(id) ? ' r' : '') + ' u' + s + (r >= 10 ? ' f' : (r > 0 ? ' n' : ''));
      el.setAttribute('data-id', id);
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', cardLabel(id));
      var corner = RANK[r] + '<i class="s' + s + '"></i>';
      el.innerHTML = '<b class="cn">' + corner + '</b><b class="cn b">' + corner + '</b><span class="pip s' + s + '"></span>' + pipsHtml(r, s) +
        (r >= 10 ? '<img class="face" alt="" width="164" height="264" loading="lazy" decoding="async" src="' +
          BASE + 'img/faces/face-' + FACE_NAME[r] + '-' + SUIT_NAME[s] + '.webp">' : '');
      els.push(el);
      frag.appendChild(el);
    }
    colEls[0].appendChild(frag);
  }

  /*  render */
  function measure() {
    M.ch = foundEls[0].offsetHeight || M.ch;
    M.H = colEls[0].clientHeight || M.H;
  }
  function setOffsets() {
    S.col.forEach(function (c, i) {
      var off = M.ch * 0.26, n = c.length;
      if (n > 1) off = Math.max(M.ch * 0.13, Math.min(off, (M.H - M.ch) / (n - 1)));
      colEls[i].style.setProperty('--off', off.toFixed(2) + 'px');
    });
  }
  function place() {
    var put = function (cont, ids) {
      for (var i = 0; i < ids.length; i++) {
        var el = els[ids[i]];
        if (el.parentNode !== cont || cont.children[i] !== el) cont.insertBefore(el, cont.children[i] || null);
        el.style.setProperty('--i', i);
      }
    };
    S.col.forEach(function (c, i) { put(colEls[i], c); });
    S.cell.forEach(function (c, i) { put(cellEls[i], c >= 0 ? [c] : []); });
    S.found.forEach(function (c, i) { put(foundEls[i], c); });
  }
  function rects() {
    var out = [];
    for (var i = 0; i < 52; i++) { var r = els[i].getBoundingClientRect(); out.push({ x: r.left, y: r.top }); }
    return out;
  }
  function clearDragStyles() {
    for (var i = 0; i < 52; i++) {
      var el = els[i];
      if (el.classList.contains('drag')) { el.classList.remove('drag'); el.style.transform = ''; }
    }
  }
  function flip(first, dur, stagger) {
    if (reduceMotion || !first) return;
    var moved = [], i, el, r, dx, dy;
    for (i = 0; i < 52; i++) {
      el = els[i]; r = el.getBoundingClientRect();
      dx = first[i].x - r.left; dy = first[i].y - r.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.style.transition = 'none';
      el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      el.style.zIndex = 500;
      moved.push(el);
    }
    if (!moved.length) return;
    void table.offsetWidth; // commit start positions
    moved.forEach(function (el, k) {
      var delay = stagger ? k * stagger : 0;
      el._t = (el._t || 0) + 1;
      var t = el._t;
      el.style.transition = 'transform ' + dur + 'ms cubic-bezier(.2,.7,.3,1) ' + delay + 'ms';
      el.style.transform = '';
      setTimeout(function () { if (el._t === t) { el.style.transition = ''; el.style.zIndex = ''; } }, dur + delay + 60);
    });
  }
  function render(anim, first) {
    first = first || (anim && !reduceMotion ? rects() : null);
    clearDragStyles();
    measure();
    place();
    setOffsets();
    if (first) flip(first, 180, 0);
    updateUI();
  }
  function updateUI() {
    $('#mv').textContent = S.moves;
    $('#tm').textContent = fmtTime(S.secs);
    $('#bUndo').disabled = !hist.length || busy;
    $('#bHint').disabled = busy || S.won;
    var d = $('#dealNo'); if (d) d.textContent = S.seed;
    $$('.card.sel').forEach(function (e) { e.classList.remove('sel'); });
    if (sel >= 0) {
      var g = dragGroup(sel);
      if (g) g.ids.forEach(function (id) { els[id].classList.add('sel'); }); else sel = -1;
    }
  }

  /*  feedback */
  var toastT;
  function toast(key, p) {
    var msg = (I18N.toast || {})[key];
    if (!msg) return;
    toastEl.textContent = fmt(msg, p);
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 1800);
  }
  function shake(ids) {
    ids.forEach(function (id) {
      var e = els[id]; e.classList.remove('shake'); void e.offsetWidth; e.classList.add('shake');
      setTimeout(function () { e.classList.remove('shake'); }, 320);
    });
  }

  /*  audio (lazy) */
  var ac = null, buf = {}, loading = {};
  var SOUND_FILES = { flip: 'cardFlip.mp3', shuffle: 'cardShuffle.mp3', cheer: 'crowdCheer.mp3' };
  function loadSound(name) {
    if (!ac || buf[name] || loading[name]) return;
    loading[name] = 1;
    fetch(BASE + 'sounds/' + SOUND_FILES[name]).then(function (r) { return r.arrayBuffer(); })
      .then(function (b) { return new Promise(function (ok, no) { ac.decodeAudioData(b, ok, no); }); })
      .then(function (d) { buf[name] = d; })
      .catch(function () { loading[name] = 0; });
  }
  function unlockAudio() {
    if (!opts.sound) return;
    try {
      if (!ac) {
        var C = window.AudioContext || window.webkitAudioContext;
        if (!C) return;
        ac = new C();
        loadSound('flip'); loadSound('shuffle');
      }
      if (ac.state === 'suspended') ac.resume();
    } catch (e) { ac = null; }
  }
  function sound(name, vol) {
    if (!opts.sound || !ac || !buf[name]) return;
    try {
      var s = ac.createBufferSource(), g = ac.createGain();
      s.buffer = buf[name]; g.gain.value = vol || 0.7;
      s.connect(g); g.connect(ac.destination); s.start(0);
    } catch (e) {}
  }

  /*  game flow */
  function startTimer() {
    if (running) return;
    running = true;
    clearInterval(tick);
    tick = setInterval(function () {
      if (document.hidden || S.won || anyDialog()) return;
      S.secs++;
      $('#tm').textContent = fmtTime(S.secs);
    }, 1000);
  }
  function stopTimer() { running = false; clearInterval(tick); }

  function save() {
    if (S.won) { store.del('fc.game'); return; }
    store.set('fc.game', { v: 1, S: S, hist: hist.slice(-200) });
  }

  function newGame(seed, animate) {
    stopTimer();
    gen++; clearTimeout(stuckT); clearHint(); lastMove = null;
    busy = false; sel = -1; hist = [];
    S = newState(seed == null ? 1 + Math.floor(Math.random() * 1000000) : seed);
    for (var i = 0; i < 52; i++) { var e = els[i]; e._t = (e._t || 0) + 1; e.style.transition = ''; e.style.transform = ''; e.style.zIndex = ''; e.classList.remove('drag', 'sel'); }
    var first = null;
    if (animate && !reduceMotion) {
      measure();
      var tr = table.getBoundingClientRect(), cw = foundEls[0].offsetWidth;
      first = [];
      for (var k = 0; k < 52; k++) first.push({ x: tr.left + tr.width / 2 - cw / 2, y: tr.top - M.ch * 1.3 });
      render(false, null);
      flipDeal(first);
      sound('shuffle', 0.6);
    } else render(false);
    save();
  }
  // deal animation: same as flip, but staggered card by card
  function flipDeal(first) {
    var moved = [], i, el, r;
    for (i = 0; i < 52; i++) {
      el = els[i]; r = el.getBoundingClientRect();
      el.style.transition = 'none';
      el.style.transform = 'translate(' + (first[i].x - r.left) + 'px,' + (first[i].y - r.top) + 'px)';
      el.style.zIndex = 500;
      moved.push(el);
    }
    void table.offsetWidth;
    // deal in the same order as a real deal: row by row
    moved.forEach(function (el, k) {
      var id = +el.getAttribute('data-id'), L = locate(id), order = L.idx * 8 + L.i;
      el._t = (el._t || 0) + 1;
      var t = el._t;
      el.style.transition = 'transform 320ms cubic-bezier(.2,.7,.3,1) ' + (order * 14) + 'ms';
      el.style.transform = '';
      setTimeout(function () { if (el._t === t) { el.style.transition = ''; el.style.zIndex = ''; } }, 320 + order * 14 + 80);
    });
  }

  function tryMove(src, ids, dst, fromDrag) {
    if (busy || S.won) { if (fromDrag) render(true); return false; }
    var r = why(ids, dst, src);
    if (r) {
      if (r !== 'same') { toast(r, { n: maxMove(dst.i) }); if (!fromDrag) shake(ids); }
      if (fromDrag) render(true);
      return false;
    }
    clearHint();
    lastMove = { id: ids[0], from: { k: src.k, i: src.i } };
    hist.push(snap());
    if (hist.length > 300) hist.shift();
    var first = rects();
    applyMove(src, ids.length, dst);
    S.moves++;
    sel = -1;
    startTimer();
    sound('flip');
    render(true, first);
    afterMove();
    return true;
  }

  function afterMove() {
    save();
    var n = foundCount();
    if (n === 52) { win(); return; }
    if (n === 30) loadSound('cheer');
    if (opts.safe && nextSafe()) { safePlay(); return; }
    settle();
  }
  function settle() {
    if (S.won || busy) return;
    if (foundCount() === 52) { win(); return; }
    if (opts.auto && canAutoFinish()) { autoFinish(); return; }
    checkStuck();
  }
  // exposed cards: top of every column, then the free cells
  function exposed(i) {
    if (i < 8) { var c = S.col[i]; return c.length ? { id: c[c.length - 1], src: { k: 'col', i: i } } : null; }
    var id = S.cell[i - 8];
    return id >= 0 ? { id: id, src: { k: 'cell', i: i - 8 } } : null;
  }
  function foundCountOf(su) {
    for (var i = 0; i < 4; i++) if (S.found[i].length && suit(S.found[i][0]) === su) return S.found[i].length;
    return 0;
  }
  // a card is "safe" to send up when no card still in play could need it as a base
  function isSafe(id) {
    var r = rank(id);
    if (r <= 1) return true;
    var a = isRed(id) ? 0 : 1, b = isRed(id) ? 3 : 2; // the two opposite-colour suits
    return Math.min(foundCountOf(a), foundCountOf(b)) >= r;
  }
  function nextSafe() {
    for (var i = 0; i < 12; i++) {
      var x = exposed(i);
      if (!x) continue;
      var fi = foundSlot(x.id);
      if (fi >= 0 && isSafe(x.id)) return { src: x.src, fi: fi };
    }
    return null;
  }
  function safePlay() {
    var g = gen;
    busy = true; updateUI();
    (function step() {
      if (g !== gen) return;
      var m = nextSafe();
      if (!m) { busy = false; updateUI(); settle(); return; }
      var first = rects();
      applyMove(m.src, 1, { k: 'found', i: m.fi });
      S.moves++;
      sound('flip', 0.5);
      render(true, first);
      save();
      if (foundCount() === 52) { busy = false; win(); return; }
      setTimeout(step, reduceMotion ? 0 : 130);
    })();
  }

  /*  hints (optional) */
  var hintIdx = 0, hintKey = '', hintT, lastMove = null;
  function clearHint() {
    clearTimeout(hintT);
    $$('.hint,.hintdst').forEach(function (e) { e.classList.remove('hint', 'hintdst'); });
  }
  function colTop(j) { var c = S.col[j]; return c.length ? c[c.length - 1] : -1; }
  // 0 = useless, 1 = fits on a column, 2 = can go to a foundation
  function usefulCard(card, skipCol) {
    if (foundSlot(card) >= 0) return 2;
    for (var j = 0; j < 8; j++) if (j !== skipCol && S.col[j].length && fits(card, colTop(j))) return 1;
    return 0;
  }
  function scoreMove(src, ids, dst) {
    var n = ids.length, col = src.k === 'col' ? S.col[src.i] : null;
    if (lastMove && lastMove.id === ids[0] && lastMove.from.k === dst.k && lastMove.from.i === dst.i) return -1; // don't undo the last move
    var whole = !!col && col.length === n;
    var below = col && col.length > n ? col[col.length - n - 1] : -1;
    var u = below >= 0 ? usefulCard(below, src.i) : 0;
    if (dst.k === 'found') return 100 + u * 3;
    if (dst.k === 'cell') return u ? 10 + u * 12 : 2;
    if (!S.col[dst.i].length) { // empty column
      if (whole) return -1;
      return 6 + u * 22 + (src.k === 'cell' ? 14 : 0);
    }
    return 40 + n * 3 + (whole ? 25 : 0) + u * 15 + (src.k === 'cell' ? 20 : 0);
  }
  function listMoves() {
    var out = [], srcs = [], i, j, idx, ids;
    for (i = 0; i < 8; i++) {
      for (idx = S.col[i].length - 1; idx >= 0; idx--) {
        ids = S.col[i].slice(idx);
        if (!isSeq(ids)) break;
        srcs.push({ src: { k: 'col', i: i }, ids: ids });
      }
    }
    for (i = 0; i < 4; i++) if (S.cell[i] >= 0) srcs.push({ src: { k: 'cell', i: i }, ids: [S.cell[i]] });
    srcs.forEach(function (m) {
      var dsts = [], emptySeen = false, fi, ci;
      if (m.ids.length === 1) {
        fi = foundSlot(m.ids[0]);
        if (fi >= 0) dsts.push({ k: 'found', i: fi });
        ci = S.cell.indexOf(-1);
        if (ci >= 0 && m.src.k === 'col') dsts.push({ k: 'cell', i: ci });
      }
      for (j = 0; j < 8; j++) {
        if (m.src.k === 'col' && m.src.i === j) continue;
        if (!S.col[j].length) { if (emptySeen) continue; emptySeen = true; } // all empty columns are equivalent
        if (why(m.ids, { k: 'col', i: j }, m.src) === '') dsts.push({ k: 'col', i: j });
      }
      dsts.forEach(function (d) {
        var sc = scoreMove(m.src, m.ids, d);
        if (sc > 0) out.push({ src: m.src, ids: m.ids, dst: d, score: sc });
      });
    });
    // never suggest a move that leads back to a position already seen in this game (avoids hint loops)
    var seen = {};
    seen[posKey(S)] = 1;
    hist.forEach(function (h) { try { seen[posKey(JSON.parse(h))] = 1; } catch (e) {} });
    var keep = JSON.stringify({ col: S.col, cell: S.cell, found: S.found });
    out = out.filter(function (m) {
      var k;
      applyMove(m.src, m.ids.length, m.dst);
      k = posKey(S);
      var r = JSON.parse(keep); S.col = r.col; S.cell = r.cell; S.found = r.found;
      return !seen[k];
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }
  // order-independent key of a position (free cells are interchangeable)
  function posKey(st) {
    return st.col.map(function (c) { return c.join(','); }).join('|') + '#' + st.cell.filter(function (x) { return x >= 0; }).sort(function (a, b) { return a - b; }).join(',') + '#' +
      st.found.map(function (f) { return f.length ? suit(f[0]) + ':' + f.length : ''; }).sort().join(',');
  }
  function showHint() {
    if (busy || S.won) return;
    clearHint();
    var key = snap();
    if (key !== hintKey) { hintKey = key; hintIdx = 0; }
    var mv = listMoves();
    if (!mv.length) { toast('nohint'); return; }
    var m = mv[hintIdx % Math.min(mv.length, 3)]; // pressing again cycles through the best few
    hintIdx++;
    m.ids.forEach(function (id) { els[id].classList.add('hint'); });
    var el = m.dst.k === 'col' ? colEls[m.dst.i] : m.dst.k === 'cell' ? cellEls[m.dst.i] : foundEls[m.dst.i];
    el.classList.add('hintdst');
    if (m.dst.k === 'col' && S.col[m.dst.i].length) els[colTop(m.dst.i)].classList.add('hintdst');
    toast('hint', { c: cardLabel(m.ids[0]) });
    hintT = setTimeout(clearHint, 3200);
  }
  // no legal move at all: all cells full, no empty column, and no top card fits anywhere
  function isStuck() {
    if (freeCells() > 0 || emptyCols(-1) > 0) return false;
    var list = [], i, j, x, top;
    for (i = 0; i < 8; i++) list.push({ id: S.col[i][S.col[i].length - 1], c: i });
    for (i = 0; i < 4; i++) list.push({ id: S.cell[i], c: -1 });
    for (i = 0; i < list.length; i++) {
      x = list[i];
      if (foundSlot(x.id) >= 0) return false;
      for (j = 0; j < 8; j++) {
        if (j === x.c) continue;
        top = S.col[j][S.col[j].length - 1];
        if (fits(x.id, top)) return false;
      }
    }
    return true;
  }
  var stuckT;
  function anyDialog() { return allDialogs().some(function (d) { return d.open; }); }
  function checkStuck() {
    clearTimeout(stuckT);
    if (S.won || busy || !isStuck()) return;
    stuckT = setTimeout(function () { if (!S.won && !busy && isStuck()) openDlg($('#dlgStuck')); }, reduceMotion ? 0 : 450);
  }

  function autoFinish() {
    var g = gen;
    busy = true; updateUI();
    (function step() {
      if (g !== gen) return; // a new game was started meanwhile
      var i, id, fi, src;
      for (i = 0; i < 12; i++) {
        if (i < 8) { var c = S.col[i]; if (!c.length) continue; id = c[c.length - 1]; src = { k: 'col', i: i }; }
        else { id = S.cell[i - 8]; if (id < 0) continue; src = { k: 'cell', i: i - 8 }; }
        fi = foundSlot(id);
        if (fi >= 0) {
          var first = rects();
          applyMove(src, 1, { k: 'found', i: fi });
          S.moves++;
          sound('flip', 0.5);
          render(true, first);
          save();
          if (foundCount() === 52) { busy = false; win(); return; }
          return setTimeout(step, reduceMotion ? 0 : 110);
        }
      }
      busy = false; updateUI();
    })();
  }

  function undo() {
    if (busy || S.won || !hist.length) return;
    var p;
    try { p = JSON.parse(hist.pop()); } catch (e) { return; }
    clearHint(); lastMove = null;
    var first = rects();
    S.col = p.col; S.cell = p.cell; S.found = p.found; S.moves = p.moves;
    sel = -1;
    sound('flip', 0.5);
    render(true, first);
    save();
  }

  function win() {
    S.won = true; busy = true; stopTimer(); store.del('fc.game');
    sound('cheer', 0.8);
    $('#wMoves').textContent = S.moves;
    $('#wTime').textContent = fmtTime(S.secs);
    var g = gen;
    var show = function () { if (g !== gen) return; busy = false; updateUI(); openDlg(D.win); };
    if (reduceMotion) return show();
    els.forEach(function (el, i) {
      el.style.zIndex = 600;
      el.style.transition = 'transform ' + (900 + Math.random() * 500) + 'ms cubic-bezier(.5,0,1,1) ' + (i * 18) + 'ms';
      el.style.transform = 'translate(' + ((Math.random() - 0.5) * 700) + 'px,' + (window.innerHeight + 300) + 'px) rotate(' + ((Math.random() - 0.5) * 120) + 'deg)';
    });
    setTimeout(show, 1500);
  }

  /*  auto move (double click / double tap) */
  function autoMove(id) {
    var L = locate(id);
    if (!L || L.k === 'found') return;
    var g = dragGroup(id);
    if (!g) { toast('locked'); return; }
    var ids = g.ids, src = g.src, j, ci;
    if (ids.length === 1) {
      var fi = foundSlot(id);
      if (fi >= 0) { tryMove(src, ids, { k: 'found', i: fi }); return; }
    }
    for (j = 0; j < 8; j++) {
      if (S.col[j].length && why(ids, { k: 'col', i: j }, src) === '') { tryMove(src, ids, { k: 'col', i: j }); return; }
    }
    if (src.k === 'cell') {
      for (j = 0; j < 8; j++) if (!S.col[j].length) { tryMove(src, ids, { k: 'col', i: j }); return; }
    } else if (ids.length === 1 && S.col[src.i].length > 1) {
      ci = S.cell.indexOf(-1);
      if (ci >= 0) { tryMove(src, ids, { k: 'cell', i: ci }); return; }
    }
    toast('nomove'); shake(ids);
  }

  /*  pointer input */
  var ptr = null, lastTap = { id: -1, t: 0 };

  table.addEventListener('pointerdown', function (e) {
    if (busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (!e.isPrimary) return;
    clearHint();
    if (ptr) onCancel(); // a previous gesture never finished (lost pointerup) – recover instead of locking the board
    unlockAudio();
    var c = e.target.closest ? e.target.closest('.card') : null;
    ptr = { id: c ? +c.getAttribute('data-id') : -1, x: e.clientX, y: e.clientY, pid: e.pointerId, started: false, dead: false, target: e.target };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
  });

  table.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  function targetList() {
    var list = [], r;
    colEls.forEach(function (el, i) { list.push({ k: 'col', i: i, el: el, r: el.getBoundingClientRect() }); });
    cellEls.forEach(function (el, i) { list.push({ k: 'cell', i: i, el: el, r: el.getBoundingClientRect() }); });
    foundEls.forEach(function (el, i) { list.push({ k: 'found', i: i, el: el, r: el.getBoundingClientRect() }); });
    return list;
  }
  function pickTarget() {
    var g = ptr.group, r0 = els[g.ids[0]].getBoundingClientRect(), cands = [];
    ptr.targets.forEach(function (t) {
      var w = Math.min(r0.right, t.r.right) - Math.max(r0.left, t.r.left),
          h = Math.min(r0.bottom, t.r.bottom) - Math.max(r0.top, t.r.top);
      if (w > 0 && h > 0) cands.push({ t: t, a: w * h });
    });
    cands.sort(function (a, b) { return b.a - a.a; });
    for (var i = 0; i < cands.length; i++) {
      var t = cands[i].t;
      if (why(g.ids, t, g.src) === '') return t;
    }
    return null;
  }
  function setOver(t) {
    if (ptr.over === t) return;
    if (ptr.over) ptr.over.el.classList.remove('over');
    ptr.over = t;
    if (t) t.el.classList.add('over');
  }
  function onMove(e) {
    if (!ptr || e.pointerId !== ptr.pid) return;
    var dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
    if (!ptr.started) {
      if (ptr.dead || Math.hypot(dx, dy) < 6) return;
      if (ptr.id < 0) { ptr.dead = true; return; }
      var g = dragGroup(ptr.id);
      if (!g) { ptr.dead = true; return; }
      ptr.started = true; ptr.group = g; ptr.targets = targetList(); ptr.over = null;
      sel = -1; updateUI();
      g.ids.forEach(function (id) { els[id].classList.add('drag'); });
    }
    var tf = 'translate(' + dx + 'px,' + dy + 'px)';
    ptr.group.ids.forEach(function (id) { els[id].style.transform = tf; });
    setOver(pickTarget());
  }
  function endPointer() {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
  }
  function onCancel() {
    if (!ptr) return;
    var p = ptr; endPointer();
    if (p.over) p.over.el.classList.remove('over');
    ptr = null;
    if (p.started) render(true);
  }
  function onUp(e) {
    if (!ptr || e.pointerId !== ptr.pid) return;
    var p = ptr; endPointer();
    if (p.started) {
      var t = pickTarget(); // reads ptr (still set)
      if (p.over) p.over.el.classList.remove('over');
      ptr = null;
      if (t) tryMove(p.group.src, p.group.ids, t, true);
      else render(true);
      return;
    }
    ptr = null;
    if (p.dead) { if (p.id >= 0) { shake([p.id]); toast('locked'); } return; }
    onTap(p);
  }

  function dstOf(L) { return { k: L.k, i: L.i }; }
  function onTap(p) {
    var now = Date.now(), id = p.id, g, L;
    if (id >= 0) {
      L = locate(id);
      if (!L) return;
      if (sel >= 0 && sel !== id) {
        var sg = dragGroup(sel);
        if (sg) {
          var dst = dstOf(L), r = why(sg.ids, dst, sg.src);
          if (!r) { tryMove(sg.src, sg.ids, dst); return; }
          if (!dragGroup(id)) { toast(r, { n: maxMove(dst.i) }); shake(sg.ids); return; }
        }
      }
      if (lastTap.id === id && now - lastTap.t < 420) { lastTap.id = -1; sel = -1; autoMove(id); return; }
      lastTap = { id: id, t: now };
      if (sel === id) { sel = -1; updateUI(); return; }
      g = dragGroup(id);
      if (g) { sel = id; updateUI(); }
      else { sel = -1; updateUI(); if (L.k !== 'found') { shake([id]); toast('locked'); } }
    } else {
      var slot = p.target.closest ? p.target.closest('.slot,.col') : null;
      if (sel >= 0 && slot) {
        var sg2 = dragGroup(sel);
        if (sg2) tryMove(sg2.src, sg2.ids, { k: slot.getAttribute('data-k'), i: +slot.getAttribute('data-i') });
      } else { sel = -1; updateUI(); }
    }
  }

  /*  UI wiring + modals */
  var D = {
    menu: $('#dlgMenu'), nw: $('#dlgNew'), opts: $('#dlgOpts'), help: $('#dlgHelp'), win: $('#dlgWin'), stuck: $('#dlgStuck'), install: $('#dlgInstall')
  };
  function allDialogs() { return Object.keys(D).map(function (k) { return D[k]; }); }
  function openDlg(d) {
    allDialogs().forEach(function (o) { if (o !== d && o.open) closeDlg(o); });
    if (d.open) return;
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }
  function closeDlg(d) { if (d.close) d.close(); else d.removeAttribute('open'); }

  function openNew() {
    var inGame = S && S.moves > 0 && !S.won;
    $('#newWarn').hidden = !inGame;
    $('#nRestart').disabled = !(S && (S.moves > 0 || S.won));
    $('#nErr').hidden = true;
    $('#nNo').value = '';
    openDlg(D.nw);
  }
  function fillHelp() {
    var body = $('#helpBody');
    if (body.firstChild) return;
    var steps = $('#stepsList'), tips = $('#tipsList');
    if (!steps) return;
    [['#howto', steps], ['#tips', tips]].forEach(function (p) {
      var h = $(p[0]), list = p[1];
      if (!h || !list) return;
      var h3 = document.createElement('h3');
      h3.textContent = h.textContent;
      var c = list.cloneNode(true);
      $$('[id]', c).forEach(function (n) { n.removeAttribute('id'); });
      body.appendChild(h3); body.appendChild(c);
    });
  }

  $('#bMenu').addEventListener('click', function () { unlockAudio(); openDlg(D.menu); });
  $('#bUndo').addEventListener('click', undo);
  $('#bNew').addEventListener('click', function () { unlockAudio(); openNew(); });
  $('#mResume').addEventListener('click', function () { closeDlg(D.menu); });
  $('#mNew').addEventListener('click', openNew);
  $('#mOpts').addEventListener('click', function () { openDlg(D.opts); });
  $('#mHelp').addEventListener('click', function () { fillHelp(); openDlg(D.help); });
  $('#nRandom').addEventListener('click', function () { closeDlg(D.nw); newGame(null, true); });
  $('#nRestart').addEventListener('click', function () { closeDlg(D.nw); newGame(S.seed, true); });
  $('#nForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var raw = $('#nNo').value.trim(), n = /^\d+$/.test(raw) ? parseInt(raw, 10) : 0;
    if (n < 1 || n > 1000000) { $('#nErr').hidden = false; $('#nNo').focus(); return; }
    closeDlg(D.nw); newGame(n, true);
  });
  $('#wAgain').addEventListener('click', function () { closeDlg(D.win); });
  D.win.addEventListener('close', function () { if (S && S.won) newGame(null, true); });
  $('#sUndo').addEventListener('click', function () { closeDlg(D.stuck); undo(); });
  $('#sNew').addEventListener('click', openNew);
  $$('[data-close]').forEach(function (b) {
    b.addEventListener('click', function () { closeDlg(b.closest('dialog')); });
  });
  allDialogs().forEach(function (d) {
    // dialog has no padding, so a click whose target is the dialog itself is a click on the backdrop
    d.addEventListener('click', function (e) { if (e.target === d && d !== D.win) closeDlg(d); });
    d.addEventListener('close', function () { updateUI(); });
  });

  function saveOpts() { var o = {}; BOOL_OPTS.forEach(function (k) { o[k] = opts[k]; }); store.set('fc.opts', o); }
  function applyOpts() {
    reduceMotion = sysReduce || !opts.anim;
    root.classList.toggle('c4', opts.c4);
    root.classList.toggle('swap', opts.swap);
    root.classList.toggle('noanim', !opts.anim);
    root.classList.toggle('nostats', !opts.stats);
    $('#bHint').hidden = !opts.hint;
    if (!opts.hint) clearHint();
  }
  $$('[data-opt]').forEach(function (inp) {
    var k = inp.getAttribute('data-opt');
    inp.checked = !!opts[k];
    inp.addEventListener('change', function () {
      opts[k] = inp.checked; saveOpts(); applyOpts();
      if (k === 'sound' && opts.sound) unlockAudio();
      if (S && !S.won && !busy) {
        if (k === 'auto' && opts.auto && canAutoFinish()) autoFinish();
        if (k === 'safe' && opts.safe && nextSafe()) safePlay();
      }
    });
  });
  $('#bHint').addEventListener('click', showHint);
  applyOpts();
  $$('input[name=bg]').forEach(function (r) {
    r.checked = r.value === opts.bg;
    r.addEventListener('change', function () {
      if (!r.checked) return;
      opts.bg = r.value;
      root.setAttribute('data-bg', r.value);
      try { localStorage.setItem('fc.bg', r.value); } catch (e) {}
    });
  });

  /* ---- install app (PWA) / add to home screen ---- */
  var deferred = null, ua = navigator.userAgent;
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /android/i.test(ua);
  function standalone() {
    return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  }
  var installBtns = $$('.js-install');
  function updateInstall() {
    var show = !standalone() && (!!deferred || isIOS || isAndroid);
    installBtns.forEach(function (b) { b.hidden = !show; });
  }
  function doInstall() {
    if (deferred) {
      var p = deferred; deferred = null; updateInstall();
      p.prompt();
      if (p.userChoice && p.userChoice.then) p.userChoice.then(function (c) { if (c && c.outcome === 'dismissed') { deferred = p; updateInstall(); } });
      return;
    }
    $('#iosHelp').hidden = !isIOS;
    $('#otherHelp').hidden = isIOS;
    openDlg(D.install);
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; updateInstall(); });
  window.addEventListener('appinstalled', function () { deferred = null; updateInstall(); toast('installed'); });
  installBtns.forEach(function (b) { b.addEventListener('click', function () { if (D.menu.open) closeDlg(D.menu); doInstall(); }); });
  updateInstall();

  /* fullscreen (real API where available, CSS fallback e.g. iPhone Safari) */
  var fsBtn = $('#bFs');
  function nativeFs() { return document.fullscreenElement || document.webkitFullscreenElement; }
  function updateFs() {
    var on = !!nativeFs() || root.classList.contains('pfs');
    root.classList.toggle('fs', !!nativeFs());
    var label = on ? I18N.fsExit : I18N.fsEnter;
    if (label) { fsBtn.setAttribute('aria-label', label); fsBtn.title = label; var t = fsBtn.querySelector('.t'); if (t) t.textContent = label; }
    fsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    onResize();
  }
  function leaveFs() {
    if (nativeFs()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
    root.classList.remove('pfs'); root.classList.remove('fs');
    updateFs();
  }
  function toggleFs() {
    if (nativeFs() || root.classList.contains('pfs')) { leaveFs(); return; }
    var req = root.requestFullscreen || root.webkitRequestFullscreen;
    var pseudo = function () { root.classList.add('pfs'); window.scrollTo(0, 0); updateFs(); };
    if (!req) { pseudo(); return; }
    try {
      var p = req.call(root);
      if (p && p.catch) p.catch(pseudo);
    } catch (e) { pseudo(); }
    window.scrollTo(0, 0);
  }
  fsBtn.addEventListener('click', toggleFs);
  document.addEventListener('fullscreenchange', updateFs);
  document.addEventListener('webkitfullscreenchange', updateFs);

  document.addEventListener('keydown', function (e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (allDialogs().some(function (d) { return d.open; })) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'f') toggleFs();
    else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'u') undo();
    else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'h' && opts.hint) showHint();
  });

  var rT;
  function onResize() {
    cancelAnimationFrame(rT);
    rT = requestAnimationFrame(function () { if (S) { measure(); setOffsets(); } });
  }
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
  document.addEventListener('visibilitychange', function () { if (document.hidden && S) save(); });
  window.addEventListener('pagehide', function () { if (S) save(); });

  /*  start */
  buildCards();
  var saved = store.get('fc.game');
  if (saved && saved.v === 1 && validState(saved.S)) {
    S = saved.S; hist = Array.isArray(saved.hist) ? saved.hist : [];
    render(false);
    if (S.moves > 0) startTimer();
    if (opts.auto && canAutoFinish() && foundCount() < 52) autoFinish(); else checkStuck();
  } else {
    newGame(null, true);
  }
  if (/[?&]new=1\b/.test(location.search)) {
    if (!(saved && S.moves > 0)) { /* fresh already */ } else newGame(null, true);
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
  }
  updateFs();

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      (window.requestIdleCallback || setTimeout)(function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    });
  }

  // small hook for automated tests / debugging
  window.FreeCell = { isBusy: function () { return busy; }, opts: opts, listMoves: listMoves, showHint: showHint, nextSafe: nextSafe, isSafe: isSafe, load: function (st) { S = st; hist = []; sel = -1; busy = false; render(false); }, isStuck: function () { return isStuck(); }, checkStuck: checkStuck, state: function () { return S; }, tryMove: tryMove, why: why, maxMove: maxMove, newGame: newGame, undo: undo, dragGroup: dragGroup, canAutoFinish: canAutoFinish, foundSlot: foundSlot };
})();
