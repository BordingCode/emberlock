// All drawing. Reads the sim, never mutates it (squash/smear are draw-time only).
// "High-end" look = lighting: lava is the light source, additive glow everywhere
// bright, cool basalt island so the heat reads by contrast. No shadowBlur (slow).
import { TAU, clamp } from '../engine/vec.js';
import { FX, drawFX } from '../engine/fx.js';
import { C } from './data.js';

// precomputed ambience: drifting hot blobs in the lava + floating embers in the void
const BLOBS = [];
for (let i = 0; i < 26; i++) {
  BLOBS.push({ a: Math.random() * TAU, r: 30 + Math.random() * 150, sp: 0.05 + Math.random() * 0.12, size: 18 + Math.random() * 36, ph: Math.random() * TAU });
}
const EMBERS_BG = [];
for (let i = 0; i < 26; i++) {
  EMBERS_BG.push({ x: Math.random(), y: Math.random(), sp: 8 + Math.random() * 18, size: 1 + Math.random() * 2, ph: Math.random() * TAU });
}
const PEBBLES = [];
for (let i = 0; i < 42; i++) {
  const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 0.92;
  PEBBLES.push({ a, r, size: 2 + Math.random() * 5, dark: Math.random() < 0.5 });
}

export class Renderer {
  constructor(view, input) {
    this.view = view;
    this.input = input;
    this.t = 0;
  }

  draw(world, hud, dt) {
    this.t += dt;
    const { ctx } = this.view;
    const t = this.t;

    // ---- background void (screen space, fills everything) ----
    ctx.setTransform(this.view.dpr, 0, 0, this.view.dpr, 0, 0);
    const W = this.view.cssW, H = this.view.cssH;
    let g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b0712');
    g.addColorStop(0.55, '#160d20');
    g.addColorStop(1, '#1d0f17');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // floating embers in the dark
    ctx.globalCompositeOperation = 'lighter';
    for (const e of EMBERS_BG) {
      const y = ((e.y - (t * e.sp) / H) % 1 + 1) % 1;
      const a = 0.12 + 0.1 * Math.sin(t * 2 + e.ph);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ff8a1e';
      ctx.beginPath(); ctx.arc(e.x * W, y * H, e.size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // ---- world space (+ screenshake) ----
    this.view.begin();
    ctx.translate(FX.shakeX, FX.shakeY);

    if (world) {
      this.drawLava(ctx, world, t);
      this.drawIsland(ctx, world, t);
      if (world.has && world.has('rivers')) this.drawCrack(ctx, world, t);
      this.drawMines(ctx, world, t);
      this.drawWizards(ctx, world, t);
      this.drawBolts(ctx, world, t);
      drawFX(ctx);
      this.drawAim(ctx, world);
      this.drawJoystick(ctx);
      this.drawBanners(ctx, world);
    }

    // ---- screen-space overlays ----
    ctx.setTransform(this.view.dpr, 0, 0, this.view.dpr, 0, 0);
    // vignette
    g = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(5,2,10,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // danger vignette when the player is burning or hugging the rim
    const p = world && world.player;
    const danger = p && p.alive ? Math.max(p.burn, p.nearEdge * 0.7) : 0;
    if (danger > 0.02) {
      g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.62);
      g.addColorStop(0, 'rgba(255,60,10,0)');
      g.addColorStop(1, `rgba(255,60,10,${0.28 * danger * (0.8 + 0.2 * Math.sin(t * 9))})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (FX.flash > 0) {
      ctx.fillStyle = `rgba(${FX.flashColor},${FX.flash * 0.55})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (hud) this.drawHud(ctx, world, hud, t);
  }

  // ---- lava: the light source -------------------------------------------------
  drawLava(ctx, world, t) {
    const R = world.arenaR;
    const outer = C.R_START + 190;
    // base pool: brightest right at the island rim, cooling outward
    let g = ctx.createRadialGradient(C.AX, C.AY, Math.max(1, R - 8), C.AX, C.AY, outer);
    g.addColorStop(0, '#ff7b16');
    g.addColorStop(0.18, '#e23f08');
    g.addColorStop(0.55, '#73160a');
    g.addColorStop(1, '#2a0a0e');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(C.AX, C.AY, outer, 0, TAU); ctx.fill();
    // drifting hot blobs (additive) — the lava lives
    ctx.globalCompositeOperation = 'lighter';
    for (const b of BLOBS) {
      const a = b.a + t * b.sp;
      const rr = R + 14 + b.r * 0.5;
      const x = C.AX + Math.cos(a) * rr, y = C.AY + Math.sin(a) * rr;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.3 + b.ph);
      const gg = ctx.createRadialGradient(x, y, 0, x, y, b.size);
      gg.addColorStop(0, `rgba(255,170,40,${0.16 + pulse * 0.12})`);
      gg.addColorStop(1, 'rgba(255,90,10,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(x, y, b.size, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- the island -------------------------------------------------------------
  drawIsland(ctx, world, t) {
    const R = world.arenaR;
    // basalt disc — cool and dark so the lava reads HOT by contrast
    let g = ctx.createRadialGradient(C.AX, C.AY - R * 0.25, R * 0.1, C.AX, C.AY, R);
    g.addColorStop(0, '#2c2238');
    g.addColorStop(0.75, '#221a2e');
    g.addColorStop(1, '#150e20');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(C.AX, C.AY, R, 0, TAU); ctx.fill();
    // static pebble texture (scales with the island — it is sinking, after all)
    for (const p of PEBBLES) {
      const x = C.AX + Math.cos(p.a) * p.r * R, y = C.AY + Math.sin(p.a) * p.r * R;
      ctx.fillStyle = p.dark ? 'rgba(10,6,18,0.5)' : 'rgba(70,58,92,0.35)';
      ctx.beginPath(); ctx.arc(x, y, p.size, 0, TAU); ctx.fill();
    }
    // warm rim-light: the lava licks the edge (animated, additive)
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.75 + 0.25 * Math.sin(t * 2.4);
    ctx.strokeStyle = `rgba(255,140,30,${0.5 * pulse})`;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(C.AX, C.AY, R - 2, 0, TAU); ctx.stroke();
    ctx.strokeStyle = `rgba(255,210,74,${0.9 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(C.AX, C.AY, R - 1, 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    // shrink warning: crumble sparks at the rim while it eats inward
    if (world.roundTime > C.SHRINK_HOLD - 1.2 && R > C.R_FLOOR + 1 && Math.random() < 0.5) {
      const a = Math.random() * TAU;
      ctx.fillStyle = 'rgba(255,170,60,0.8)';
      ctx.beginPath(); ctx.arc(C.AX + Math.cos(a) * (R - 3), C.AY + Math.sin(a) * (R - 3), 1.6, 0, TAU); ctx.fill();
    }
  }

  drawCrack(ctx, world, t) {
    const R = world.arenaR, a = world.crackA;
    const dx = Math.cos(a), dy = Math.sin(a);
    ctx.save();
    ctx.beginPath(); ctx.arc(C.AX, C.AY, R, 0, TAU); ctx.clip();
    const grd = ctx.createLinearGradient(C.AX - dy * 30, C.AY + dx * 30, C.AX + dy * 30, C.AY - dx * 30);
    grd.addColorStop(0, 'rgba(255,60,0,0)');
    grd.addColorStop(0.5, 'rgba(255,123,22,0.95)');
    grd.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.strokeStyle = grd;
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.moveTo(C.AX - dx * R, C.AY - dy * R);
    ctx.lineTo(C.AX + dx * R, C.AY + dy * R);
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,220,90,${0.5 + 0.3 * Math.sin(t * 5)})`;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  drawMines(ctx, world, t) {
    world.mines.forEach((m) => {
      const armed = m.arm <= 0;
      const fusing = m.fuse >= 0;
      const blink = fusing ? (Math.sin(t * 40) > 0 ? 1 : 0.3) : armed ? 0.6 + 0.4 * Math.sin(t * 4) : 0.25;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#241a30';
      ctx.fillRect(-7, -7, 14, 14);
      ctx.globalAlpha = blink;
      ctx.strokeStyle = fusing ? '#ff3b30' : '#ff8a1e';
      ctx.lineWidth = 2;
      ctx.strokeRect(-7, -7, 14, 14);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = fusing ? 'rgba(255,80,40,0.9)' : 'rgba(255,160,60,0.8)';
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
      ctx.restore();
    });
  }

  // ---- wizards ------------------------------------------------------------------
  drawWizards(ctx, world, t) {
    // draw dead ones first (sinking), then alive
    const sorted = [...world.wizards].sort((a, b) => (a.alive ? 1 : 0) - (b.alive ? 1 : 0) || a.y - b.y);
    for (const w of sorted) this.drawWizard(ctx, w, world, t);
  }

  drawWizard(ctx, w, world, t) {
    if (!w.alive && (w.deathT < 0 || w.deathT > 0.9)) return;
    ctx.save();
    ctx.translate(w.x, w.y);

    if (!w.alive) {
      // death: lava deaths sink in a gout of fire; land deaths crumple
      const k = clamp(w.deathT / 0.7, 0, 1);
      if (w.lavaDeath) { ctx.translate(0, k * 16); ctx.scale(1 - k * 0.9, 1 - k * 0.9); ctx.globalAlpha = 1 - k; }
      else { ctx.rotate(k * 1.4); ctx.globalAlpha = 1 - k; ctx.scale(1 - k * 0.3, 1 - k * 0.3); }
    } else {
      // near-edge danger glow under the wizard — the kill threat is always readable
      if (w.nearEdge > 0.02) {
        ctx.globalCompositeOperation = 'lighter';
        const a = w.nearEdge * (0.45 + 0.25 * Math.sin(t * 10));
        const gg = ctx.createRadialGradient(0, 8, 2, 0, 8, 30);
        gg.addColorStop(0, `rgba(255,60,20,${a})`);
        gg.addColorStop(1, 'rgba(255,60,20,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(0, 8, 30, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      // draw-time squash along the knockback direction (never moves the sim)
      if (w.squashT > 0) {
        const s = (w.squashT / 0.22) * 0.3;
        ctx.rotate(w.squashA);
        ctx.scale(1 + s, 1 - s);
        ctx.rotate(-w.squashA);
      }
    }

    // soft ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 13, 13, 5, 0, 0, TAU); ctx.fill();

    const bobY = Math.sin(w.bob) * 1.5;
    ctx.translate(0, bobY);
    ctx.scale(w.facing, 1);

    // cloak — bold key-colour silhouette
    const grd = ctx.createLinearGradient(0, -22, 0, 14);
    grd.addColorStop(0, w.color);
    grd.addColorStop(1, w.dark);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.bezierCurveTo(-12, -10, -14, 4, -11, 13);
    ctx.quadraticCurveTo(0, 17, 11, 13);
    ctx.bezierCurveTo(14, 4, 12, -10, 0, -14);
    ctx.fill();
    // warm rim-light from the lava on the cloak hem
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,140,40,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, 12); ctx.quadraticCurveTo(0, 16, 10, 12);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';

    // hood + shadowed face with glowing eyes
    ctx.fillStyle = w.dark;
    ctx.beginPath(); ctx.arc(0, -13, 8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0a0612';
    ctx.beginPath(); ctx.arc(1.5, -12, 5.5, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = w.color;
    ctx.beginPath(); ctx.arc(3.4, -13, 1.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(0.2, -13, 1.5, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // hat — a proper wizard needs one
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(-10, -17); ctx.quadraticCurveTo(0, -21, 10, -17);
    ctx.quadraticCurveTo(8, -20, 4, -22);
    ctx.quadraticCurveTo(6, -34, -1, -38);
    ctx.quadraticCurveTo(0, -30, -4, -22);
    ctx.quadraticCurveTo(-8, -20, -10, -17);
    ctx.fill();

    // casting windup: a growing ember in the lead hand (telegraph)
    if (w.casting) {
      const k = 1 - w.casting.t / C.FB_WINDUP;
      ctx.globalCompositeOperation = 'lighter';
      const hx = 12, hy = -2;
      const gg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 6 + k * 8);
      gg.addColorStop(0, `rgba(255,220,120,${0.9 * k})`);
      gg.addColorStop(0.5, `rgba(255,140,30,${0.6 * k})`);
      gg.addColorStop(1, 'rgba(255,90,10,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(hx, hy, 6 + k * 8, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    // burning tint
    if (w.burn > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = w.burn * 0.5;
      ctx.fillStyle = '#ff5a1e';
      ctx.beginPath(); ctx.arc(0, -6, 16, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // hit flash
    if (w.hitFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, w.hitFlash / 0.09);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, -6, 17, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // ward bubble + HP arc (world-space, unflipped)
    if (w.alive) {
      if (w.ward > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(159,216,255,${0.4 + 0.2 * Math.sin(t * 5)})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(w.x, w.y - 4, 23, 0, TAU); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
      const frac = clamp(w.hp / w.hpMax, 0, 1);
      if (frac < 1) {
        const a0 = -Math.PI * 0.78, a1 = -Math.PI * 0.22;
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(8,4,16,0.7)';
        ctx.beginPath(); ctx.arc(w.x, w.y, 27, a0, a1); ctx.stroke();
        ctx.strokeStyle = frac > 0.4 ? w.color : '#ff4d30';
        ctx.beginPath(); ctx.arc(w.x, w.y, 27, a0, a0 + (a1 - a0) * frac); ctx.stroke();
      }
    }
  }

  // ---- bolts ----------------------------------------------------------------------
  drawBolts(ctx, world, t) {
    ctx.save();
    world.bolts.forEach((b) => {
      const color = b.kind === 'mote' ? '#c63dff' : b.kind === 'hook' ? '#cfd6e4' : '#ffd24a';
      const core = b.kind === 'mote' ? '#f0c8ff' : b.kind === 'hook' ? '#ffffff' : '#fff6d8';
      if (b.kind === 'hook' && b.owner) {
        ctx.strokeStyle = 'rgba(207,214,228,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(b.owner.x, b.owner.y - 4); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter';
      // motion smear
      const sp = Math.hypot(b.vx, b.vy) || 1;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = b.r * 1.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x - (b.vx / sp) * b.r * 4.5, b.y - (b.vy / sp) * b.r * 4.5);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      // halo + core
      const gg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2.6);
      gg.addColorStop(0, color);
      gg.addColorStop(1, 'rgba(255,90,10,0)');
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2.6, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.8, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    });
    ctx.restore();
  }

  // ---- aim preview + move stick ------------------------------------------------------
  drawAim(ctx, world) {
    const aim = this.input.aiming();
    const p = world.player;
    if (!aim || !p.alive || world.state !== 'fight') return;
    ctx.save();
    ctx.strokeStyle = 'rgba(61,240,255,0.65)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 9]);
    const len = 150;
    ctx.beginPath();
    ctx.moveTo(p.x + aim.nx * 22, p.y + aim.ny * 22);
    ctx.lineTo(p.x + aim.nx * len, p.y + aim.ny * len);
    ctx.stroke();
    ctx.setLineDash([]);
    // chevron tip
    const tx = p.x + aim.nx * (len + 8), ty = p.y + aim.ny * (len + 8);
    const a = Math.atan2(aim.ny, aim.nx);
    ctx.fillStyle = 'rgba(61,240,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - Math.cos(a - 0.5) * 12, ty - Math.sin(a - 0.5) * 12);
    ctx.lineTo(tx - Math.cos(a + 0.5) * 12, ty - Math.sin(a + 0.5) * 12);
    ctx.fill();
    ctx.restore();
  }

  drawJoystick(ctx) {
    const m = this.input.move;
    if (m.id === null) return;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#9fd8ff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(m.ox, m.oy, 44, 0, TAU); ctx.stroke();
    const dx = m.x - m.ox, dy = m.y - m.oy;
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(d, 44);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#9fd8ff';
    ctx.beginPath(); ctx.arc(m.ox + (dx / d) * k, m.oy + (dy / d) * k, 14, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ---- in-world banners (countdown / round result) -----------------------------------
  drawBanners(ctx, world) {
    ctx.save();
    ctx.textAlign = 'center';
    if (world.state === 'count') {
      const n = Math.ceil(world.countT);
      const frac = world.countT - Math.floor(world.countT);
      ctx.globalAlpha = 0.25 + frac * 0.75;
      ctx.font = '900 84px Cinzel, serif';
      ctx.fillStyle = '#ffd24a';
      ctx.strokeStyle = 'rgba(10,5,2,0.8)';
      ctx.lineWidth = 6;
      ctx.strokeText(String(n), C.AX, C.AY - 40);
      ctx.fillText(String(n), C.AX, C.AY - 40);
    } else if (world.state === 'fight' && world.roundTime < 0.6) {
      ctx.globalAlpha = 1 - world.roundTime / 0.6;
      ctx.font = '900 56px Cinzel, serif';
      ctx.fillStyle = '#ffd24a';
      ctx.strokeStyle = 'rgba(10,5,2,0.8)';
      ctx.lineWidth = 5;
      ctx.strokeText('FIGHT', C.AX, C.AY - 40);
      ctx.fillText('FIGHT', C.AX, C.AY - 40);
    }
    ctx.restore();
  }

  // ---- HUD: round pips, gold, ember icons --------------------------------------------
  drawHud(ctx, world, hud, t) {
    const W = this.view.cssW;
    ctx.save();
    ctx.textAlign = 'center';
    // round pips: you (left) vs the lineup's best (right)
    const cx = W / 2, y = 26;
    const pip = (x, on, color) => {
      ctx.beginPath(); ctx.arc(x, y, 5.5, 0, TAU);
      ctx.fillStyle = on ? color : 'rgba(255,255,255,0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1; ctx.stroke();
    };
    for (let i = 0; i < hud.target; i++) pip(cx - 30 - i * 17, i < hud.playerWins, hud.playerColor);
    for (let i = 0; i < hud.target; i++) pip(cx + 30 + i * 17, i < hud.rivalWins, hud.rivalColor);
    ctx.font = '700 13px Cinzel, serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('VS', cx, y + 4.5);
    // match label
    ctx.font = '600 11px Cinzel, serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(hud.label, cx, y + 22);
    // gold, top-right
    ctx.textAlign = 'right';
    ctx.font = '800 16px Cinzel, serif';
    ctx.fillStyle = '#ffd24a';
    ctx.fillText(`${hud.gold} ◆`, W - 14, 30);
    // embers, top-left
    ctx.textAlign = 'left';
    ctx.font = '700 15px serif';
    ctx.fillStyle = 'rgba(255,160,60,0.9)';
    ctx.fillText(hud.emberIcons, 14, 30);
    ctx.restore();
  }
}
