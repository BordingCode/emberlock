// Procedural Web Audio for Emberlock — no files. Dark, smouldering palette:
// low sine "whoomps", filtered-noise crackle, a slow minor pad for music.
// Unlocked on first user gesture (resumeAudio from any pointerdown).
let ctx = null;
let master = null;
let musicGain = null;
let muted = false;
let musicTimer = null;
let sfxOn = true;
let musicTarget = 0;
export function setSfx(b) { sfxOn = b; }
export function getSfx() { return sfxOn; }

function duck(depth = 0.5, dur = 0.28) {
  if (!ctx || !musicGain || musicTarget <= 0) return;
  const now = ctx.currentTime;
  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setTargetAtTime(musicTarget * (1 - depth), now, 0.02);
  musicGain.gain.setTargetAtTime(musicTarget, now + dur, 0.18);
}

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.0;
    musicGain.connect(master);
  } catch (e) { ctx = null; }
}

export function resumeAudio() {
  if (!ctx) initAudio();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.6, ctx.currentTime, 0.05);
  return muted;
}
export function isMuted() { return muted; }

function noiseBuf(dur) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function tone(freq, dur, { type = 'sine', gain = 0.3, slideTo = null, delay = 0, attack = 0.005, dest = null } = {}) {
  if (!ctx) return;
  if (!sfxOn && !dest) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest || master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(dur, { gain = 0.3, type = 'highpass', freq = 1200, q = 0.7, delay = 0 } = {}) {
  if (!ctx || !sfxOn) return;
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf(dur);
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0); src.stop(t0 + dur + 0.02);
}

// ---- SFX ----
let lastCast = 0, lastSizzle = 0;
export const sfx = {
  cast() { // fireball leaves the hand: airy whoosh + ember crackle
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - lastCast < 0.05) return; lastCast = now;
    const v = 1 + (Math.random() - 0.5) * 0.08;
    noise(0.16, { gain: 0.16, type: 'bandpass', freq: 1500 * v, q: 1.2 });
    tone(220 * v, 0.14, { type: 'triangle', gain: 0.08, slideTo: 520 * v });
  },
  charge() { tone(180, 0.18, { type: 'sine', gain: 0.05, slideTo: 360 }); },
  shove() { // the core hit: weighty thud + ember spray
    const v = 1 + (Math.random() - 0.5) * 0.1;
    tone(140 * v, 0.16, { type: 'sine', gain: 0.3, slideTo: 60 * v });
    tone(280 * v, 0.08, { type: 'square', gain: 0.06, slideTo: 120 * v });
    noise(0.12, { gain: 0.14, type: 'highpass', freq: 2400 });
  },
  sizzle() { // burning in lava, throttled tick
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - lastSizzle < 0.22) return; lastSizzle = now;
    noise(0.18, { gain: 0.1, type: 'bandpass', freq: 3400, q: 1.6 });
  },
  lavaDeath() { // the money moment: deep whoomp + fire roar
    duck(0.6, 0.6);
    tone(70, 0.7, { type: 'sine', gain: 0.45, slideTo: 26 });
    noise(0.6, { gain: 0.4, type: 'lowpass', freq: 700, q: 0.5 });
    noise(0.45, { gain: 0.18, type: 'bandpass', freq: 2400, q: 1.0, delay: 0.05 });
  },
  dash() { noise(0.16, { gain: 0.18, type: 'bandpass', freq: 2000, q: 2 }); tone(440, 0.15, { type: 'sawtooth', gain: 0.06, slideTo: 980 }); },
  nova() { duck(0.4, 0.3); tone(110, 0.4, { type: 'sine', gain: 0.3, slideTo: 45 }); noise(0.3, { gain: 0.25, type: 'lowpass', freq: 1100 }); },
  mineDrop() { tone(330, 0.1, { type: 'square', gain: 0.07, slideTo: 220 }); },
  mineBeep() { tone(990, 0.07, { type: 'square', gain: 0.1 }); },
  mineBoom() { duck(0.45, 0.35); tone(95, 0.45, { type: 'sine', gain: 0.32, slideTo: 38 }); noise(0.35, { gain: 0.3, type: 'lowpass', freq: 900 }); },
  hook() { tone(700, 0.12, { type: 'sawtooth', gain: 0.09, slideTo: 1500 }); noise(0.1, { gain: 0.1, type: 'highpass', freq: 3000 }); },
  hookHit() { tone(520, 0.14, { type: 'square', gain: 0.12, slideTo: 180 }); },
  ward() { tone(880, 0.25, { type: 'sine', gain: 0.16, slideTo: 1320 }); tone(440, 0.2, { type: 'triangle', gain: 0.08 }); },
  hurt() { duck(0.5, 0.3); tone(200, 0.2, { type: 'sawtooth', gain: 0.18, slideTo: 70 }); },
  danger() { duck(0.45, 0.5); tone(150, 0.55, { type: 'sine', gain: 0.15, slideTo: 88 }); },
  roundWin() { [293.66, 369.99, 440, 587.33].forEach((f, i) => tone(f, 0.4, { type: 'triangle', gain: 0.14, delay: i * 0.09 })); },
  roundLose() { [293.66, 261.63, 220, 174.61].forEach((f, i) => tone(f, 0.45, { type: 'sawtooth', gain: 0.1, delay: i * 0.12, slideTo: f * 0.7 })); },
  matchWin() { [293.66, 440, 587.33, 880, 1174.7].forEach((f, i) => tone(f, 0.55, { type: 'sine', gain: 0.16, delay: i * 0.11 })); },
  runOver() { duck(0.7, 1.2); [220, 196, 174.61, 146.83, 110].forEach((f, i) => tone(f, 0.8, { type: 'sawtooth', gain: 0.12, delay: i * 0.2, slideTo: f * 0.6 })); },
  buy() { tone(587, 0.12, { type: 'sine', gain: 0.14, slideTo: 880 }); tone(880, 0.14, { type: 'sine', gain: 0.08, delay: 0.06 }); },
  pick() { tone(440, 0.16, { type: 'triangle', gain: 0.13, slideTo: 660 }); },
  emberSeal() { duck(0.6, 0.55); tone(130, 0.55, { type: 'sawtooth', gain: 0.15, slideTo: 85 }); tone(390, 0.5, { type: 'sine', gain: 0.07, delay: 0.05, slideTo: 540 }); },
  countTick() { tone(440, 0.07, { type: 'sine', gain: 0.1 }); },
  countGo() { tone(660, 0.2, { type: 'sine', gain: 0.16, slideTo: 880 }); },
};

// ---- Music: slow smouldering D-minor pad ----
const scale = [146.83, 174.61, 196.0, 220.0, 261.63, 293.66]; // D F G A C D
let musicStep = 0;
export function startMusic() {
  if (!ctx || musicTimer) return;
  musicTarget = 0.45;
  musicGain.gain.setTargetAtTime(0.45, ctx.currentTime, 1.5);
  const beat = () => {
    if (!ctx) return;
    const root = scale[musicStep % scale.length];
    tone(root, 2.6, { type: 'sine', gain: 0.06, attack: 0.7, dest: musicGain });
    tone(root / 2, 3.0, { type: 'sine', gain: 0.05, attack: 0.9, dest: musicGain });
    if (musicStep % 2 === 1) tone(root * 1.5, 2.0, { type: 'triangle', gain: 0.028, attack: 0.5, dest: musicGain });
    musicStep++;
    musicTimer = setTimeout(beat, 1900);
  };
  beat();
}
// Adaptive tension layer: a low heartbeat while the island is small (endgame pressure)
let pulseTimer = null;
export function setPulse(on) {
  if (!ctx) return;
  if (!on) { if (pulseTimer) { clearTimeout(pulseTimer); pulseTimer = null; } return; }
  if (pulseTimer) return;
  const beat = () => {
    if (!ctx || !pulseTimer) return;
    tone(58, 0.45, { type: 'sine', gain: 0.12, attack: 0.01, dest: musicGain });
    tone(88, 0.25, { type: 'triangle', gain: 0.04, delay: 0.18, dest: musicGain });
    pulseTimer = setTimeout(beat, 660);
  };
  pulseTimer = setTimeout(beat, 1);
}
export function setMusicIntensity(x) {
  musicTarget = 0.35 + x * 0.35;
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(musicTarget, ctx.currentTime, 0.8);
}
export function stopMusic() {
  if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
  setPulse(false);
  musicTarget = 0;
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
}
