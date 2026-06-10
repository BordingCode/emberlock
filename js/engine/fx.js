// Visual feedback: particle bursts, trauma-model screenshake, floating damage numbers,
// ring shockwaves, and a short hit-pause (freeze) timer. Pure data + draw; the world
// triggers events, render draws them.
import { Pool } from './pool.js';
import { TAU, clamp } from './vec.js';

export const FX = {
  trauma: 0,           // 0..1, decays each frame; shake = trauma^2
  shakeX: 0, shakeY: 0,
  freeze: 0,           // seconds of hit-pause remaining
  flash: 0,            // full-screen flash alpha 0..1
  flashColor: '255,255,255',
  reducedMotion: false,
  _seed: 1337,
};

const parts = new Pool(
  () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 2, color: '#fff', glow: false, drag: 0.92, grav: 0 }),
  (o) => { o.life = 0; }
);
const rings = new Pool(
  () => ({ alive: false, x: 0, y: 0, r: 0, max: 40, life: 0, dur: 0.4, color: '#fff', width: 3 }),
  (o) => { o.life = 0; }
);
const floats = new Pool(
  () => ({ alive: false, x: 0, y: 0, vy: -30, life: 0, dur: 0.8, text: '', color: '#fff', size: 18, crit: false }),
  (o) => { o.life = 0; }
);

// deterministic-ish noise for shake (value noise), avoids Math.random in sim
function noise(t) {
  const s = Math.sin(t * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

export function addTrauma(v) { FX.trauma = clamp(FX.trauma + v, 0, 1); }
export function hitStop(sec) { if (!FX.reducedMotion) FX.freeze = Math.max(FX.freeze, sec); }
export function screenFlash(a, color = '255,255,255') { if (!FX.reducedMotion) { FX.flash = Math.max(FX.flash, a); FX.flashColor = color; } }

export function burst(x, y, n, opts = {}) {
  const { color = '#34f5ff', speed = 140, spread = TAU, dir = 0, r = 2.4, life = 0.5, glow = true, grav = 0, drag = 0.9 } = opts;
  for (let i = 0; i < n; i++) {
    const a = dir + (Math.random() - 0.5) * spread;
    const sp = speed * (0.4 + Math.random() * 0.8);
    parts.spawn((p) => {
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.life = 0; p.max = life * (0.6 + Math.random() * 0.7);
      p.r = r * (0.6 + Math.random() * 0.8);
      p.color = color; p.glow = glow; p.grav = grav; p.drag = drag;
    });
  }
}

export function shockwave(x, y, opts = {}) {
  const { color = '#fff', max = 60, dur = 0.4, width = 3 } = opts;
  rings.spawn((o) => { o.x = x; o.y = y; o.r = 0; o.max = max; o.life = 0; o.dur = dur; o.color = color; o.width = width; });
}

export function floatText(x, y, text, opts = {}) {
  const { color = '#fff', size = 18, crit = false } = opts;
  floats.spawn((o) => {
    o.x = x + (Math.random() - 0.5) * 14; o.y = y; o.vy = -34 - Math.random() * 20;
    o.life = 0; o.dur = crit ? 1.0 : 0.8; o.text = text; o.color = color; o.size = size; o.crit = crit;
  });
}

export function updateFX(dt) {
  FX.trauma = Math.max(0, FX.trauma - dt * 1.4);
  FX._seed += dt * 60;
  const t = FX._seed;
  const shake = FX.reducedMotion ? 0 : FX.trauma * FX.trauma * 26;
  FX.shakeX = noise(t) * shake;
  FX.shakeY = noise(t + 99.7) * shake;
  FX.flash = Math.max(0, FX.flash - dt * 3.2);

  parts.forEach((p) => {
    p.life += dt;
    if (p.life >= p.max) { p.alive = false; return; }
    p.vy += p.grav * dt;
    p.vx *= Math.pow(p.drag, dt * 60);
    p.vy *= Math.pow(p.drag, dt * 60);
    p.x += p.vx * dt; p.y += p.vy * dt;
  });
  rings.forEach((o) => {
    o.life += dt;
    if (o.life >= o.dur) { o.alive = false; return; }
    const k = o.life / o.dur;
    o.r = o.max * (1 - Math.pow(1 - k, 2));
  });
  floats.forEach((o) => {
    o.life += dt;
    if (o.life >= o.dur) { o.alive = false; return; }
    o.y += o.vy * dt; o.vy *= 0.9;
  });
}

export function drawFX(ctx) {
  ctx.save();
  // rings
  rings.forEach((o) => {
    const k = o.life / o.dur;
    ctx.globalAlpha = (1 - k) * 0.9;
    ctx.strokeStyle = o.color;
    ctx.lineWidth = o.width * (1 - k * 0.5);
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, TAU); ctx.stroke();
  });
  // particles — additive glow via layered circles (NO shadowBlur: too slow on mobile)
  ctx.globalCompositeOperation = 'lighter';
  parts.forEach((p) => {
    const k = 1 - p.life / p.max;
    const r = p.r * (0.4 + k * 0.6);
    ctx.fillStyle = p.color;
    if (p.glow) { ctx.globalAlpha = k * 0.35; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.1, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = k;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
  });
  ctx.globalCompositeOperation = 'source-over';
  // floating numbers — cheap dark outline instead of shadowBlur
  ctx.textAlign = 'center';
  floats.forEach((o) => {
    const k = o.life / o.dur;
    ctx.globalAlpha = k < 0.15 ? k / 0.15 : (1 - (k - 0.15) / 0.85) * 0.9 + 0.1;
    const sc = o.crit ? 1 + (1 - Math.min(k * 4, 1)) * 0.6 : 1;
    ctx.font = `900 ${o.size * sc}px Cinzel, serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,3,15,0.85)';
    ctx.strokeText(o.text, o.x, o.y);
    ctx.fillStyle = o.color;
    ctx.fillText(o.text, o.x, o.y);
  });
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function clearFX() { parts.clear(); rings.clear(); floats.clear(); FX.trauma = 0; FX.freeze = 0; FX.flash = 0; }
