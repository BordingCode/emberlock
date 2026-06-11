// Emberlock — bootstrap + the run/match/round state machine.
// A RUN = 1 Ember + 5 matches (lose one match -> run over).
// A MATCH = first to 3 round wins. A ROUND = last wizard standing.
import { CanvasView } from './engine/canvas.js';
import { TwinStick } from './engine/input.js';
import { GameLoop } from './engine/loop.js';
import { FX, updateFX, clearFX, floatText } from './engine/fx.js';
import { initAudio, resumeAudio, sfx, setSfx, startMusic, stopMusic, setPulse, setMusicIntensity } from './audio.js';
import { C, SPELLS, UPGRADES, EMBERS, RIVALS, GAUNTLET, PLAYER_COLOR } from './game/data.js';
import { Meta, loadMeta, saveMeta } from './game/meta.js';
import { World } from './game/world.js';
import { Renderer } from './game/render.js';
import {
  $, showScreen, toast, renderMenu, renderEmberPick, renderDraft, renderShop,
  renderMatchEnd, renderRunEnd, renderSanctum, renderHelp, buildSpellButtons, updateSpellButtons,
} from './game/ui.js';

// ---- resilience: never white-screen, keep errors inspectable -----------------
window.__errors = [];
window.addEventListener('error', (e) => { window.__errors.push(String(e.message)); });
window.addEventListener('unhandledrejection', (e) => { window.__errors.push(String(e.reason)); });

loadMeta();

const canvas = $('#game');
const view = new CanvasView(canvas);
const input = new TwinStick(canvas, view);
const renderer = new Renderer(view, input);
window.addEventListener('resize', () => view.resize());

canvas.addEventListener('pointerdown', () => { resumeAudio(); }, { passive: true });
document.addEventListener('pointerdown', () => { initAudio(); resumeAudio(); }, { passive: true, once: true });

// ---- run state -----------------------------------------------------------------
let run = null;   // { tier, matchIdx, gold, embers, risk, owned, matchesWon, shoves }
let world = null;
let musicOn = false;

function freshRun(tier) {
  return {
    tier, matchIdx: 0, gold: 0, embers: [], risk: false,
    owned: { actives: [], utility: null, ranks: { force: 0, quick: 0, great: 0 } },
    matchesWon: 0, shoves: 0, playerWins: 0, rivalWins: 0,
  };
}

function playerCfg() {
  const o = run.owned;
  const offensive = o.actives.filter((s) => SPELLS[s].offensive).length;
  return {
    color: Meta.robe || PLAYER_COLOR,
    hpMax: C.HP + (o.utility === 'heart' ? 30 : 0),
    speed: C.SPEED * (o.utility === 'boots' ? 1.12 : 1),
    fbImpulse: C.FB_IMPULSE * (1 + 0.15 * o.ranks.force) * (1 - C.OFFENSE_PENALTY * offensive),
    fbCd: C.FB_CD * Math.pow(0.85, o.ranks.quick),
    fbRadius: C.FB_RADIUS * (1 + 0.3 * o.ranks.great),
    fbDmg: C.FB_DMG + 4 * o.ranks.great,
    actives: o.actives,
    wardMax: o.utility === 'ward' ? 1 : 0,
  };
}

// ---- shop / draft item model ------------------------------------------------------
function spellPool() {
  return Object.values(SPELLS).filter((s) => !s.locked || Meta.unlockedSpells.includes(s.id));
}

function shopItems() {
  const o = run.owned;
  const items = [];
  for (const key of ['force', 'quick', 'great']) {
    const u = UPGRADES[key];
    const rank = o.ranks[key];
    if (rank < u.costs.length) {
      const cost = u.costs[rank];
      items.push({ id: `up_${key}`, kind: 'upgrade', track: key, icon: u.icon, name: `${u.name} ${'I'.repeat(rank + 1)}`, desc: u.desc, cost, disabled: run.gold < cost });
    }
  }
  for (const s of spellPool()) {
    if (s.kind === 'active') {
      if (o.actives.includes(s.id)) continue;
      const full = o.actives.length >= 2;
      items.push({ id: s.id, kind: 'active', icon: s.icon, name: s.name, desc: s.desc, cost: s.cost, sub: s.offensive ? 'offensive — −6% base shove' : undefined, disabled: full || run.gold < s.cost, ...(full ? { sub: 'SPELL SLOTS FULL' } : {}) });
    } else if (s.kind === 'utility') {
      if (o.utility === s.id) continue;
      const full = !!o.utility;
      items.push({ id: s.id, kind: 'utility', icon: s.icon, name: s.name, desc: s.desc, cost: s.cost, disabled: full || run.gold < s.cost, ...(full ? { sub: 'TRINKET SLOT FULL' } : {}) });
    }
  }
  return items;
}

function draftOptions() {
  const pool = shopItems().map((it) => ({ ...it, cost: null, disabled: false, free: true }))
    .filter((it) => !(it.sub === 'SPELL SLOTS FULL' || it.sub === 'TRINKET SLOT FULL'));
  // shuffle, take 3; pad with gold if thin
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const opts = pool.slice(0, 3);
  while (opts.length < 3) opts.push({ id: 'gold', kind: 'gold', icon: '◆', name: 'Purse of Gold', desc: '+8 gold for the Forge.', free: true });
  return opts;
}

function grantItem(it) {
  const o = run.owned;
  if (it.kind === 'upgrade') o.ranks[it.track]++;
  else if (it.kind === 'active') o.actives.push(it.id);
  else if (it.kind === 'utility') o.utility = it.id;
  else if (it.kind === 'gold') run.gold += 8;
}

// ---- flow: menu -> ember -> (draft -> match(rounds+shop) -> matchEnd)*5 -> runEnd ----
function gotoMenu() {
  world = null;
  setPulse(false);
  renderMenu({
    begin: beginRun,
    sanctum: () => renderSanctum(gotoMenu),
    help: () => renderHelp(gotoMenu),
    settingsChanged: applySettings,
  });
}

function applySettings() {
  FX.reducedMotion = Meta.reducedMotion;
  setSfx(Meta.sfx);
  if (!Meta.music) { stopMusic(); musicOn = false; }
  else if (!musicOn && run) { startMusic(); musicOn = true; }
}

function beginRun(tier) {
  run = freshRun(tier);
  Meta.runs++;
  saveMeta();
  if (Meta.music && !musicOn) { startMusic(); musicOn = true; }
  const pool = Object.values(EMBERS).filter((e) => !e.locked || Meta.unlockedEmbers.includes(e.id)).map((e) => e.id);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const offers = pool.slice(0, 2);
  renderEmberPick(offers, pool.slice(2), (chosen, risk) => {
    run.embers = [chosen];
    run.risk = risk;
    const rest = pool.filter((id) => id !== chosen);
    if (risk && rest.length) run.embers.push(rest[Math.floor(Math.random() * rest.length)]);
    if (tier > 0) { // ascension: one extra ember, always
      const more = rest.filter((id) => !run.embers.includes(id));
      if (more.length) run.embers.push(more[Math.floor(Math.random() * more.length)]);
    }
    toast(run.embers.map((id) => `${EMBERS[id].icon} ${EMBERS[id].name}`).join('  +  '), 3.2);
    gotoDraft();
  });
}

function lineupFor(matchIdx) {
  const lineup = [...GAUNTLET[matchIdx].rivals];
  if (run.embers.includes('twins')) {
    const extra = Object.keys(RIVALS).filter((r) => !lineup.includes(r) && r !== 'ash');
    lineup.push(extra[Math.floor(Math.random() * extra.length)]);
  }
  return lineup;
}

function gotoDraft() {
  renderDraft(run.matchIdx, lineupFor(run.matchIdx), draftOptions(), (item) => {
    grantItem(item);
    startMatch();
  });
}

function startMatch() {
  run.playerWins = 0;
  run.rivalWins = 0;
  world = new World({
    lineup: lineupFor(run.matchIdx),
    aiTier: run.matchIdx,
    ascension: run.tier,
    embers: run.embers,
    matchIdx: run.matchIdx,
    player: playerCfg(),
  }, onWorldEvent);
  buildSpellButtons(run.owned.actives, castActive);
  showScreen(null);
  clearFX();
  world.startRound();
  sfx.countTick();
  if (!Meta.coached) {
    Meta.coached = true; saveMeta();
    setTimeout(() => toast('LEFT THUMB — DRAG TO MOVE'), 400);
    setTimeout(() => toast('RIGHT THUMB — DRAG TO AIM, RELEASE TO FIRE'), 3400);
    setTimeout(() => toast('SHOVE THEM INTO THE LAVA'), 6600);
  }
}

// track the first few fireballs thrown — the on-screen control hints stay up until then
function countFire() {
  Meta.fireCount = (Meta.fireCount || 0) + 1;
  if (Meta.fireCount <= 8) saveMeta();
}

function castActive(id) {
  if (!world) return;
  resumeAudio();
  world.castPlayerSpell(id, input.aiming(), input.joystick());
}

function onWorldEvent(type, data) {
  if (type === 'go') { sfx.countGo(); return; }
  if (type === 'kill') {
    const { victim, killer, lava } = data;
    if (lava) { // slow-mo on the money moment
      loop.speed = 0.32;
      clearTimeout(onWorldEvent._slow);
      onWorldEvent._slow = setTimeout(() => { loop.speed = 1; }, victim.isPlayer ? 650 : 480);
    }
    if (killer && killer.isPlayer && !victim.isPlayer) {
      run.gold += C.GOLD_KILL;
      run.shoves++;
      Meta.shoves++;
      floatText(victim.x, victim.y - 30, `+${C.GOLD_KILL}◆`, { color: '#ffd24a', size: 17 });
    }
    if (victim.isPlayer) sfx.hurt();
    return;
  }
  if (type === 'roundOver') {
    const winner = data.winner;
    const p = world.player;
    const top2 = p.deadOrder === -1 || p.deadOrder >= world.wizards.length - 2;
    let earned = 0;
    if (top2) earned += C.GOLD_TOP2;
    if (winner === p) { earned += C.GOLD_WIN; run.playerWins++; sfx.roundWin(); }
    else if (winner) { winner.roundWins++; sfx.roundLose(); }
    run.gold += earned;
    run.rivalWins = Math.max(0, ...world.wizards.filter((w) => !w.isPlayer).map((w) => w.roundWins));

    run.rivalWinMap = {};
    world.wizards.forEach((w) => { if (!w.isPlayer) run.rivalWinMap[w.id] = w.roundWins; });

    if (run.playerWins >= C.ROUND_TARGET) return matchWon();
    if (run.rivalWins >= C.ROUND_TARGET) return runOver(false);
    openShop();
  }
}

// between rounds: the Forge
function openShop() {
  const offensive = run.owned.actives.filter((s) => SPELLS[s].offensive).length;
  const note = offensive > 0 ? `Carrying ${offensive} offensive spell${offensive > 1 ? 's' : ''}: base shove −${offensive * 6}%.` : null;
  renderShop(run.gold, shopItems(), note, {
    buy: (it) => {
      if (run.gold < it.cost) return;
      run.gold -= it.cost;
      grantItem(it);
      sfx.buy();
      openShop();
    },
    done: () => {
      // rebuild the world so shop purchases (stats/spells) take effect
      startRoundFresh();
    },
  });
}

function startRoundFresh() {
  world = new World({
    lineup: world.cfg.lineup,
    aiTier: run.matchIdx,
    ascension: run.tier,
    embers: run.embers,
    matchIdx: run.matchIdx,
    player: playerCfg(),
  }, onWorldEvent);
  // carry per-wizard round-win tallies into the rebuilt world
  world.player.roundWins = run.playerWins;
  world.wizards.forEach((w) => { if (!w.isPlayer) w.roundWins = (run.rivalWinMap && run.rivalWinMap[w.id]) || 0; });
  buildSpellButtons(run.owned.actives, castActive);
  showScreen(null);
  clearFX();
  world.startRound();
  sfx.countTick();
}

function matchWon() {
  run.matchesWon++;
  run.matchIdx++;
  Meta.cinders += 2;
  Meta.bestMatch = Math.max(Meta.bestMatch, run.matchIdx);
  saveMeta();
  sfx.matchWin();
  if (run.matchIdx >= C.GAUNTLET_LEN) return runOver(true);
  renderMatchEnd(run.matchIdx - 1, lineupFor(run.matchIdx), gotoDraft);
}

function runOver(win) {
  setPulse(false);
  let cinders = 0;
  if (win) {
    cinders += 8;
    Meta.clears++;
    Meta.bestMatch = 6;
    if (run.tier === Meta.tier) Meta.tier++;
  }
  if (run.risk) cinders = Math.ceil((cinders + run.matchesWon * 2) * 1.5) - run.matchesWon * 2; // risk bonus on the whole haul
  Meta.cinders += cinders;
  saveMeta();
  if (!win) sfx.runOver();
  const stats = {
    matchIdx: run.matchIdx, matchesWon: run.matchesWon, shoves: run.shoves,
    cinders: cinders + run.matchesWon * 2, risk: run.risk,
    newTier: win && run.tier === Meta.tier - 1 ? Meta.tier : 0,
  };
  renderRunEnd(win, stats, () => { run = null; gotoMenu(); });
}

// ---- the loop -----------------------------------------------------------------------
const loop = new GameLoop({
  update(dt) {
    updateFX(dt);
    if (!world) return;
    if (FX.freeze > 0) { FX.freeze -= dt; return; } // hit-pause: sim holds, fx breathe
    const fire = input.takeFire();
    if (fire && world.player.alive && world.state === 'fight') { world.requestFire(fire); countFire(); }
    const tap = input.takeTap();
    if (tap && world.player.alive && world.state === 'fight') {
      const p = world.player;
      const len = Math.hypot(tap.x - p.x, tap.y - p.y);
      if (len > 8) { world.requestFire({ nx: (tap.x - p.x) / len, ny: (tap.y - p.y) / len }); countFire(); }
    }
    world.update(dt, { joy: input.joystick() });
    setPulse(world.state === 'fight' && world.arenaR < 130 && Meta.music);
    if (world.state === 'fight') setMusicIntensity(1 - (world.arenaR - C.R_FLOOR) / (C.R_START - C.R_FLOOR));
  },
  render() {
    let hud = null;
    if (world && run) {
      const firstRival = world.wizards.find((w) => !w.isPlayer);
      hud = {
        target: C.ROUND_TARGET,
        playerWins: run.playerWins, rivalWins: run.rivalWins,
        playerColor: world.player.color, rivalColor: firstRival ? firstRival.color : '#ff5a1e',
        label: `MATCH ${run.matchIdx + 1} — ${world.cfg.lineup.map((r) => RIVALS[r].name.toUpperCase()).join(' & ')}`,
        gold: run.gold,
        emberIcons: run.embers.map((id) => EMBERS[id].icon).join(' '),
        // big control hints until the player has thrown a few fireballs
        hints: (Meta.fireCount || 0) < 6 && (world.state === 'count' || world.state === 'fight'),
      };
      updateSpellButtons(world);
    }
    renderer.draw(world, hud, 1 / 60);
  },
});

applySettings();
gotoMenu();
loop.start();

// ---- test hooks (KB: verification) ----------------------------------------------------
window.__game = {
  get world() { return world; },
  get run() { return run; },
  get meta() { return Meta; },
  loop,
  startRun(tier = 0) { beginRun(tier); },
  // jump straight into a fight (testing)
  quickFight(matchIdx = 0) {
    run = freshRun(0);
    run.matchIdx = Math.min(matchIdx, GAUNTLET.length - 1);
    run.embers = [];
    startMatch();
  },
  winRound() { if (world) world.wizards.forEach((w) => { if (!w.isPlayer) { w.hp = 0; w.alive && world._die(w, true); } }); },
};
