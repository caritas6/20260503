'use strict';

// ── Palette & config ──────────────────────────────────────────────────────────

const BG   = '#050508';
const CYAN = '#00ffd1';
const PINK = '#ff2d6d';

const CFG = {
  count:       180,
  attractF:    0.038,
  repelF:      4.2,
  maxSpeed:    5.5,
  friction:    0.963,
  connectDist: 115,
  mouseR:      200,
  trailAlpha:  0.13,
};

// ── Canvas setup ──────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
let W, H;

function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
}

// ── State ─────────────────────────────────────────────────────────────────────

const mouse = { x: 0, y: 0, down: false };
let particles = [];
let texts     = [];
let overlays  = [];

// ── Particle ─────────────────────────────────────────────────────────────────

class Particle {
  constructor(x, y, opts = {}) {
    this.x       = x;
    this.y       = y;
    this.vx      = opts.vx      ?? (Math.random() - 0.5) * 2.5;
    this.vy      = opts.vy      ?? (Math.random() - 0.5) * 2.5;
    this.size    = opts.size    ?? 1.5 + Math.random() * 2;
    this.color   = opts.color   ?? CYAN;
    this.alpha   = opts.alpha   ?? 1;
    this.baseA   = this.alpha;
    this.life    = opts.life    ?? null;
    this.age     = 0;
    this.connect = opts.connect ?? true;
  }

  update() {
    const dx   = mouse.x - this.x;
    const dy   = mouse.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 0 && dist < CFG.mouseR) {
      const t  = 1 - dist / CFG.mouseR;
      const nx = dx / dist;
      const ny = dy / dist;
      if (mouse.down) {
        this.vx -= nx * CFG.repelF * t;
        this.vy -= ny * CFG.repelF * t;
      } else {
        this.vx += nx * CFG.attractF * t * (dist * 0.6);
        this.vy += ny * CFG.attractF * t * (dist * 0.6);
      }
    }

    this.vx *= CFG.friction;
    this.vy *= CFG.friction;

    const spd = Math.hypot(this.vx, this.vy);
    if (spd > CFG.maxSpeed) {
      this.vx = this.vx / spd * CFG.maxSpeed;
      this.vy = this.vy / spd * CFG.maxSpeed;
    }

    this.x += this.vx;
    this.y += this.vy;

    if (this.x < -10) this.x = W + 10;
    else if (this.x > W + 10) this.x = -10;
    if (this.y < -10) this.y = H + 10;
    else if (this.y > H + 10) this.y = -10;

    if (this.life !== null) {
      this.age++;
      this.alpha = this.baseA * Math.max(0, 1 - this.age / this.life);
    }
  }

  draw() {
    if (this.alpha < 0.01) return;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.shadowBlur  = 10;
    ctx.shadowColor = this.color;
    ctx.fillStyle   = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  dead() { return this.life !== null && this.age >= this.life; }
}

// ── Floating text ─────────────────────────────────────────────────────────────

class FloatingText {
  constructor(text, x, y, opts = {}) {
    this.text  = text;
    this.x     = x;
    this.y     = y;
    this.alpha = 0;
    this.scale = 0.2;
    this.phase = 'in';
    this.hold  = 0;
    this.maxHold = opts.holdFrames ?? 35;
    this.color = opts.color ?? (Math.random() > 0.5 ? PINK : '#ffffff');
    this.fs    = opts.fontSize ?? (60 + Math.random() * 130);
  }

  update() {
    if (this.phase === 'in') {
      this.alpha = Math.min(1, this.alpha + 0.1);
      this.scale = Math.min(1, this.scale + 0.09);
      if (this.alpha >= 1) this.phase = 'hold';
    } else if (this.phase === 'hold') {
      if (++this.hold >= this.maxHold) this.phase = 'out';
    } else {
      this.alpha -= 0.033;
      this.scale += 0.011;
    }
  }

  draw() {
    if (this.alpha < 0.01) return;
    ctx.save();
    ctx.globalAlpha  = this.alpha;
    ctx.translate(this.x, this.y);
    ctx.scale(this.scale, this.scale);
    ctx.font         = `bold ${this.fs}px 'Courier New', monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur   = 55;
    ctx.shadowColor  = this.color;
    ctx.fillStyle    = this.color;
    ctx.fillText(this.text, 0, 0);
    ctx.restore();
  }

  dead() { return this.phase === 'out' && this.alpha < 0.01; }
}

// ── Image overlay (brief flash) ───────────────────────────────────────────────

class ImageOverlay {
  constructor(img, x, y, w, h) {
    this.img   = img;
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.alpha = 0;
    this.phase = 'in';
    this.hold  = 0;
  }

  update() {
    if (this.phase === 'in') {
      this.alpha = Math.min(0.65, this.alpha + 0.065);
      if (this.alpha >= 0.65) this.phase = 'hold';
    } else if (this.phase === 'hold') {
      if (++this.hold > 45) this.phase = 'out';
    } else {
      this.alpha -= 0.025;
    }
  }

  draw() {
    if (this.alpha < 0.01) return;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.drawImage(this.img, this.x, this.y, this.w, this.h);
    ctx.restore();
  }

  dead() { return this.phase === 'out' && this.alpha < 0.01; }
}

// ── Connections ───────────────────────────────────────────────────────────────

function drawConnections() {
  const pool = particles.filter(p => p.connect && p.alpha > 0.15);
  const n    = pool.length;
  for (let i = 0; i < n; i++) {
    const a = pool[i];
    for (let j = i + 1; j < n; j++) {
      const b = pool[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d >= CFG.connectDist) continue;
      const t = 1 - d / CFG.connectDist;
      ctx.save();
      ctx.globalAlpha = t * 0.3 * Math.min(a.alpha, b.alpha);
      ctx.strokeStyle = (a.color === CYAN && b.color === CYAN) ? CYAN : PINK;
      ctx.lineWidth   = 0.5;
      ctx.shadowBlur  = 4;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ── Burst ─────────────────────────────────────────────────────────────────────

function burst(x, y, color, n = 50) {
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const spd   = 2 + Math.random() * 7;
    particles.push(new Particle(x, y, {
      vx:      Math.cos(angle) * spd,
      vy:      Math.sin(angle) * spd,
      size:    1 + Math.random() * 2.5,
      color,
      alpha:   0.95,
      life:    55 + Math.floor(Math.random() * 50),
      connect: false,
    }));
  }
}

// ── Image → particles ─────────────────────────────────────────────────────────

function handleImage(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const aspect = img.width / img.height;
      let dw = W * 0.62, dh = dw / aspect;
      if (dh > H * 0.62) { dh = H * 0.62; dw = dh * aspect; }
      const dx = (W - dw) / 2;
      const dy = (H - dh) / 2;

      overlays.push(new ImageOverlay(img, dx, dy, dw, dh));

      // Sample pixels at reduced resolution and create particles
      const sw = 96, sh = Math.round(sw / aspect);
      const off  = Object.assign(document.createElement('canvas'), { width: sw, height: sh });
      const octx = off.getContext('2d');
      octx.drawImage(img, 0, 0, sw, sh);
      const { data } = octx.getImageData(0, 0, sw, sh);

      for (let py = 0; py < sh; py += 2) {
        for (let px = 0; px < sw; px += 2) {
          const i = (py * sw + px) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 40 || (r + g + b) < 25) continue;

          particles.push(new Particle(
            dx + (px / sw) * dw,
            dy + (py / sh) * dh,
            {
              vx:      (Math.random() - 0.5) * 3,
              vy:      (Math.random() - 0.5) * 3,
              size:    1.5 + Math.random() * 2,
              color:   `rgb(${r},${g},${b})`,
              alpha:   0.92,
              life:    200 + Math.floor(Math.random() * 120),
              connect: false,
            }
          ));
        }
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ── Init / reset ──────────────────────────────────────────────────────────────

function initParticles() {
  for (let i = particles.length; i < CFG.count; i++) {
    particles.push(new Particle(Math.random() * W, Math.random() * H));
  }
}

function reset() {
  particles = particles.filter(p => p.life === null);
  texts     = [];
  overlays  = [];
  // Brief white flash to signal reset
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// ── Main loop ─────────────────────────────────────────────────────────────────

function animate() {
  requestAnimationFrame(animate);

  ctx.fillStyle = `rgba(5,5,8,${CFG.trailAlpha})`;
  ctx.fillRect(0, 0, W, H);

  overlays   = overlays.filter(o => !o.dead());
  overlays.forEach(o => { o.update(); o.draw(); });

  drawConnections();

  particles  = particles.filter(p => !p.dead());
  particles.forEach(p => { p.update(); p.draw(); });

  texts      = texts.filter(t => !t.dead());
  texts.forEach(t => { t.update(); t.draw(); });
}

// ── Events ────────────────────────────────────────────────────────────────────

window.addEventListener('resize', resize);

canvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener('mousedown',  () => { mouse.down = true; });
canvas.addEventListener('mouseup',    () => { mouse.down = false; });
canvas.addEventListener('mouseleave', () => { mouse.down = false; });

document.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); reset(); return; }

  const key = e.key.toUpperCase();
  if (/^[A-Z]$/.test(key)) {
    const x     = mouse.x || W / 2;
    const y     = mouse.y || H / 2;
    const color = Math.random() > 0.5 ? PINK : CYAN;
    texts.push(new FloatingText(key, x, y, { color }));
    burst(x, y, color);
  }
});

// Drag & drop
const dragOverlay = (() => {
  const el = document.createElement('div');
  el.id = 'drag-overlay';
  el.textContent = 'DROP IMAGE';
  document.body.appendChild(el);
  return el;
})();

let dragDepth = 0;

document.addEventListener('dragenter', e => {
  if ([...e.dataTransfer.types].includes('Files')) {
    dragDepth++;
    dragOverlay.classList.add('visible');
  }
});

document.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    dragOverlay.classList.remove('visible');
  }
});

document.addEventListener('dragover', e => e.preventDefault());

document.addEventListener('drop', e => {
  e.preventDefault();
  dragDepth = 0;
  dragOverlay.classList.remove('visible');
  [...e.dataTransfer.files]
    .filter(f => f.type.startsWith('image/'))
    .forEach(handleImage);
});

// ── Boot ──────────────────────────────────────────────────────────────────────

resize();
ctx.fillStyle = BG;
ctx.fillRect(0, 0, W, H);
initParticles();

// Intro title
texts.push(new FloatingText('ECHO CANVAS', W / 2, H / 2, {
  fontSize:   68,
  color:      CYAN,
  holdFrames: 90,
}));

animate();
