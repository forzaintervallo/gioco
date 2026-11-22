// Motore di gioco Canvas 2D: input touch/tilt, fisica, rendering, particelle (pool).
(function () {
  // Cielo in funzione della quota (px sopra la partenza): orizzonte chiaro -> azzurro -> tramonto -> spazio
  // Cielo in funzione della quota (px): orizzonte -> azzurro -> spazio, poi tinta per zona (Luna, Asteroidi, Marte rosso, Nebulosa viola)
  const SKY = [[0, [190, 232, 255]], [900, [110, 200, 255]], [2500, [60, 140, 230]], [5800, [30, 50, 140]], [7000, [8, 10, 40]], [13000, [6, 8, 28]], [16000, [10, 12, 30]], [19000, [30, 14, 24]], [21000, [70, 24, 22]], [23000, [30, 10, 56]], [32000, [16, 6, 40]]];
  // Palette piattaforme per zona: Prato, Cielo (marmo), Orbita (pannelli), Luna, Asteroidi, Marte, Nebulosa (cristallo)
  const PAL = [{ top: '#4fb84a', hi: '#8cf08a', body: '#8b5a2b', dk: '#6f4520' }, { top: '#ffffff', hi: '#ffffff', body: '#e7e3f4', dk: '#b9b0d0' },
  { top: '#e2e8f0', hi: '#f8fafc', body: '#94a3b8', dk: '#475569' },   // Orbita: metallo da stazione
  { top: '#e5e7eb', hi: '#f9fafb', body: '#9ca3af', dk: '#6b7280' },   // Luna
  { top: '#c0ad98', hi: '#e0d2c0', body: '#8d7b6a', dk: '#5a4a3c' },   // Asteroidi: roccia chiara (stacca dallo sfondo scuro)
  { top: '#ecc9a3', hi: '#f8e3c9', body: '#c08457', dk: '#7c4a2a' },   // Marte: sabbia (stacca dal cielo rosso)
  { top: '#ede9fe', hi: '#ffffff', body: '#a78bfa', dk: '#6d28d9' }];  // Nebulosa: cristallo chiaro
  const PX = { top: '#f87171', hi: '#fecaca', body: '#b91c1c', dk: '#7f1d1d' };
  // Piattaforme mobili/fragili/bombe: colore (quasi tinta unita) che cambia per contrastare con lo sfondo di ogni zona
  // [Prato, Cielo, Orbita, Luna, Asteroidi, Marte, Nebulosa]; m=orizzontale, u=su/giù, f=fragile, x=bomba. In ogni zona i tipi hanno tinte diverse tra loro.
  const TC = {
    m: ['#0ea5e9', '#f59e0b', '#fbbf24', '#38bdf8', '#22d3ee', '#38bdf8', '#22d3ee'], u: ['#a855f7', '#10b981', '#a78bfa', '#34d399', '#f472b6', '#86efac', '#fde047'],
    f: ['#b45309', '#9a6b3e', '#e7e5e4', '#c8a97e', '#d6d3d1', '#f5f5f4', '#fb923c'], x: ['#dc2626', '#dc2626', '#dc2626', '#dc2626', '#dc2626', '#292524', '#1f2937']
  };
  const mix = (h, t) => { const n = parseInt(h.slice(1), 16), T = t < 0 ? 0 : 255, k = Math.abs(t); return '#' + [n >> 16, n >> 8 & 255, n & 255].map(v => Math.round(v + (T - v) * k).toString(16).padStart(2, '0')).join('') };
  const PT = {}; for (const t in TC) PT[t] = TC[t].map(h => { const n = parseInt(h.slice(1), 16); return { b: h, hi: mix(h, .45), dk: mix(h, -.4), light: (.299 * (n >> 16) + .587 * (n >> 8 & 255) + .114 * (n & 255)) > 150 } });
  // Nuvole che spariscono: [colore, ombra] ritexturizzate per zona (aria, rosato, energia, polvere lunare, polvere, polvere rossa, gas luminoso)
  const CL = [['#f8fafc', '#cbd5e1'], ['#fff1f2', '#fda4af'], ['#a5f3fc', '#22d3ee'], ['#d1d5db', '#9ca3af'], ['#d6c7b0', '#9a8870'], ['#fed7aa', '#c2410c'], ['#f0abfc', '#a21caf']];
  const BODIES = [['earth', 9600, 120, 250, .18], ['moon', 14500, 285, 105, .22], ['mars', 21000, 105, 92, .22], ['saturn', 25500, 285, 85, .22]]; // [corpo, quota, x, raggio, parallasse]
  const { PHYS, Gen, biomeAt } = window.EJ, W = PHYS.W, R = 15, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  class Game {
    constructor(cv, o) {
      this.cv = cv; this.cx = cv.getContext('2d'); this.o = o; this.state = 'idle'; this.keys = {}; this.tx = null; this.tiltV = 0; this.last = null; this.t = 0; this.b0 = 0; this.f0 = 0; this.acc = 0; this.recBuf = new Uint8Array(65536); this.recLen = 0; this.recN = 0; this.H0q = 0; this.recH = 0;
      this.p = { x: W / 2, y: 0, vx: 0, vy: 0, sq: 0, rot: 0 }; this.items = []; this.haz = []; this.cam = 0; this.top = 0; this.score = 0;
      this.parts = Array.from({ length: 64 }, () => ({ l: 0, x: 0, y: 0, vx: 0, vy: 0 }));
      this.clouds = Array.from({ length: 9 }, (_, i) => ({ x: (i * 131 + 40) % W, y: i * 173, s: .7 + (i % 3) * .3, k: .22 + (i % 3) * .1 }));
      this.rocks = Array.from({ length: 14 }, (_, i) => { const r = 7 + (i % 5) * 5; return { x: i * 57 % W, y: i * 131, k: .3 + (i % 4) * .15, dx: 3 + i % 3 * 2, r, rot: i, sp: (i % 2 ? 1 : -1) * .2, pts: Array.from({ length: 7 }, (_, j) => { const an = j / 7 * 6.283, rr = r * (.75 + ((i * 7 + j * 13) % 10) / 25); return [Math.cos(an) * rr, Math.sin(an) * rr] }) } });
      this.sats = Array.from({ length: 5 }, (_, i) => ({ x: i * 83 % W, y: i * 190, k: .3 + (i % 3) * .12, dx: 6 + i % 3 * 3, sc: .8 + (i % 3) * .25, rot: i * .7 }));
      this.god = false; this.bi = 0; this.shake = 0; this.pows = []; this.jet = 0; this.shield = 0; this.inv = 0; this.boost = 0; this.lab = '';
      this.stars = Array.from({ length: 48 }, (_, i) => ({ x: (i * 83) % W, y: (i * 157) % 900, r: 1 + (i % 3) * .7 }));
      // Nebulosa magica: cristalli, polvere, stelle cadenti; qualità adattiva (fxq) e rispetto di "riduci movimento" (rm)
      this.crystals = Array.from({ length: 6 }, (_, i) => ({ x: (i * 97 + 30) % W, y: i * 151, k: .25 + (i % 3) * .1, s: 9 + (i % 3) * 5, r: i }));
      this.dust = Array.from({ length: 46 }, (_, i) => ({ x: (i * 71) % W, y: (i * 137) % 900, k: .12 + (i % 5) * .07, s: 1 + (i % 3) * .7, h: (i * 47) % 360, p: i }));
      this.meteors = Array.from({ length: 7 }, () => ({ l: 0, x: 0, y: 0, vx: 0, vy: 0, len: 0, h: 0 }));
      this.mg = 0; this.nb = 0; this.lv = 0; this.mt = 1; this.avg = .016; this.fxq = 1; this.fq = 1; this.rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.spr = {}; for (const n of ['platform', 'platform_move', 'platform_vanish', 'platform_break', 'spring', 'spike', 'enemy', 'blackhole']) {
        const im = new Image(); // sprite opzionali: assets/sprites/<nome>.png
        im.onload = () => { this.spr[n] = im }; im.src = (window.CONFIG.SPRITE_DIR || 'assets/sprites/') + n + '.png'
      }
      this.logo = new Image(); this.logo.src = window.CONFIG.LOGO;
      this.resize(); addEventListener('resize', () => this.resize());
      cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); this.f0 = e.clientX; this.b0 = this.p.x; this.tx = this.p.x });
      cv.addEventListener('pointermove', e => { if (this.tx != null) this.tx = this.b0 + (e.clientX - this.f0) * W / this.cw }); // trascinamento relativo: il dito non copre la palla
      const up = () => { this.tx = null }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      addEventListener('keydown', e => this.keys[e.code] = 1); addEventListener('keyup', e => this.keys[e.code] = 0);
      addEventListener('deviceorientation', e => { this.tiltV = (e.gamma || 0) / 22 });
      document.addEventListener('visibilitychange', () => document.hidden && this.pause()); addEventListener('blur', () => this.pause());
      this.loop = t => {
        requestAnimationFrame(this.loop);
        if (this.state === 'run') { const raw = this.last ? (t - this.last) / 1000 : 0; this.last = t;
          this.acc += Math.min(raw, .033); const ms = Math.min(33, Math.floor(this.acc * 1000 + 1e-6)), dt = ms / 1000; this.acc -= dt; // millisecondi interi (con resto riportato): stessa velocità media, ma la partita è riproducibile dal server
          if (raw > 0) { this.avg = this.avg * .97 + raw * .03; this.fxq = this.avg > .027 ? 0 : this.avg < .021 ? 1 : this.fxq } // telefono lento: effetti più leggeri
          this.rec(ms); this.update(dt); this.draw() } else this.last = null
      };
      requestAnimationFrame(this.loop);
    }
    resize() {
      const d = Math.min(devicePixelRatio || 1, 2), w = Math.min(innerWidth, innerHeight * .62), h = innerHeight;
      this.cw = w; this.H = Math.round(W * h / w * 10) / 10; this.cv.style.width = w + 'px'; this.cv.width = w * d; this.cv.height = h * d; this.k = w * d / W
    }
    start(seed) {
      this.gen = new Gen(seed); this.items = [{ t: 'n', x: W / 2, bx: W / 2, y: 0, w: 90, amp: 0, ph: 0 }]; this.haz = []; this.pows = []; this.jet = 0; this.shield = 0; this.inv = 0; this.boost = 0; this.lab = ''; this.o.onPower && this.o.onPower('');
      this.p = { x: W / 2, y: -30, vx: 0, vy: PHYS.jump, sq: 0, rot: 0 }; this.top = -30; this.cam = -this.H * .7; this.t = 0; this.score = 0; this.tx = null; this.bi = 0; this.shake = 0; this.mg = 0; this.nb = 0; this.mt = 1; for (const m of this.meteors) m.l = 0; this.acc = 0; this.recLen = 0; this.recN = 0; this.H0q = Math.round(this.H * 10); this.recH = this.H0q; this.state = 'run'; this.last = null; this.o.onScore(0)
    }
    sfx(k) { this.o.sfx && this.o.sfx(k) }
    pause() { if (this.state === 'run') { this.state = 'pause'; this.o.onPause() } }
    resume() { if (this.state === 'pause') this.state = 'run' }
    stop() { this.state = 'idle' }
    burst(x, y, n = 8, col) { for (const q of this.parts) if (q.l <= 0 && n > 0) { n--; q.l = 1; q.x = x; q.y = y; q.c = col; q.vx = (Math.random() - .5) * (col ? 420 : 260); q.vy = -Math.random() * (col ? 320 : 160) } }
    explode(q) { q.dead = true; this.burst(q.x, q.y, 16, '#fb923c'); this.burst(q.x, q.y, 8, '#fde047'); this.shake = .3; this.sfx('explode'); if (Math.hypot(this.p.x - q.x, this.p.y - q.y) < 70) this.hurt() }
    hurt(h) { // danno: ignorato se immortale/protetto; lo scudo assorbe un colpo (e distrugge l'ostacolo)
      if (this.god || this.inv > 0 || this.jet > 0) return; const p = this.p;
      if (this.shield > 0) { this.shield = 0; this.inv = 1; this.burst(p.x, p.y, 14, '#67e8f9'); this.sfx('shieldbreak'); if (h) h.dead = true; return }
      this.die('hit')
    }
    give(k) {
      const p = this.p; this.sfx('pickup'); this.burst(p.x, p.y, 10, { shield: '#67e8f9', potion: '#c084fc', jet: '#fb923c' }[k]); this.o.onPick && this.o.onPick(k);
      if (k === 'shield') this.shield = 20; else if (k === 'potion') { p.vy = -1850; this.inv = 1.7; this.boost = 1.4; this.sfx('potion') } else if (k === 'jet') { this.jet = 2.6; this.sfx('jetpack') }
    }
    teleport(alt) { // solo debug: salta a una quota, su una piattaforma normale
      const T = -alt; this.gen.fill(T - 900, this.items, this.haz, this.pows); let b = null; for (const i of this.items) if (i.t === 'n' && i.y < T && (!b || i.y > b.y)) b = i; if (!b) return;
      const p = this.p; p.x = b.x; p.y = b.y - R - 2; p.vy = PHYS.jump; this.cam = p.y - this.H * .6; this.bi = biomeAt(-p.y) - 1; this.tx = null
    }
    teleportNext() { const B = window.EJ.BIOMES; this.teleport(B[Math.min(B.length - 1, biomeAt(-this.p.y) + 1)].from + 120) }
    update(dt) {
      const p = this.p, k = this.keys; this.t += dt;
      const ax = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
      if (ax) p.vx = ax * PHYS.maxVx; else if (this.tx != null) p.vx = clamp((this.tx - p.x) * 12, -700, 700);
      else if (this.o.tilt()) p.vx = clamp(this.tiltV, -1, 1) * PHYS.maxVx * 1.1; else p.vx *= Math.pow(.02, dt);
      const oy = p.y; if (this.jet > 0) { this.jet -= dt; p.vy += (-900 - p.vy) * Math.min(1, dt * 8); if (this.jet <= 0) { this.jet = 0; this.inv = 1 } } else p.vy += PHYS.g * dt; p.y += p.vy * dt; p.x += p.vx * dt; p.rot += p.vx * dt / R; p.sq = Math.max(0, p.sq - dt);
      const sh = p.x < -R ? W + 2 * R : p.x > W + R ? -(W + 2 * R) : 0; if (sh) { p.x += sh; this.b0 += sh; if (this.tx != null) this.tx += sh } // wrap ai bordi
      for (const q of this.items) {
        if (q.cp > 0) q.cp -= dt;
        const py = q.y;
        if (q.t === 'm') q.x = q.bx + Math.sin(this.t * 1.6 + q.ph) * q.amp; else if (q.t === 'u') q.y = q.by + Math.sin(this.t * 1.4 + q.ph) * q.vamp;
        if (q.fuse > 0) { q.fuse -= dt; if (q.fuse <= 0) { this.explode(q); if (this.state !== 'run') return } }
        if (q.broke) q.y += 450 * dt;
        else if (q.fade !== undefined) q.fade -= dt;
        else if (!q.dead && p.vy > 0 && oy + R <= py + 2 && p.y + R >= q.y && Math.abs(p.x - q.x) < q.w / 2 + R * .6) {
          if (q.t === 'f') { q.broke = true; this.burst(q.x, q.y); this.sfx('break'); continue }
          p.vy = q.sp ? PHYS.spring : PHYS.jump; p.sq = .3; this.burst(p.x, q.y); this.sfx(q.sp ? 'spring' : 'jump'); if (q.sp) q.cp = .25;
          if (q.t === 'v') { q.fade = .3; this.sfx('vanish') } else if (q.t === 'x' && !q.fuse) q.fuse = .45;
        }
      }
      for (const h of this.haz) {
        if (h.t === 'o') h.x = h.bx + Math.sin(this.t * 1.3 + h.ph) * h.amp;
        if (h.t === 'b' && !h.dead && this.jet <= 0 && this.boost <= 0) { const dx = h.x - p.x, dy = h.y - p.y, d = Math.hypot(dx, dy); if (d < h.pull && d > 1) { const s = 300 * Math.pow(1 - d / h.pull, 1.5) * dt; p.x += dx / d * s; p.y += dy / d * s } } // attrazione: spostamento diretto, si vince sterzando
        if (!h.dead && Math.hypot(h.x - p.x, h.y - p.y) < R + h.r - 5) { this.hurt(h); if (this.state !== 'run') return }
      }
      for (const w of this.pows) if (!w.got && Math.hypot(w.x - p.x, w.y - p.y) < R + 17) { w.got = true; this.give(w.k) }
      if (this.boost > 0) { this.boost -= dt; this.burst(p.x, p.y + 10, 1, '#c084fc') }
      if (this.jet > 0) this.burst(p.x, p.y + 14, 1, Math.random() < .5 ? '#fb923c' : '#fde047');
      if (this.inv > 0) this.inv -= dt; if (this.shield > 0) this.shield -= dt;
      const lab = this.jet > 0 ? '🚀 ' + this.jet.toFixed(1) + 's' : this.shield > 0 ? '🛡️' : ''; if (lab !== this.lab) { this.lab = lab; this.o.onPower && this.o.onPower(lab) }
      if (p.y < this.cam + this.H * .4) this.cam = p.y - this.H * .4;
      const bot = this.cam + this.H + 80;
      this.items = this.items.filter(q => q.y < bot && !(q.fade <= 0) && !q.dead); this.haz = this.haz.filter(h => h.y < bot && !h.dead); this.pows = this.pows.filter(w => !w.got && w.y < bot);
      this.gen.fill(this.cam - 200, this.items, this.haz, this.pows);
      for (const q of this.parts) if (q.l > 0) { q.l -= dt * 2.5; q.vy += 600 * dt; q.x += q.vx * dt; q.y += q.vy * dt }
      if (p.y < this.top) { this.top = p.y; const s = Math.floor((-30 - this.top) / 10); if (s > this.score) { this.score = s; this.o.onScore(s) } }
      this.fxUpdate(dt);
      if (this.shake > 0) this.shake -= dt;
      const bi = biomeAt(-p.y); if (bi > this.bi) { this.bi = bi; this.o.onBiome && this.o.onBiome(bi) }
      if (p.y > this.cam + this.H + R) { if (this.god) { p.y = this.cam + this.H - 30; p.vy = -1000 } else this.die() }
    }
    die(why) { if (this.state !== 'run') return; this.state = 'over'; this.sfx(why || 'fall'); this.o.onPower && this.o.onPower(''); this.o.onOver(this.score) }
    rr(x, y, w, h, r) { const c = this.cx; c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); c.fill() }
    skyAt(h) { let i = 1; while (i < SKY.length - 1 && h > SKY[i][0]) i++; const a = SKY[i - 1], b = SKY[i], t = clamp((h - a[0]) / (b[0] - a[0]), 0, 1); return a[1].map((v, j) => v + (b[1][j] - v) * t) }
    clear() { const c = this.cx; c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#bfe8ff'; c.fillRect(0, 0, this.cv.width, this.cv.height) }
    tri(a, b, c2, d, e, f) { const c = this.cx; c.beginPath(); c.moveTo(a, b); c.lineTo(c2, d); c.lineTo(e, f); c.fill() }
    ground() { // prato di partenza: colline lontane, colline vicine, erba con ciuffi, terra
      const c = this.cx, gy = 12, hill = (base, amp, fr, ph, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(-10, gy + 600); for (let x = -10; x <= W + 10; x += 16)c.lineTo(x, base - amp * (.5 + .5 * Math.sin(x * fr + ph))); c.lineTo(W + 10, gy + 600); c.fill() };
      hill(gy - 6, 56, .013, 1, '#9be08f'); hill(gy - 2, 32, .022, 4, '#6fcb64');
      c.fillStyle = '#8b5a2b'; c.fillRect(-5, gy + 14, W + 10, 600); c.fillStyle = '#6f4520'; for (let x = 6; x < W; x += 34)c.fillRect(x, gy + 30 + (x * 7 % 24), 10, 5);
      c.fillStyle = '#4fb84a'; c.fillRect(-5, gy - 1, W + 10, 17); c.fillStyle = '#7ddc6f'; c.fillRect(-5, gy - 1, W + 10, 4);
      c.fillStyle = '#4fb84a'; for (let x = 0; x < W; x += 9)this.tri(x, gy, x + 4, gy - 7 - (x * 5 % 5), x + 8, gy);
    }
    slab(x, y, w, P, bi) { // piattaforma base, con dettagli della zona
      const c = this.cx; c.fillStyle = P.body; this.rr(x, y + 3, w, 11, 5); c.fillStyle = P.dk; this.rr(x + 5, y + 10, w - 10, 4, 2); c.fillStyle = P.top; this.rr(x - 1, y - 1, w + 2, 9, 4.5); c.fillStyle = P.hi; this.rr(x + 4, y, w - 8, 3, 1.5);
      c.strokeStyle = 'rgba(6,10,28,.6)'; c.lineWidth = 1.4; c.beginPath(); c.roundRect ? c.roundRect(x - 1.5, y - 1.5, w + 3, 16, 6) : c.rect(x - 1.5, y - 1.5, w + 3, 16); c.stroke(); // contorno: leggibile su qualunque sfondo
      if (bi === 1) { c.fillStyle = '#f5c542'; c.fillRect(x + 4, y + 8, w - 8, 1.5) }
      else if (bi === 2) { c.fillStyle = P.dk; for (let i = x + 10; i < x + w - 6; i += 10)c.fillRect(i, y + 3, 1, 9); c.fillStyle = '#cbd5e1'; c.fillRect(x + w / 2 - 1, y - 6, 2, 6); c.beginPath(); c.arc(x + w / 2, y - 6, 2, 0, 6.3); c.fill() }
      else if (bi === 3) { c.fillStyle = P.dk; for (const f of [.3, .68]) { c.beginPath(); c.ellipse(x + w * f, y + 9, 3.5, 1.6, 0, 0, 6.3); c.fill() } }
      else if (bi === 4) { c.fillStyle = P.dk; this.tri(x + w * .2, y + 14, x + w * .27, y + 9, x + w * .34, y + 14); this.tri(x + w * .6, y + 14, x + w * .68, y + 8, x + w * .76, y + 14); c.fillStyle = P.hi; this.tri(x + w * .45, y - 1, x + w * .5, y - 4, x + w * .56, y - 1) }
      else if (bi === 5) { c.strokeStyle = P.dk; c.lineWidth = 1.3; c.beginPath(); c.moveTo(x + w * .3, y + 3); c.lineTo(x + w * .36, y + 8); c.lineTo(x + w * .31, y + 13); c.moveTo(x + w * .7, y + 4); c.lineTo(x + w * .64, y + 9); c.stroke() }
      else if (bi === 6) { c.fillStyle = P.hi; this.tri(x + w * .18, y - 1, x + w * .24, y - 8, x + w * .3, y - 1); this.tri(x + w * .62, y - 1, x + w * .7, y - 10, x + w * .78, y - 1); c.fillStyle = '#f0abfc'; this.tri(x + w * .45, y - 1, x + w * .5, y - 5, x + w * .55, y - 1) }
    }
    drawPlat(q) {
      const c = this.cx, x = q.x - q.w / 2, y = q.y, w = q.w, cx = q.x, bi = biomeAt(-q.by), sp = this.spr[{ n: 'platform', m: 'platform_move', v: 'platform_vanish', f: 'platform_break', u: 'platform_move', x: 'platform_break' }[q.t]];
      if (sp) { c.drawImage(sp, x, y - 2, w, 16); return }
      if (q.t === 'n') { this.slab(x, y, w, PAL[bi], bi); return }
      if (q.t === 'v') { this.cloud(x, y, w, bi); return }
      const K = PT[q.t][bi];
      c.fillStyle = K.b; this.rr(x, y, w, 13, q.t === 'f' ? 3 : 6.5); c.fillStyle = K.hi; this.rr(x + 3, y + 1.5, w - 6, 4, 2); c.fillStyle = K.dk; this.rr(x + 4, y + 9, w - 8, 3, 1.5);
      c.strokeStyle = 'rgba(6,10,28,.6)'; c.lineWidth = 1.4; c.beginPath(); c.roundRect ? c.roundRect(x - .7, y - .7, w + 1.4, 14.4, 6.5) : c.rect(x - .7, y - .7, w + 1.4, 14.4); c.stroke();
      c.fillStyle = K.light ? '#0b1020' : '#fff';
      if (q.t === 'm') { this.tri(x + 6, y + 7, x + 12, y + 4, x + 12, y + 10); this.tri(x + w - 6, y + 7, x + w - 12, y + 4, x + w - 12, y + 10) }
      else if (q.t === 'u') { this.tri(cx - 8, y + 10, cx - 4, y + 5, cx, y + 10); this.tri(cx + 2, y + 5, cx + 6, y + 10, cx + 10, y + 5) }
      else if (q.t === 'f') { c.fillStyle = K.dk; c.fillRect(x + w / 3, y, 2, 13); c.fillRect(x + w * 2 / 3, y, 2, 13); c.strokeStyle = '#1c1917'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x + w * .45, y); c.lineTo(x + w * .52, y + 6); c.lineTo(x + w * .46, y + 13); c.stroke() }
      else {
        c.fillStyle = '#fde047'; for (let i = 0; i < w - 14; i += 14)c.fillRect(x + 8 + i, y + 6, 6, 4);
        c.fillStyle = '#111827'; c.beginPath(); c.arc(cx, y - 6, 5.5, 0, 6.3); c.fill(); c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.arc(cx - 2, y - 8, 1.7, 0, 6.3); c.fill();
        c.strokeStyle = '#fbbf24'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(cx + 2, y - 11); c.lineTo(cx + 6, y - 15); c.stroke();
        if (Math.sin(this.t * (q.fuse > 0 ? 42 : 6)) > 0) { c.fillStyle = '#fde047'; c.beginPath(); c.arc(cx + 7, y - 16, 2.6, 0, 6.3); c.fill() }
        if (q.fuse > 0 && q.fuse < .15) { c.fillStyle = 'rgba(255,255,255,.75)'; this.rr(x, y - 1, w, 15, 5) }
      }
    }
    cloud(x, y, w, bi) {
      const c = this.cx, K = CL[bi]; c.fillStyle = K[1]; this.rr(x + 2, y + 6, w - 4, 8, 4); c.fillStyle = K[0]; this.rr(x, y + 3, w, 9, 4.5);
      for (const [bx, r] of [[.25, 7], [.5, 9], [.75, 7]]) { c.beginPath(); c.arc(x + w * bx, y + 4, r, 0, 6.3); c.fill() }
      if (bi === 6) { c.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { const sx = x + w * (.2 + i * .3), sy = y + 2 + (i % 2) * 5, s = 1.4 + Math.sin(this.t * 5 + i * 2) * .9; c.fillRect(sx - s, sy - .5, s * 2, 1); c.fillRect(sx - .5, sy - s, 1, s * 2) } } // scintille
      else if (bi >= 3) { c.fillStyle = K[1]; for (const f of [.3, .55, .75]) { c.beginPath(); c.arc(x + w * f, y + 17 + (f * 10 % 3), 1.3, 0, 6.3); c.fill() } } // polvere che cade
    }
    drawPow(w) {
      const c = this.cx, x = w.x, y = w.y + Math.sin(this.t * 3 + w.x) * 3, col = { shield: '34,211,238', potion: '168,85,247', jet: '251,146,60' }[w.k], g = c.createRadialGradient(x, y, 2, x, y, 26);
      g.addColorStop(0, `rgba(${col},.6)`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.beginPath(); c.arc(x, y, 26, 0, 6.3); c.fill();
      if (w.k === 'shield') {
        c.beginPath(); c.moveTo(x - 12, y - 12); c.lineTo(x + 12, y - 12); c.lineTo(x + 12, y + 1); c.quadraticCurveTo(x + 10, y + 11, x, y + 16); c.quadraticCurveTo(x - 10, y + 11, x - 12, y + 1); c.closePath();
        c.fillStyle = '#22d3ee'; c.fill(); c.lineWidth = 2.2; c.lineJoin = 'round'; c.strokeStyle = '#0e7490'; c.stroke();
        c.fillStyle = '#a5f3fc'; c.beginPath(); c.moveTo(x, y - 12); c.lineTo(x + 12, y - 12); c.lineTo(x + 12, y + 1); c.quadraticCurveTo(x + 10, y + 11, x, y + 16); c.closePath(); c.fill(); // metà chiara
        c.fillStyle = '#0e7490'; c.fillRect(x - 1, y - 9, 2, 19); c.fillRect(x - 7, y - 3, 14, 2.2)
      } // croce
      else if (w.k === 'potion') {
        c.fillStyle = '#92400e'; this.rr(x - 3, y - 14, 6, 5, 1.5); c.fillStyle = '#e0f2fe'; this.rr(x - 3.5, y - 10, 7, 6, 1); c.fillStyle = '#a855f7'; c.beginPath(); c.arc(x, y + 3, 10, 0, 6.3); c.fill(); c.lineWidth = 2; c.strokeStyle = '#581c87'; c.stroke();
        c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.arc(x - 3.5, y, 2.6, 0, 6.3); c.fill(); c.beginPath(); c.arc(x + 3, y + 6, 1.6, 0, 6.3); c.fill()
      }
      else {
        c.fillStyle = '#ef4444'; this.rr(x - 11, y - 11, 9, 20, 3.5); this.rr(x + 2, y - 11, 9, 20, 3.5); c.fillStyle = '#cbd5e1'; this.rr(x - 11, y - 11, 9, 5, 2.5); this.rr(x + 2, y - 11, 9, 5, 2.5);
        const fl = 5 + Math.random() * 5; c.fillStyle = '#fb923c'; this.tri(x - 10, y + 9, x - 6.5, y + 9 + fl, x - 3, y + 9); this.tri(x + 3, y + 9, x + 6.5, y + 9 + fl, x + 10, y + 9)
      }
    }
    drawSpring(q) {
      const c = this.cx, k = 1 - (q.cp > 0 ? q.cp * 2.2 : 0), sp = this.spr.spring; if (sp) { c.drawImage(sp, q.x - 12, q.y - 22 * k, 24, 22 * k); return }
      const h = 16 * k, y0 = q.y - 2; c.fillStyle = '#475569'; this.rr(q.x - 11, y0 - 2, 22, 4, 2);
      c.strokeStyle = '#f59e0b'; c.lineWidth = 3; c.lineJoin = 'round'; c.beginPath(); c.moveTo(q.x - 8, y0 - 2); for (let i = 1; i <= 4; i++)c.lineTo(q.x + (i % 2 ? 8 : -8), y0 - 2 - h * i / 4); c.stroke();
      c.fillStyle = '#ef4444'; this.rr(q.x - 12, y0 - h - 7, 24, 6, 3); c.fillStyle = '#fca5a5'; this.rr(q.x - 9, y0 - h - 6, 18, 2, 1)
    }
    drawSpike(h) {
      const c = this.cx, sp = this.spr.spike; if (sp) { c.drawImage(sp, h.x - 22, h.y - 18, 44, 36); return }
      c.fillStyle = '#3f3f46'; this.rr(h.x - 25, h.y + 8, 50, 7, 3); c.fillStyle = '#f43f5e'; c.fillRect(h.x - 22, h.y + 11, 44, 2);
      for (let i = -1; i < 2; i++) { const x = h.x + i * 16; c.fillStyle = '#e5e7eb'; this.tri(x - 8, h.y + 9, x, h.y - 15, x, h.y + 9); c.fillStyle = '#9ca3af'; this.tri(x, h.y + 9, x, h.y - 15, x + 8, h.y + 9); c.fillStyle = '#fb7185'; this.tri(x - 2.4, h.y - 9, x, h.y - 15, x + 2.4, h.y - 9) }
    }
    drawHole(h) {
      const c = this.cx, sp = this.spr.blackhole; c.save(); c.translate(h.x, h.y);
      if (sp) { c.rotate(this.t * .8); c.drawImage(sp, -36, -36, 72, 72); c.restore(); return }
      c.strokeStyle = 'rgba(167,85,247,.16)'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, h.pull, 0, 6.3); c.stroke(); // area di attrazione
      const g = c.createRadialGradient(0, 0, 6, 0, 0, 54); g.addColorStop(0, 'rgba(167,85,247,.55)'); g.addColorStop(1, 'rgba(167,85,247,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 54, 0, 6.3); c.fill();
      for (let i = 0; i < 3; i++) { c.save(); c.rotate(this.t * (1.8 + i * .6) + i * 2); c.strokeStyle = ['#fbbf24', '#f472b6', '#a78bfa'][i]; c.lineWidth = 2.4; c.globalAlpha = .9 - i * .15; c.beginPath(); c.ellipse(0, 0, 25 + i * 7, 9 + i * 3, 0, .2, 4.4); c.stroke(); c.restore() }
      c.fillStyle = '#000'; c.beginPath(); c.arc(0, 0, 14, 0, 6.3); c.fill(); c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 1.5; c.stroke(); c.restore();
    }
    fxUpdate(dt) { // intensità della Nebulosa, ritmo della musica, stelle cadenti
      this.fq += ((this.fxq ? 1 : 0) - this.fq) * Math.min(1, dt * 2); // qualità effetti: transizione morbida (~0,5 s), mai di scatto
      const alt = Math.max(0, -this.cam), M = (window.CONFIG.MUSIC2_AT || 2900) * 10, F = window.CONFIG.MUSIC_FADE || 5;
      this.nb = clamp((alt - 22000) / 2500, 0, 1);
      if (-this.top >= M) this.mg = Math.min(1, this.mg + dt / F); // "climax": parte insieme alla musica 2, stessa durata della dissolvenza
      if (this.nb < .02) { this.lv = 0; return } // fuori dalla Nebulosa non si analizza l'audio
      const fx = this.o.fx ? this.o.fx() : [0, false]; this.lv = fx[0];
      if (this.rm || this.nb < .15) return;
      this.mt -= dt;
      if (this.mt <= 0 || (fx[1] && Math.random() < .55 + .3 * this.mg)) { this.meteor(); this.mt = (this.fxq ? 1.4 - .8 * this.mg : 2.6) * (.6 + Math.random() * .8) } // con la musica, una stella cadente ogni tanto a tempo
      for (const m of this.meteors) if (m.l > 0) { m.x += m.vx * dt; m.y += m.vy * dt; if (m.x < -160 || m.y > this.H + 160) m.l = 0 }
    }
    meteor() {
      const m = this.meteors.find(q => q.l <= 0); if (!m) return; const sp = 380 + Math.random() * 300, a = 2.5 + Math.random() * .5; // verso il basso a sinistra
      m.l = 1; m.x = 80 + Math.random() * (W + 140); m.y = -30 - Math.random() * 120; m.vx = Math.cos(a) * sp; m.vy = Math.sin(a) * sp; m.len = 70 + Math.random() * 70; m.h = [300, 190, 50, 150][Math.floor(Math.random() * 4)]
    }
    magicBack(alt, cam, H) { // dietro ai pianeti: bagliori che cambiano colore, aurora, galassia
      const nb = this.nb; if (nb < .02) return;
      const c = this.cx, T = this.rm ? 0 : this.t, mg = this.mg, lv = this.lv, hue = (T * 7) % 360;
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const [x, y, r, hs] of [[W * .25, .22, 300, 0], [W * .8, .55, 330, 70]]) { // pulsano col basso della musica
        const yy = (((y * H - cam * .03) % (H + 760)) + H + 760) % (H + 760) - 380, hh = (hue + hs + 260) % 360, g = c.createRadialGradient(x, yy, 0, x, yy, r);
        g.addColorStop(0, `hsla(${hh},90%,60%,${(.1 + .14 * mg + .22 * lv) * nb})`); g.addColorStop(1, `hsla(${hh},90%,60%,0)`); c.fillStyle = g; c.fillRect(0, 0, W, H)
      }
      for (let r = 0; r < 3; r++) { // aurora: nastri ondulati (i nastri 2 e 3 sfumano se il telefono è lento)
        if (r && this.fq < .02) continue;
        const Mr = H + 300, base = (((H * (.18 + .2 * r) - cam * .04) % Mr) + Mr) % Mr - 150, th = 46 + 26 * mg, col = ['52,211,153', '34,211,238', '192,132,252'][r], a = (.2 + .22 * mg + .25 * lv) * nb * (r ? this.fq : 1), up = [], lo = [];
        for (let x = -10; x <= W + 10; x += 20) { const y = base + Math.sin(x * .02 + T * (.45 + r * .15) + r * 2) * 26 + Math.sin(x * .007 - T * .3) * 16; up.push([x, y]); lo.push([x, y + th * (.7 + .3 * Math.sin(x * .03 + T + r))]) }
        const g = c.createLinearGradient(0, base - 40, 0, base + th + 40); g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(.5, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g; c.beginPath(); up.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); for (let i = lo.length - 1; i >= 0; i--) c.lineTo(lo[i][0], lo[i][1]); c.closePath(); c.fill()
      }
      if (this.fq > .02) { // galassia a spirale che ruota piano
        const cx = W * .74, cy = (((H * .3 - cam * .04) % (H + 300)) + H + 300) % (H + 300) - 150, rot = T * .12;
        for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 56; i++) { const an = i * .24 + arm * Math.PI + rot, rr = 5 + i * 2.7, d = i % 4 ? 1 : 2.2; c.globalAlpha = (1 - i / 56) * .55 * nb * this.fq * (.5 + .5 * mg + .3 * lv); c.fillStyle = i % 3 ? '#c7d2fe' : '#f0abfc'; c.fillRect(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr * .42, d, d) }
        c.globalAlpha = 1; const g = c.createRadialGradient(cx, cy, 0, cx, cy, 26); g.addColorStop(0, `rgba(255,240,255,${.5 * nb * this.fq})`); g.addColorStop(1, 'rgba(255,240,255,0)'); c.fillStyle = g; c.fillRect(cx - 30, cy - 30, 60, 60)
      }
      c.restore();
    }
    magicFront(alt, cam, H) { // davanti: cristalli, polvere magica, scintille, stelle cadenti
      const nb = this.nb; if (nb < .02) return;
      const c = this.cx, T = this.rm ? 0 : this.t, mg = this.mg, lv = this.lv, M = H + 160;
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const o of this.crystals) { // cristalli fluttuanti
        const y = (((o.y - cam * o.k - T * 6 * o.k) % M) + M) % M - 80, x = o.x + Math.sin(T * .4 + o.r) * 14, s = o.s * (1 + lv * .25);
        c.save(); c.translate(x, y); c.rotate(T * .3 + o.r); c.globalAlpha = (.38 + .2 * mg + .2 * lv) * nb; c.fillStyle = ['#a5b4fc', '#f0abfc', '#67e8f9'][o.r % 3];
        c.beginPath(); c.moveTo(0, -s); c.lineTo(s * .6, 0); c.lineTo(0, s); c.lineTo(-s * .6, 0); c.closePath(); c.fill();
        c.globalAlpha *= .8; c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -s); c.lineTo(s * .2, 0); c.lineTo(0, s * .3); c.lineTo(-s * .2, 0); c.closePath(); c.fill(); c.restore()
      }
      const nd = 28 + Math.round(18 * mg); // polvere magica che sale, colori che cambiano (le particelle extra sfumano se il telefono è lento)
      for (let i = 0; i < nd; i++) { const d = this.dust[i], y = (((d.y - cam * d.k - T * 10 * d.k) % M) + M) % M - 20, x = d.x + Math.sin(T * .6 + d.p) * 12;
        c.globalAlpha = Math.max(0, (.45 + .55 * Math.sin(T * 3 + d.p)) * nb * (.6 + .4 * mg) * (i < 14 ? 1 : this.fq)); c.fillStyle = `hsl(${(d.h + T * 12) % 360},90%,76%)`; c.beginPath(); c.arc(x, y, d.s * (1 + lv * .7), 0, 6.3); c.fill() }
      c.strokeStyle = '#fff'; c.lineWidth = 1; // scintille a 4 punte su alcune stelle
      for (let i = 0; i < 10; i++) { const s = this.stars[i], y = (((s.y - cam * .08) % (H + 20)) + H + 20) % (H + 20), L = 3 + 3 * Math.sin(T * 2 + i); c.globalAlpha = nb * .7 * (.5 + .5 * Math.sin(T * 2.3 + i * 1.7)); c.beginPath(); c.moveTo(s.x - L, y); c.lineTo(s.x + L, y); c.moveTo(s.x, y - L); c.lineTo(s.x, y + L); c.stroke() }
      for (const m of this.meteors) if (m.l > 0) { // stelle cadenti
        const sp = Math.hypot(m.vx, m.vy), tx = m.x - m.vx / sp * m.len, ty = m.y - m.vy / sp * m.len, g = c.createLinearGradient(m.x, m.y, tx, ty);
        g.addColorStop(0, `hsla(${m.h},100%,85%,${.95 * nb})`); g.addColorStop(1, `hsla(${m.h},100%,70%,0)`); c.globalAlpha = 1; c.strokeStyle = g; c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(m.x, m.y); c.lineTo(tx, ty); c.stroke();
        c.fillStyle = `hsla(${m.h},100%,92%,${nb})`; c.beginPath(); c.arc(m.x, m.y, 2.6, 0, 6.3); c.fill()
      }
      c.restore();
    }
    // ---- traccia della partita: il server la rigioca con la stessa fisica e decide il punteggio (anticheat)
    // per ogni fotogramma: [ms][flag: 1 sinistra, 2 destra, 4 tocco, 8 inclinazione, 16 cambio altezza schermo][int16 tocco*8 o inclinazione*1000][int16 altezza*10]
    rec(ms) {
      const k = this.keys, tc = this.tx != null, ti = this.o.tilt() ? 1 : 0, hq = Math.round(this.H * 10);
      if (tc) this.tx = Math.round(this.tx * 8) / 8; // gli ingressi vengono arrotondati: il gioco usa gli stessi valori che finiscono nella traccia
      if (ti) this.tiltV = Math.round(this.tiltV * 1000) / 1000;
      const ctrl = ((k.ArrowLeft || k.KeyA) ? 1 : 0) | ((k.ArrowRight || k.KeyD) ? 2 : 0) | (tc ? 4 : 0) | (ti ? 8 : 0) | (hq !== this.recH ? 16 : 0);
      if (this.recLen + 8 > this.recBuf.length) { const nb = new Uint8Array(this.recBuf.length * 2); nb.set(this.recBuf); this.recBuf = nb }
      const b = this.recBuf, dv = new DataView(b.buffer); let i = this.recLen;
      b[i++] = ms; b[i++] = ctrl;
      if (tc || ti) { dv.setInt16(i, tc ? Math.round(this.tx * 8) : Math.round(this.tiltV * 1000), true); i += 2 }
      if (ctrl & 16) { dv.setInt16(i, hq, true); i += 2; this.recH = hq }
      this.recLen = i; this.recN++
    }
    getTrace() { // intestazione [versione][altezza iniziale*10][n. fotogrammi] + fotogrammi
      const o = new Uint8Array(7 + this.recLen), dv = new DataView(o.buffer); o[0] = 1; dv.setUint16(1, this.H0q, true); dv.setUint32(3, this.recN, true); o.set(this.recBuf.subarray(0, this.recLen), 7); return o
    }
    drawEnemy(h) {
      const c = this.cx, p = this.p, sp = this.spr.enemy; c.save(); c.translate(h.x, h.y);
      if (sp) { c.rotate(Math.sin(this.t * 2 + h.ph) * .2); c.drawImage(sp, -20, -20, 40, 40); c.restore(); return }
      c.save(); c.rotate(this.t * 1.2 + h.ph); c.fillStyle = '#6b21a8'; for (let i = 0; i < 8; i++) { c.rotate(.785); this.tri(-4.5, -12, 0, -22, 4.5, -12) } c.restore();
      const g = c.createRadialGradient(-4, -5, 2, 0, 0, 16); g.addColorStop(0, '#f0abfc'); g.addColorStop(1, '#7e22ce'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 15, 0, 6.3); c.fill();
      c.lineWidth = 2; c.strokeStyle = '#4a044e'; c.stroke();
      const dx = p.x - h.x, dy = p.y - h.y, d = Math.hypot(dx, dy) || 1, ox = dx / d * 2, oy = dy / d * 2; // gli occhi seguono la palla
      c.fillStyle = '#fff'; for (const ex of [-5.5, 5.5]) { c.beginPath(); c.arc(ex, -2, 4.5, 0, 6.3); c.fill() }
      c.fillStyle = '#111'; for (const ex of [-5.5, 5.5]) { c.beginPath(); c.arc(ex + ox, -2 + oy, 2.1, 0, 6.3); c.fill() }
      c.strokeStyle = '#4a044e'; c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(-10, -9); c.lineTo(-2, -5.5); c.moveTo(10, -9); c.lineTo(2, -5.5); c.stroke();
      c.restore();
    }
    planet(b, x, y, r, al) {
      const c = this.cx; c.save(); c.globalAlpha = al;
      if (b === 'saturn') { c.strokeStyle = 'rgba(226,200,150,.5)'; c.lineWidth = 9; c.beginPath(); c.ellipse(x, y, r * 1.75, r * .45, -.3, 0, 6.3); c.stroke() }
      const col = { earth: ['#3b82f6', '#0b2a6b'], moon: ['#e5e7eb', '#6b7280'], mars: ['#f4a07a', '#8f2d14'], saturn: ['#f6e2b3', '#a8802f'] }[b], g = c.createRadialGradient(x - r * .35, y - r * .35, r * .1, x, y, r);
      g.addColorStop(0, col[0]); g.addColorStop(1, col[1]); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill();
      c.save(); c.beginPath(); c.arc(x, y, r, 0, 6.3); c.clip();
      const el = (bx, by, rx, ry, rot) => { c.beginPath(); c.ellipse(x + bx * r, y + by * r, rx * r, ry * r, rot || 0, 0, 6.3); c.fill() };
      if (b === 'earth') { c.fillStyle = '#4ade80';[[-.35, -.1, .28, .2], [.25, .2, .3, .22], [-.05, -.5, .2, .1], [.5, -.2, .12, .15]].forEach(v => el(...v, .5)); c.fillStyle = 'rgba(255,255,255,.55)';[[-.2, -.3], [.3, .05], [-.4, .35]].forEach(v => el(v[0], v[1], .3, .05, -.3)) }
      else if (b === 'moon') { c.fillStyle = 'rgba(75,85,99,.55)';[[-.3, -.2, .18], [.25, .1, .25], [-.05, .45, .14], [.45, -.35, .12]].forEach(v => el(v[0], v[1], v[2], v[2])) }
      else if (b === 'mars') { c.fillStyle = 'rgba(110,30,15,.45)';[[-.2, .1, .4, .18], [.3, -.2, .25, .15], [.1, .45, .3, .1]].forEach(v => el(...v, .2)); c.fillStyle = '#fff'; el(0, -.92, .35, .12) }
      else { c.fillStyle = 'rgba(150,110,40,.35)'; for (let i = -3; i <= 3; i++)c.fillRect(x - r, y + i * r * .28, 2 * r, r * .1) }
      c.restore();
      if (b === 'earth') { c.strokeStyle = 'rgba(125,200,255,.45)'; c.lineWidth = 6; c.beginPath(); c.arc(x, y, r + 2, 0, 6.3); c.stroke() }
      if (b === 'saturn') { c.strokeStyle = 'rgba(226,200,150,.8)'; c.lineWidth = 9; c.beginPath(); c.ellipse(x, y, r * 1.75, r * .45, -.3, 0, Math.PI); c.stroke() }
      c.restore();
    }
    scenery(alt, cam, H) { // sfondo "dietro": nebulosa, pianeti, asteroidi, satelliti (parallasse e dissolvenza per quota)
      const c = this.cx, M = H + 200;
      const na = clamp((alt - 21500) / 3000, 0, 1);
      if (na > .02) for (const [nx, ny, nr, col] of [[90, .3, 260, '168,85,247'], [320, .6, 300, '236,72,153'], [200, .85, 260, '34,211,238']]) { const yy = (((ny * H - cam * .05) % (H + 760)) + H + 760) % (H + 760) - 380, g = c.createRadialGradient(nx, yy, 0, nx, yy, nr); g.addColorStop(0, `rgba(${col},${.28 * na})`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.fillRect(0, 0, W, H) }
      this.magicBack(alt, cam, H);
      for (const [b, ba, bx, br, k] of BODIES) { const al = clamp(1 - Math.abs(alt - ba) / 3600, 0, 1); if (al <= 0) continue; const y = H * .62 + (ba - alt) * k; if (y > -br * 1.8 && y < H + br * 1.8) this.planet(b, bx, y, br, b === 'earth' ? al * .8 : al) }
      const aa = clamp(Math.min((alt - 14500) / 1500, (20500 - alt) / 1500), 0, 1);
      if (aa > .02) for (const o of this.rocks) {
        const y = (((o.y - cam * o.k) % M) + M) % M - 100, x = (((o.x + this.t * o.dx) % (W + 100)) + W + 100) % (W + 100) - 50;
        c.save(); c.globalAlpha = aa * .9; c.translate(x, y); c.rotate(o.rot + this.t * o.sp); c.fillStyle = '#6b5a4a'; c.beginPath(); o.pts.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,255,255,.14)'; c.beginPath(); c.arc(-o.r * .25, -o.r * .25, o.r * .35, 0, 6.3); c.fill(); c.restore()
      }
      const sa = clamp(Math.min((alt - 6200) / 1200, (12800 - alt) / 1200), 0, 1);
      if (sa > .02) for (const o of this.sats) {
        const y = (((o.y - cam * o.k) % M) + M) % M - 100, x = (((o.x + this.t * o.dx) % (W + 100)) + W + 100) % (W + 100) - 50;
        c.save(); c.globalAlpha = sa; c.translate(x, y); c.rotate(Math.sin(this.t * .5 + o.rot) * .5); c.scale(o.sc, o.sc); c.fillStyle = '#d4af37'; c.fillRect(-6, -5, 12, 10); c.fillStyle = '#2563eb'; c.fillRect(-26, -4, 18, 8); c.fillRect(8, -4, 18, 8);
        c.strokeStyle = '#93c5fd'; c.lineWidth = 1; c.beginPath(); for (let i = -24; i < -8; i += 5) { c.moveTo(i, -4); c.lineTo(i, 4); c.moveTo(i + 34, -4); c.lineTo(i + 34, 4) } c.stroke(); c.fillStyle = '#e5e7eb'; c.beginPath(); c.arc(0, -8, 3, 0, 6.3); c.fill(); c.restore()
      }
    }
    draw() {
      const c = this.cx, p = this.p, H = this.H, cam = this.cam, alt = Math.max(0, -cam), altB = Math.max(0, -(cam + H));
      c.setTransform(this.k, 0, 0, this.k, 0, 0);
      if (this.shake > 0) c.translate((Math.random() - .5) * 12 * this.shake, (Math.random() - .5) * 12 * this.shake);
      const g = c.createLinearGradient(0, 0, 0, H), a = this.skyAt(alt), b = this.skyAt(altB);
      g.addColorStop(0, `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`); g.addColorStop(1, `rgb(${b[0] | 0},${b[1] | 0},${b[2] | 0})`); c.fillStyle = g; c.fillRect(-20, -20, W + 40, H + 40);
      const st = clamp((alt - 5600) / 1400, 0, 1); // stelle
      if (st > .02) { c.fillStyle = '#fff'; for (const s of this.stars) { c.globalAlpha = st * (.55 + .45 * Math.sin(this.t * 2 + s.x)); c.fillRect(s.x, (((s.y - cam * .08) % (H + 20)) + H + 20) % (H + 20), s.r, s.r) } c.globalAlpha = 1 }
      this.scenery(alt, cam, H);
      this.magicFront(alt, cam, H);
      const ca = clamp(1 - alt / 6200, 0, 1); // nuvole in parallasse, svaniscono salendo
      if (ca > .02) {
        c.fillStyle = '#fff'; c.globalAlpha = ca * .85; const M = H + 160;
        for (const o of this.clouds) {
          const y = (((o.y - cam * o.k) % M) + M) % M - 80, x = (((o.x + this.t * 6 * o.k) % (W + 120)) + W + 120) % (W + 120) - 60, s = o.s;
          c.beginPath(); c.arc(x, y, 13 * s, 0, 6.3); c.arc(x + 16 * s, y - 7 * s, 17 * s, 0, 6.3); c.arc(x + 36 * s, y, 12 * s, 0, 6.3); c.arc(x + 18 * s, y + 4 * s, 13 * s, 0, 6.3); c.fill()
        } c.globalAlpha = 1
      }
      c.translate(0, -cam);
      if (cam + H > -60) this.ground();
      for (const q of this.items) { c.globalAlpha = q.fade !== undefined ? Math.max(0, q.fade / .3) : 1; this.drawPlat(q); if (q.sp) this.drawSpring(q) }
      c.globalAlpha = 1;
      for (const w of this.pows) this.drawPow(w);
      for (const h of this.haz) h.t === 's' ? this.drawSpike(h) : h.t === 'b' ? this.drawHole(h) : this.drawEnemy(h);
      for (const q of this.parts) if (q.l > 0) { c.globalAlpha = q.l; c.fillStyle = q.c || '#fff'; c.beginPath(); c.arc(q.x, q.y, 3, 0, 6.3); c.fill() }
      c.globalAlpha = 1;
      const sq = clamp(Math.abs(p.vy) / 1800, 0, .22), sx = p.sq > 0 ? 1 + p.sq * .6 : 1 - sq * .5, sy = p.sq > 0 ? 1 - p.sq * .6 : 1 + sq;
      c.save(); c.translate(p.x, p.y + (p.sq > 0 ? R * p.sq * .6 : 0)); c.scale(sx, sy);
      if (this.inv > 0 && this.jet <= 0 && Math.floor(this.t * 14) % 2) c.globalAlpha = .45; // lampeggia durante l'invulnerabilità
      if (this.jet > 0) {
        c.fillStyle = '#ef4444'; this.rr(-R - 6, -5, 7, 15, 3); this.rr(R - 1, -5, 7, 15, 3); c.fillStyle = '#cbd5e1'; this.rr(-R - 6, -5, 7, 4, 2); this.rr(R - 1, -5, 7, 4, 2);
        const fl = 8 + Math.random() * 9; c.fillStyle = '#fb923c'; this.tri(-R - 5, 10, -R - 2.5, 10 + fl, -R, 10); this.tri(R, 10, R + 2.5, 10 + fl, R + 5, 10); c.fillStyle = '#fde047'; this.tri(-R - 4, 10, -R - 2.5, 10 + fl * .55, -R - 1, 10); this.tri(R + 1, 10, R + 2.5, 10 + fl * .55, R + 4, 10)
      }
      const gb = c.createRadialGradient(-5, -5, 2, 0, 0, R); gb.addColorStop(0, '#fff'); gb.addColorStop(1, '#93c5fd');
      c.fillStyle = gb; c.beginPath(); c.arc(0, 0, R, 0, 6.3); c.fill();
      c.save(); c.beginPath(); c.arc(0, 0, R - 2, 0, 6.3); c.clip(); c.rotate(p.rot * .25);
      if (this.logo.complete && this.logo.naturalWidth) c.drawImage(this.logo, -R + 2, -R + 2, 2 * R - 4, 2 * R - 4); c.restore();
      if (this.shield > 0 && (this.shield > 3 || Math.floor(this.t * 8) % 2)) { const pu = .5 + .5 * Math.sin(this.t * 6); c.fillStyle = `rgba(103,232,249,${.14 + .1 * pu})`; c.beginPath(); c.arc(0, 0, R + 7, 0, 6.3); c.fill(); c.strokeStyle = `rgba(103,232,249,${.7 + .3 * pu})`; c.lineWidth = 2.5; c.stroke() }
      if (this.god) { c.strokeStyle = 'rgba(250,204,21,.9)'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, R + 4, 0, 6.3); c.stroke() }
      c.lineWidth = 2; c.strokeStyle = '#1e3a8a'; c.beginPath(); c.arc(0, 0, R, 0, 6.3); c.stroke(); c.restore();
    }
  }
  window.Game = Game; Game.VER = 'r1'; // cambia questo valore se modifichi fisica o generazione (gen.js, game.js): il server rigioca le partite con la STESSA versione
})();
