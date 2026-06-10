// The simulation: wizards, knockback physics, lava, shrinking island, spells, AI.
// Pure sim — rendering reads it, never the other way. Fixed-timestep (main loop).
import { TAU, clamp, dist, angle } from '../engine/vec.js';
import { Pool } from '../engine/pool.js';
import { burst, shockwave, floatText, addTrauma, hitStop, screenFlash } from '../engine/fx.js';
import { sfx } from '../audio.js';
import { C, RIVALS, SPELLS, AI_TIERS } from './data.js';

// ~N(0,1) via sum of uniforms — fine for aim error
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;

export class World {
  // cfg: { lineup:[rivalIds], aiTier, embers:[], matchIdx, player:{...} }
  constructor(cfg, emit) {
    this.cfg = cfg;
    this.emit = emit;
    this.embers = cfg.embers || [];
    this.has = (id) => this.embers.includes(id);
    this.bolts = new Pool(
      () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, r: 9, dmg: 0, imp: 0, owner: null, kind: 'fb', life: 0, born: 0, homing: false, turn: 0 }),
      (b) => { b.homing = false; b.life = 0; }
    );
    this.mines = new Pool(
      () => ({ alive: false, x: 0, y: 0, arm: 0, fuse: -1, owner: null, beeped: false }),
      (m) => { m.fuse = -1; m.beeped = false; }
    );
    this.wizards = [];
    this.state = 'idle'; // count | fight | over
    this.time = 0;
    this.roundTime = 0;
    this.countT = 0;
    this.overT = 0;
    this.arenaR = C.R_START;
    this.crackA = Math.random() * TAU;
    this.winner = undefined;
    this.fireBuffer = 0; // buffered player fire request
    this.fireDir = null;
    this._mkWizards();
  }

  _mkWizards() {
    const p = this.cfg.player;
    this.player = this._wiz({
      id: 'you', isPlayer: true, name: 'You', color: p.color, dark: '#08323a',
      hpMax: p.hpMax, speed: p.speed, fbImpulse: p.fbImpulse, fbCd: p.fbCd,
      fbRadius: p.fbRadius, fbDmg: p.fbDmg, actives: p.actives, wardMax: p.wardMax,
    });
    this.wizards.push(this.player);
    const tier = AI_TIERS[clamp(this.cfg.aiTier, 0, AI_TIERS.length - 1)];
    const asc = this.cfg.ascension || 0; // ascension sharpens the same honest knobs
    for (const rid of this.cfg.lineup) {
      const r = RIVALS[rid];
      this.wizards.push(this._wiz({
        id: rid, isPlayer: false, name: r.name, color: r.color, dark: r.dark, rival: r,
        hpMax: C.HP * (r.hpMul || 1), speed: C.SPEED * (r.speedMul || 1),
        fbImpulse: C.FB_IMPULSE * (r.forceMul || 1), fbCd: C.FB_CD,
        fbRadius: C.FB_RADIUS, fbDmg: C.FB_DMG, actives: r.loadout.filter((s) => SPELLS[s].kind === 'active'),
        wardMax: r.loadout.includes('ward') ? 1 : 0,
        ai: {
          aimErr: Math.max(0.06, tier.aimErr - asc * 0.03),
          react: Math.max(0.1, tier.react - asc * 0.04),
          dodgeMul: tier.dodgeMul + asc * 0.15,
          w: r.weights, range: r.range, aggro: r.aggro || 1,
          centerHug: r.centerHug || 0, erratic: r.erratic || 0,
          target: null, retarget: 0, think: Math.random() * 0.1,
          strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 1 + Math.random() * 2,
          wanderA: Math.random() * TAU,
        },
      }));
    }
  }

  _wiz(o) {
    const volatileMul = this.has('volatile') ? 1.4 : 1;
    return {
      x: 0, y: 0, mvx: 0, mvy: 0, kvx: 0, kvy: 0,
      hp: o.hpMax, hpMax: o.hpMax, alive: true, deathT: -1, lavaDeath: false,
      stagger: 0, dashT: 0, burn: 0, hitFlash: 0, nearEdge: 0,
      facing: 1, bob: Math.random() * TAU,
      fireCd: 0, casting: null, cds: {}, ward: 0, wardMax: o.wardMax || 0,
      lastHitBy: null, lastHitT: -99,
      roundWins: 0, deadOrder: -1,
      ...o,
    };
  }

  startRound() {
    this.state = 'count';
    this.countT = C.COUNTDOWN;
    this.time = 0; this.roundTime = 0; this.overT = 0;
    this.winner = undefined;
    this.arenaR = C.R_START;
    this.crackA = Math.random() * TAU;
    this.bolts.clear(); this.mines.clear();
    const alive = this.wizards;
    const n = alive.length;
    alive.forEach((w, i) => {
      // player spawns at the bottom; others spread around the circle
      const a = Math.PI / 2 + (i / n) * TAU;
      w.x = C.AX + Math.cos(a) * C.R_START * 0.55;
      w.y = C.AY + Math.sin(a) * C.R_START * 0.55;
      w.hp = w.hpMax; w.alive = true; w.deathT = -1; w.lavaDeath = false;
      w.kvx = 0; w.kvy = 0; w.mvx = 0; w.mvy = 0;
      w.stagger = 0; w.dashT = 0; w.burn = 0; w.hitFlash = 0;
      w.fireCd = 0; w.casting = null; w.cds = {}; w.ward = w.wardMax;
      w.lastHitBy = null; w.lastHitT = -99; w.deadOrder = -1;
      if (w.ai) { w.ai.target = null; w.ai.retarget = 0; }
    });
    this.deadCount = 0;
  }

  // ---- player commands ------------------------------------------------------
  requestFire(dir) { this.fireBuffer = 0.22; this.fireDir = dir; }

  castPlayerSpell(spellId, aimDir, moveDir) {
    const w = this.player;
    if (!w.alive || this.state !== 'fight') return false;
    if ((w.cds[spellId] || 0) > 0) return false;
    if (w.stagger > 0 && spellId !== 'surge') return false; // surge is the escape
    return this._cast(w, spellId, aimDir, moveDir);
  }

  // ---- casting (shared player/AI) --------------------------------------------
  _aimAt(w, t, speed) { // lead the target's real velocity
    const tt = dist(w.x, w.y, t.x, t.y) / speed;
    const px = t.x + (t.mvx + t.kvx) * tt, py = t.y + (t.mvy + t.kvy) * tt;
    return angle(w.x, w.y, px, py);
  }

  _nearestEnemy(w) {
    let best = null, bd = 1e9;
    for (const o of this.wizards) {
      if (o === w || !o.alive) continue;
      const d = dist(w.x, w.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  _cast(w, spellId, aimDir, moveDir) {
    const cdMul = 1;
    const setCd = () => { w.cds[spellId] = SPELLS[spellId].cd * cdMul; };
    const enemy = this._nearestEnemy(w);
    const autoAng = enemy ? this._aimAt(w, enemy, C.FB_SPEED) : -Math.PI / 2;
    const ang = aimDir ? Math.atan2(aimDir.ny, aimDir.nx) : autoAng;
    const volat = this.has('volatile') ? 1.4 : 1;
    switch (spellId) {
      case 'surge': {
        let dx, dy;
        if (moveDir && moveDir.mag > 0.1) { dx = moveDir.nx; dy = moveDir.ny; }
        else if (enemy) { const a = angle(enemy.x, enemy.y, w.x, w.y); dx = Math.cos(a); dy = Math.sin(a); }
        else { dx = Math.cos(ang); dy = Math.sin(ang); }
        w.kvx += dx * 420; w.kvy += dy * 420;
        w.dashT = 0.35; w.stagger = 0; // the counterplay: dash breaks stagger
        burst(w.x, w.y, 10, { color: w.color, dir: Math.atan2(-dy, -dx), spread: 0.9, speed: 160, life: 0.35 });
        sfx.dash();
        setCd(); return true;
      }
      case 'scatter': {
        for (let i = -1; i <= 1; i++) this._spawnBolt(w, ang + i * 0.22, { imp: 260 * volat, dmg: 5, kind: 'scatter', r: 7, speed: 380 });
        sfx.cast(); setCd(); return true;
      }
      case 'mote': {
        this._spawnBolt(w, ang, { imp: 240 * volat, dmg: 5, kind: 'mote', r: 8, speed: 150, homing: true, turn: 2.2, life: 6 });
        sfx.cast(); setCd(); return true;
      }
      case 'nova': {
        burst(w.x, w.y, 26, { color: '#ff8a1e', speed: 280, life: 0.5, r: 3 });
        shockwave(w.x, w.y, { color: '#ffd24a', max: 95, dur: 0.35, width: 5 });
        addTrauma(0.22); sfx.nova();
        for (const o of this.wizards) {
          if (o === w || !o.alive) continue;
          const d = dist(w.x, w.y, o.x, o.y);
          if (d < 95) {
            const a = angle(w.x, w.y, o.x, o.y);
            this._hitWizard(o, w, Math.cos(a), Math.sin(a), 380 * volat * (1 - d / 190), 6, 'nova');
          }
        }
        setCd(); return true;
      }
      case 'mine': {
        if (this.mines.countAlive >= 4) return false;
        this.mines.spawn((m) => { m.x = w.x; m.y = w.y; m.arm = 0.7; m.owner = w; });
        sfx.mineDrop(); setCd(); return true;
      }
      case 'hook': {
        this._spawnBolt(w, ang, { imp: 430, dmg: 4, kind: 'hook', r: 7, speed: 560, life: 0.45 });
        sfx.hook(); setCd(); return true;
      }
    }
    return false;
  }

  _spawnBolt(w, ang, o) {
    const speed = o.speed || C.FB_SPEED;
    this.bolts.spawn((b) => {
      b.x = w.x + Math.cos(ang) * (C.WIZ_R + 6);
      b.y = w.y + Math.sin(ang) * (C.WIZ_R + 6);
      b.vx = Math.cos(ang) * speed; b.vy = Math.sin(ang) * speed;
      b.r = o.r; b.dmg = o.dmg; b.imp = o.imp; b.owner = w; b.kind = o.kind;
      b.life = o.life || 2.2; b.born = this.time;
      b.homing = !!o.homing; b.turn = o.turn || 0;
    });
  }

  _fireball(w, ang) {
    const volat = this.has('volatile') ? 1.4 : 1;
    w.casting = { t: C.FB_WINDUP, ang };
    w.fireCd = w.fbCd;
    sfx.charge();
  }

  // ---- the hit: impulse + stagger (the coupled feel triad) --------------------
  _hitWizard(victim, by, nx, ny, imp, dmg, kind) {
    if (!victim.alive) return;
    if (victim.ward > 0) {
      victim.ward--;
      shockwave(victim.x, victim.y, { color: '#9fd8ff', max: 46, dur: 0.3, width: 4 });
      floatText(victim.x, victim.y - 28, 'WARDED', { color: '#9fd8ff', size: 15 });
      sfx.ward();
      return;
    }
    victim.kvx += nx * imp; victim.kvy += ny * imp;
    if (victim.dashT <= 0) victim.stagger = Math.max(victim.stagger, C.STAGGER);
    victim.hp -= dmg;
    victim.hitFlash = 0.09;
    victim.lastHitBy = by; victim.lastHitT = this.time;
    // draw-time squash direction for render
    victim.squashA = Math.atan2(ny, nx); victim.squashT = 0.22;
    burst(victim.x, victim.y, 9, { color: '#ffb14a', dir: Math.atan2(ny, nx), spread: 1.1, speed: 190, life: 0.4 });
    hitStop(kind === 'hook' ? 0.05 : 0.1);
    if (by === this.player || victim === this.player) addTrauma(0.16);
    if (kind === 'hook') sfx.hookHit(); else sfx.shove();
    if (victim.hp <= 0) this._die(victim, false);
  }

  _die(w, inLava) {
    if (!w.alive) return;
    w.alive = false; w.deathT = 0; w.lavaDeath = inLava;
    w.deadOrder = this.deadCount++;
    const killer = (this.time - w.lastHitT < 3) ? w.lastHitBy : null;
    if (inLava) {
      // the money moment
      burst(w.x, w.y, 34, { color: '#ff8a1e', speed: 240, life: 0.8, grav: -160, r: 3.4 });
      burst(w.x, w.y, 16, { color: '#ffd24a', speed: 160, life: 0.6, grav: -220, r: 2.6 });
      shockwave(w.x, w.y, { color: '#ff5a1e', max: 80, dur: 0.5, width: 6 });
      screenFlash(0.22, '255,120,30');
      addTrauma(0.4);
      hitStop(0.12);
      sfx.lavaDeath();
    } else {
      burst(w.x, w.y, 20, { color: w.color, speed: 200, life: 0.6 });
      addTrauma(0.25);
    }
    this.emit('kill', { victim: w, killer, lava: inLava });
  }

  // ---- main step ---------------------------------------------------------------
  update(dt, playerIntent) {
    this.time += dt;
    if (this.state === 'count') {
      this.countT -= dt;
      if (this.countT <= 0) { this.state = 'fight'; this.emit('go'); }
      return;
    }
    if (this.state !== 'fight' && this.state !== 'over') return;
    this.roundTime += dt;

    // island shrink (a clock no one can stall against)
    const rate = C.SHRINK_RATE * (this.has('tide') ? 1.3 : 1);
    const t = Math.max(0, this.roundTime - C.SHRINK_HOLD);
    this.arenaR = Math.max(C.R_FLOOR, C.R_START - t * rate);
    if (this.has('rivers')) this.crackA += dt * 0.13;

    // player intent
    if (this.player.alive && this.state === 'fight') this._playerStep(dt, playerIntent);

    // AI
    for (const w of this.wizards) {
      if (!w.ai || !w.alive || this.state !== 'fight') continue;
      this._aiStep(w, dt);
    }

    // shared wizard physics
    for (const w of this.wizards) {
      if (!w.alive) { if (w.deathT >= 0) w.deathT += dt; continue; }
      w.stagger = Math.max(0, w.stagger - dt);
      w.dashT = Math.max(0, w.dashT - dt);
      w.hitFlash = Math.max(0, w.hitFlash - dt);
      if (w.squashT) w.squashT = Math.max(0, w.squashT - dt);
      w.fireCd = Math.max(0, w.fireCd - dt);
      for (const k in w.cds) w.cds[k] = Math.max(0, w.cds[k] - dt);

      // finish a windup -> the bolt leaves
      if (w.casting) {
        w.casting.t -= dt;
        if (w.casting.t <= 0) {
          this._spawnBolt(w, w.casting.ang, { imp: w.fbImpulse * (this.has('volatile') ? 1.4 : 1), dmg: w.fbDmg, kind: 'fb', r: w.fbRadius, speed: C.FB_SPEED });
          sfx.cast();
          w.casting = null;
        }
      }

      // knockback decays (the slide that sells the weight)
      const kv = Math.hypot(w.kvx, w.kvy);
      if (kv > 0) {
        const nk = Math.max(0, kv - C.KB_DECEL * dt);
        const s = kv > 0 ? nk / kv : 0;
        w.kvx *= s; w.kvy *= s;
      }
      // input movement is suppressed while staggered
      const mv = w.stagger > 0 ? 0 : 1;
      w.x += (w.mvx * mv + w.kvx) * dt;
      w.y += (w.mvy * mv + w.kvy) * dt;
      if (Math.abs(w.mvx) > 1) w.facing = w.mvx > 0 ? 1 : -1;
      w.bob += dt * 6;

      // keep wizards on screen: nobody drifts deep into the lava field
      {
        const dc = dist(w.x, w.y, C.AX, C.AY);
        const cap = C.R_START + 36;
        if (dc > cap) { w.x = C.AX + ((w.x - C.AX) / dc) * cap; w.y = C.AY + ((w.y - C.AY) / dc) * cap; }
      }
      // lava check
      const d = dist(w.x, w.y, C.AX, C.AY);
      w.nearEdge = clamp(1 - (this.arenaR - d) / C.EDGE_WARN, 0, 1);
      let inLava = d > this.arenaR - 2;
      if (!inLava && this.has('rivers')) {
        const px = w.x - C.AX, py = w.y - C.AY;
        const pd = Math.abs(-Math.sin(this.crackA) * px + Math.cos(this.crackA) * py);
        if (pd < 13 + C.WIZ_R * 0.4) inLava = true;
      }
      if (inLava) {
        const dps = C.LAVA_DPS * (this.has('glass') ? 2 : 1);
        w.hp -= dps * dt;
        w.burn = Math.min(1, w.burn + dt * 3);
        if (Math.random() < dt * 22) burst(w.x, w.y + 6, 2, { color: '#ff8a1e', speed: 90, life: 0.45, grav: -240, r: 2.2 });
        sfx.sizzle();
        if (w.hp <= 0) this._die(w, true);
      } else {
        w.burn = Math.max(0, w.burn - dt * 1.4);
      }
    }

    // soft wizard-wizard collision
    const ws = this.wizards;
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
      const a = ws[i], b = ws[j];
      if (!a.alive || !b.alive) continue;
      const d = dist(a.x, a.y, b.x, b.y);
      const min = C.WIZ_R * 2 - 4;
      if (d < min && d > 0.01) {
        const push = (min - d) / 2;
        const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }

    // bolts
    this.bolts.forEach((b) => {
      b.life -= dt;
      if (b.life <= 0) { b.alive = false; return; }
      if (b.homing) {
        const t = this._nearestEnemy(b.owner);
        if (t) {
          const want = angle(b.x, b.y, t.x, t.y);
          let cur = Math.atan2(b.vy, b.vx);
          let diff = ((want - cur + Math.PI * 3) % TAU) - Math.PI;
          cur += clamp(diff, -b.turn * dt, b.turn * dt);
          const sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(cur) * sp; b.vy = Math.sin(cur) * sp;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      // bolts fizzle when far over lava (they may cross some)
      if (dist(b.x, b.y, C.AX, C.AY) > this.arenaR + 120) { b.alive = false; return; }
      for (const w of this.wizards) {
        if (w === b.owner || !w.alive) continue;
        if (dist(b.x, b.y, w.x, w.y) < b.r + C.WIZ_R) {
          const sp = Math.hypot(b.vx, b.vy) || 1;
          if (b.kind === 'hook') {
            // the yank: pull the victim TOWARD the caster
            const a = angle(w.x, w.y, b.owner.x, b.owner.y);
            this._hitWizard(w, b.owner, Math.cos(a), Math.sin(a), b.imp, b.dmg, 'hook');
          } else {
            this._hitWizard(w, b.owner, b.vx / sp, b.vy / sp, b.imp, b.dmg, b.kind);
          }
          b.alive = false;
          break;
        }
      }
    });

    // mines
    this.mines.forEach((m) => {
      if (m.arm > 0) { m.arm -= dt; return; }
      if (m.fuse < 0) {
        for (const w of this.wizards) {
          if (!w.alive || w === m.owner) continue;
          if (dist(m.x, m.y, w.x, w.y) < 36) { m.fuse = 0.22; sfx.mineBeep(); break; }
        }
      } else {
        m.fuse -= dt;
        if (m.fuse <= 0) {
          m.alive = false;
          burst(m.x, m.y, 22, { color: '#ff5a1e', speed: 260, life: 0.5, r: 3 });
          shockwave(m.x, m.y, { color: '#ff8a1e', max: 84, dur: 0.4, width: 5 });
          addTrauma(0.25); sfx.mineBoom();
          const volat = this.has('volatile') ? 1.4 : 1;
          for (const w of this.wizards) { // mines respect no allegiance — owner included
            if (!w.alive) continue;
            const d = dist(m.x, m.y, w.x, w.y);
            if (d < 82) {
              const a = angle(m.x, m.y, w.x, w.y);
              this._hitWizard(w, m.owner === w ? null : m.owner, Math.cos(a), Math.sin(a), 460 * volat * (1 - d / 164), 10, 'mine');
            }
          }
        }
      }
    });

    // round over?
    if (this.state === 'fight') {
      const alive = this.wizards.filter((w) => w.alive);
      if (alive.length <= 1) {
        this.state = 'over';
        this.winner = alive[0] || null;
        this.overT = 0;
      }
    } else if (this.state === 'over') {
      this.overT += dt;
      if (this.overT > 1.1) {
        this.state = 'idle';
        this.emit('roundOver', { winner: this.winner });
      }
    }
  }

  _playerStep(dt, intent) {
    const w = this.player;
    // movement from the stick
    const j = intent.joy;
    w.mvx = j.nx * j.mag * w.speed;
    w.mvy = j.ny * j.mag * w.speed;
    // buffered fire
    if (this.fireBuffer > 0) {
      this.fireBuffer -= dt;
      if (w.fireCd <= 0 && !w.casting && w.stagger <= 0 && this.fireDir) {
        this._fireball(w, Math.atan2(this.fireDir.ny, this.fireDir.nx));
        this.fireBuffer = 0;
      }
    }
  }

  // ---- AI: steering forces + a tiny FSM, personality = data row -----------------
  _aiStep(w, dt) {
    const ai = w.ai;
    ai.think -= dt; ai.retarget -= dt; ai.strafeT -= dt;

    if (ai.strafeT <= 0) { ai.strafe *= -1; ai.strafeT = 1.2 + Math.random() * 2.4; }
    if (!ai.target || !ai.target.alive || ai.retarget <= 0) {
      ai.target = this._nearestEnemy(w);
      ai.retarget = 1.2 + Math.random();
    }
    const t = ai.target;
    if (!t) { w.mvx = 0; w.mvy = 0; return; }

    // -- steering forces --
    let fx = 0, fy = 0;
    const cd = dist(w.x, w.y, C.AX, C.AY);
    const margin = this.arenaR - cd;
    const toCx = (C.AX - w.x) / (cd || 1), toCy = (C.AY - w.y) / (cd || 1);

    // flee the rim — survival instinct, scales hard as margin vanishes
    if (margin < 90) {
      const k = (1 - margin / 90);
      fx += toCx * k * k * 3.4 * ai.w.flee;
      fy += toCy * k * k * 3.4 * ai.w.flee;
    }
    if (ai.centerHug) { fx += toCx * 0.3 * ai.centerHug; fy += toCy * 0.3 * ai.centerHug; }

    // engage: hold preferred range, strafe tangentially
    const td = dist(w.x, w.y, t.x, t.y);
    const ta = angle(w.x, w.y, t.x, t.y);
    const rangeErr = (td - ai.range) / ai.range;
    fx += Math.cos(ta) * clamp(rangeErr, -1, 1) * ai.w.seek * ai.aggro;
    fy += Math.sin(ta) * clamp(rangeErr, -1, 1) * ai.w.seek * ai.aggro;
    fx += Math.cos(ta + Math.PI / 2) * ai.strafe * 0.55;
    fy += Math.sin(ta + Math.PI / 2) * ai.strafe * 0.55;

    // kill-angle: stand on the centre side of the target so hits shove them OUT
    const tcd = dist(t.x, t.y, C.AX, C.AY);
    const outx = (t.x - C.AX) / (tcd || 1), outy = (t.y - C.AY) / (tcd || 1);
    const wantX = t.x - outx * ai.range * 0.9, wantY = t.y - outy * ai.range * 0.9;
    const wd = dist(w.x, w.y, wantX, wantY);
    if (wd > 20) {
      fx += ((wantX - w.x) / wd) * 0.6 * ai.w.angle;
      fy += ((wantY - w.y) / wd) * 0.6 * ai.w.angle;
    }

    // dodge incoming bolts (reaction-delayed — beatable on purpose)
    this.bolts.forEach((b) => {
      if (b.owner === w || !b.alive) return;
      if (this.time - b.born < ai.react) return; // hasn't "seen" it yet
      const relx = w.x - b.x, rely = w.y - b.y;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const along = (relx * b.vx + rely * b.vy) / sp;
      if (along < 0 || along > 240) return;
      const perp = (relx * -b.vy + rely * b.vx) / sp;
      if (Math.abs(perp) < 46) {
        const s = perp >= 0 ? 1 : -1;
        fx += (-b.vy / sp) * s * 2.2 * ai.w.dodge * ai.dodgeMul;
        fy += (b.vx / sp) * s * 2.2 * ai.w.dodge * ai.dodgeMul;
      }
    });

    // avoid mines and the fire crack
    this.mines.forEach((m) => {
      const d = dist(w.x, w.y, m.x, m.y);
      if (d < 75) { fx += ((w.x - m.x) / d) * 1.6; fy += ((w.y - m.y) / d) * 1.6; }
    });
    if (this.has('rivers')) {
      const px = w.x - C.AX, py = w.y - C.AY;
      const sn = -Math.sin(this.crackA), cs = Math.cos(this.crackA);
      const pd = sn * px + cs * py;
      if (Math.abs(pd) < 46) { const s = pd >= 0 ? 1 : -1; fx += sn * s * 1.8; fy += cs * s * 1.8; }
    }

    // erratic wander (Wisp)
    if (ai.erratic) {
      ai.wanderA += (Math.random() - 0.5) * 3 * dt * 6;
      fx += Math.cos(ai.wanderA) * 0.8 * ai.erratic;
      fy += Math.sin(ai.wanderA) * 0.8 * ai.erratic;
    }

    // separation
    for (const o of this.wizards) {
      if (o === w || !o.alive) continue;
      const d = dist(w.x, w.y, o.x, o.y);
      if (d < 55 && d > 0.01) { fx += ((w.x - o.x) / d) * 0.5; fy += ((w.y - o.y) / d) * 0.5; }
    }

    const fm = Math.hypot(fx, fy);
    if (fm > 0.05) {
      // low-pass toward the desired direction = natural, weighty motion
      const want = Math.min(fm, 1);
      w.mvx += ((fx / fm) * want * w.speed - w.mvx) * Math.min(1, dt * 8);
      w.mvy += ((fy / fm) * want * w.speed - w.mvy) * Math.min(1, dt * 8);
    } else { w.mvx *= 0.9; w.mvy *= 0.9; }

    // -- decisions on a slow think tick --
    if (ai.think > 0) return;
    ai.think = 0.1 + Math.random() * 0.06;

    // fireball: lead the target, gaussian error, prefer shots that shove them OUTWARD
    if (w.fireCd <= 0 && !w.casting && w.stagger <= 0 && td < 430) {
      const aim = this._aimAt(w, t, C.FB_SPEED);
      const shotx = Math.cos(aim), shoty = Math.sin(aim);
      const alignment = shotx * outx + shoty * outy; // >0 = pushes toward lava
      const p = alignment > 0.1 ? 0.92 : 0.5;
      if (Math.random() < p) this._fireball(w, aim + gauss() * ai.aimErr);
    }

    // spells, contextually
    const ready = (s) => w.actives.includes(s) && (w.cds[s] || 0) <= 0;
    if (ready('surge')) {
      if (w.stagger > 0 && margin < 70) this._cast(w, 'surge', { nx: toCx, ny: toCy }, null); // escape!
      else if (ai.aggro > 1.15 && td > ai.range * 1.6) this._cast(w, 'surge', null, { mag: 1, nx: Math.cos(ta), ny: Math.sin(ta) });
    }
    if (ready('nova') && td < 75) this._cast(w, 'nova');
    if (ready('scatter') && td < 170) this._cast(w, 'scatter', { nx: Math.cos(this._aimAt(w, t, 380) + gauss() * ai.aimErr), ny: Math.sin(this._aimAt(w, t, 380) + gauss() * ai.aimErr) });
    if (ready('mote') && td > 130) this._cast(w, 'mote', { nx: Math.cos(ta), ny: Math.sin(ta) });
    if (ready('mine') && (ai.centerHug ? cd < this.arenaR * 0.4 : td < 130)) this._cast(w, 'mine');
    if (ready('hook') && td > 100 && td < 240) {
      const a = this._aimAt(w, t, 560) + gauss() * ai.aimErr * 0.8;
      this._cast(w, 'hook', { nx: Math.cos(a), ny: Math.sin(a) });
    }
  }
}
