// Emberlock — bootstrap + the run/match/round state machine.
// A RUN = 1 Ember + 5 matches (lose one match -> run over).
// A MATCH = first to 3 round wins. A ROUND = last wizard standing.
import { CanvasView } from './engine/canvas.js';
import { TwinStick } from './engine/input.js';
import { GameLoop } from './engine/loop.js';
import { FX, updateFX, clearFX, floatText, burst } from './engine/fx.js';
import { initAudio, resumeAudio, sfx, setSfx, startMusic, stopMusic, setPulse, setMusicIntensity, setMusicKey } from './audio.js';
import { C, SPELLS, UPGRADES, EMBERS, RIVALS, GAUNTLET, TRIALS, PLAYER_COLOR, barkFor } from './game/data.js';
import { Meta, loadMeta, saveMeta } from './game/meta.js';
import { World } from './game/world.js';
import { Renderer } from './game/render.js';
import {
  $, showScreen, toast, renderMenu, renderEmberPick, renderDraft, renderShop,
  renderMatchEnd, renderRunEnd, renderSanctum, renderHelp, renderTrials, renderTrialEnd,
  buildSpellButtons, updateSpellButtons,
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
let trial = null; // active TRIALS entry (trial mode and gauntlet mode are exclusive)
let trialWins = null; // { player, rival } round tallies during a trial
let world = null;
let musicOn = false;

function freshRun(tier) {
  return {
    tier, matchIdx: 0, gold: 0, embers: [], risk: false,
    owned: { actives: [], utility: null, ranks: { force: 0, quick: 0, great: 0, brand: 0 } },
    matchesWon: 0, shoves: 0, playerWins: 0, rivalWins: 0,
  };
}

function playerCfg() {
  const o = run.owned;
  // offence "weight": full 1 per offensive spell; Surge etc. carry a partial weight
  const offensive = o.actives.reduce((n, s) => n + (SPELLS[s].offensive ? 1 : (SPELLS[s].offenseWeight || 0)), 0);
  return {
    color: Meta.robe || PLAYER_COLOR,
    hpMax: C.HP + (o.utility === 'heart' ? 20 : 0),
    speed: C.SPEED * (o.utility === 'boots' ? 1.12 : 1),
    fbImpulse: C.FB_IMPULSE * (1 + 0.15 * o.ranks.force) * (1 - C.OFFENSE_PENALTY * offensive),
    fbCd: C.FB_CD * Math.pow(0.85, o.ranks.quick),
    fbRadius: C.FB_RADIUS * (1 + 0.25 * o.ranks.great),
    fbDmg: C.FB_DMG + 4 * o.ranks.great,
    fbSpeed: C.FB_SPEED * (o.ranks.quick >= UPGRADES.quick.costs.length ? 1.22 : 1),
    forceCap: o.ranks.force >= UPGRADES.force.costs.length,
    greatCap: o.ranks.great >= UPGRADES.great.costs.length,
    heavy: o.utility === 'heart',
    brandRank: o.ranks.brand || 0,
    kbResist: o.utility === 'lodestone' ? 0.22 : 0,
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
  for (const key of ['force', 'quick', 'great', 'brand']) {
    const u = UPGRADES[key];
    const rank = o.ranks[key];
    if (rank < u.costs.length) {
      const cost = u.costs[rank];
      const isFinal = rank + 1 === u.costs.length;
      const desc = isFinal && u.cap ? `${u.desc}  —  ${u.cap}` : u.desc;
      items.push({ id: `up_${key}`, kind: 'upgrade', track: key, icon: u.icon, name: `${u.name} ${'I'.repeat(rank + 1)}`, desc, cost, disabled: run.gold < cost });
    }
  }
  for (const s of spellPool()) {
    if (s.kind === 'active') {
      if (o.actives.includes(s.id)) continue;
      const full = o.actives.length >= 2;
      const shoveCut = s.offensive ? 6 : Math.round((s.offenseWeight || 0) * 6);
      items.push({ id: s.id, kind: 'active', icon: s.icon, name: s.name, desc: s.desc, cost: s.cost, sub: shoveCut ? `−${shoveCut}% base shove` : undefined, disabled: full || run.gold < s.cost, ...(full ? { sub: 'SPELL SLOTS FULL' } : {}) });
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
  trial = null;
  setPulse(false);
  setMusicKey(1);
  renderMenu({
    begin: beginRun,
    trials: gotoTrials,
    sanctum: () => renderSanctum(gotoMenu),
    help: () => renderHelp(gotoMenu),
    settingsChanged: applySettings,
  });
}

function gotoTrials() {
  world = null;
  trial = null;
  renderTrials({ start: startTrial, back: gotoMenu });
}

// ---- trials: one crafted match, fixed rules, reward pays once ----------------------
function trialPlayerCfg(t) {
  const ranks = { force: 0, quick: 0, great: 0, brand: 0, ...(t.ranks || {}) };
  const actives = t.actives || [];
  const offensive = actives.reduce((n, s) => n + (SPELLS[s].offensive ? 1 : (SPELLS[s].offenseWeight || 0)), 0);
  return {
    color: Meta.robe || PLAYER_COLOR,
    hpMax: C.HP + (t.utility === 'heart' ? 30 : 0),
    speed: C.SPEED * (t.utility === 'boots' ? 1.12 : 1),
    fbImpulse: C.FB_IMPULSE * (1 + 0.15 * ranks.force) * (1 - C.OFFENSE_PENALTY * offensive) * (t.impulseMul || 1),
    fbCd: C.FB_CD * Math.pow(0.85, ranks.quick),
    fbRadius: C.FB_RADIUS * (1 + 0.25 * ranks.great),
    fbDmg: C.FB_DMG + 4 * ranks.great,
    fbSpeed: C.FB_SPEED * (ranks.quick >= UPGRADES.quick.costs.length ? 1.22 : 1),
    forceCap: ranks.force >= UPGRADES.force.costs.length,
    greatCap: ranks.great >= UPGRADES.great.costs.length,
    heavy: t.utility === 'heart',
    brandRank: ranks.brand || 0,
    kbResist: t.utility === 'lodestone' ? 0.22 : 0,
    actives,
    wardMax: t.utility === 'ward' ? 1 : 0,
  };
}

function startTrial(t) {
  run = null;
  trial = t;
  trialWins = { player: 0, rival: 0 };
  world = new World({
    lineup: t.lineup,
    aiTier: t.aiTier,
    ascension: 0,
    embers: t.embers || [],
    matchIdx: 0,
    player: trialPlayerCfg(t),
    arena: t.arena,
    neutralMines: t.mines,
    theme: t.theme,
  }, onWorldEvent);
  setMusicKey(world.theme.musicShift);
  buildSpellButtons(t.actives || [], castActive);
  showScreen(null);
  clearFX();
  if (Meta.music && !musicOn) { startMusic(); musicOn = true; }
  world.startRound();
  sfx.countTick();
}

function endTrial(win) {
  setPulse(false);
  const t = trial;
  const firstClear = win && !Meta.trialsDone.includes(t.id);
  if (firstClear) {
    Meta.trialsDone.push(t.id);
    Meta.cinders += t.reward;
    if (t.robe && !Meta.robes.includes(t.robe)) Meta.robes.push(t.robe);
    saveMeta();
  }
  if (win) sfx.matchWin(); else sfx.runOver();
  renderTrialEnd(win, t, firstClear, {
    retry: () => startTrial(t),
    back: gotoTrials,
  });
}

function applySettings() {
  FX.reducedMotion = Meta.reducedMotion;
  setSfx(Meta.sfx);
  if (!Meta.music) { stopMusic(); musicOn = false; }
  else if (!musicOn && run) { startMusic(); musicOn = true; }
}

function beginRun(tier) {
  trial = null;
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
  const mainId = GAUNTLET[run.matchIdx].rivals[0];
  // after repeated losses to this rival, their draft taunt sharpens
  const taunt = barkFor(mainId, 'loss', Meta.lossesTo[mainId] || 0);
  renderDraft(run.matchIdx, lineupFor(run.matchIdx), draftOptions(), (item) => {
    grantItem(item);
    startMatch();
  }, taunt);
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
    theme: GAUNTLET[run.matchIdx].theme,
  }, onWorldEvent);
  setMusicKey(world.theme.musicShift);
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
  if (type === 'edgeCatch') {
    // clutch survival at the brink: a brief breath of slow-mo (never override a kill's)
    if (loop.speed === 1) {
      loop.speed = 0.6;
      setTimeout(() => { if (loop.speed === 0.6) loop.speed = 1; }, 240);
    }
    return;
  }
  if (type === 'kill') {
    const { victim, killer, lava } = data;
    // the BIG kill: a boss falls, or the kill that takes the match — detonate harder
    const lastFoe = !victim.isPlayer && world.wizards.every((w) => w.isPlayer || !w.alive);
    const matchPoint = lastFoe && (trial
      ? trialWins.player >= trial.target - 1
      : run && run.playerWins >= C.ROUND_TARGET - 1);
    const bigKill = lava && !victim.isPlayer && ((victim.rival && victim.rival.boss) || matchPoint);
    if (lava) { // slow-mo on the money moment
      loop.speed = Math.min(loop.speed, bigKill ? 0.22 : 0.32);
      clearTimeout(onWorldEvent._slow);
      onWorldEvent._slow = setTimeout(() => { loop.speed = 1; }, bigKill ? 850 : victim.isPlayer ? 650 : 480);
      if (bigKill) sfx.bossLavaDeath();
    }
    if (killer && killer.isPlayer && !victim.isPlayer) {
      Meta.shoves++;
      if (lava) floatText(victim.x, victim.y - 48, `${victim.name.toUpperCase()} FALLS`, { color: bigKill ? '#fff3c8' : '#ffd24a', size: bigKill ? 21 : 15, crit: bigKill });
      if (run) {
        run.gold += C.GOLD_KILL;
        run.shoves++;
        floatText(victim.x, victim.y - 30, `+${C.GOLD_KILL}◆`, { color: '#ffd24a', size: 17 });
      }
    }
    if (victim.isPlayer) {
      sfx.hurt();
      // remember HOW the run is about to end, so the death screen can say why
      if (run) {
        run.lastDeath = {
          lava,
          side: victim.y < C.AY ? 'north' : 'south',
          killer: killer && !killer.isPlayer ? killer.name : null,
          roundsLeft: Math.max(0, C.ROUND_TARGET - run.rivalWins - 1),
          atMatchPoint: run.rivalWins >= C.ROUND_TARGET - 1,
        };
      }
    }
    return;
  }
  if (type === 'roundOver') {
    const winner = data.winner;
    const p = world.player;
    if (trial) {
      if (winner === p) { trialWins.player++; sfx.roundWin(); }
      else if (winner) { trialWins.rival++; sfx.roundLose(); }
      if (trialWins.player >= trial.target) return endTrial(true);
      if (trialWins.rival >= trial.target) return endTrial(false);
      world.startRound(); // straight into the next round — no shop in trials
      sfx.countTick();
      return;
    }
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
  const weight = run.owned.actives.reduce((n, s) => n + (SPELLS[s].offensive ? 1 : (SPELLS[s].offenseWeight || 0)), 0);
  const note = weight > 0 ? `Your active spells cost base shove −${Math.round(weight * 6)}%.` : null;
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
    theme: GAUNTLET[run.matchIdx].theme,
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
  const mainId = GAUNTLET[run.matchIdx].rivals[0];
  // first time ever beating this rival? earn their "you finally beat me" line
  const firstWin = !(Meta.winsOver[mainId] > 0);
  // credit a win over each rival just beaten (drives their "you finally beat me" bark)
  for (const id of GAUNTLET[run.matchIdx].rivals) Meta.winsOver[id] = (Meta.winsOver[id] || 0) + 1;
  run.matchesWon++;
  run.matchIdx++;
  Meta.cinders += 2;
  Meta.bestMatch = Math.max(Meta.bestMatch, run.matchIdx);
  saveMeta();
  const bark = firstWin ? barkFor(mainId, 'firstWin') : null;
  if (run.matchIdx >= C.GAUNTLET_LEN) return runOver(true, bark); // the clear gets its own fanfare
  sfx.matchWin();
  renderMatchEnd(run.matchIdx - 1, lineupFor(run.matchIdx), gotoDraft, bark);
}

// turn the recorded losing event into a one-line "why you lost"
function deathCause(d) {
  if (!d) return null;
  const when = d.atMatchPoint ? ' at match point' : '';
  if (d.killer) {
    return `${d.killer} shoved you into the ${d.side} fire${when}.`;
  }
  if (d.lava) {
    if (d.atMatchPoint) return 'You stepped onto the rim with the match already in your grasp.';
    if (d.roundsLeft > 0) return `You stepped onto the rim with ${d.roundsLeft} ${d.roundsLeft === 1 ? 'round' : 'rounds'} in hand.`;
    return `You stepped onto the ${d.side} rim and the lava took you.`;
  }
  return null;
}

function runOver(win, winBark) {
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
  // credit the rival who ended the run, then surface their escalating bark
  let bark = null;
  if (!win) {
    const ender = GAUNTLET[run.matchIdx].rivals[0];
    Meta.lossesTo[ender] = (Meta.lossesTo[ender] || 0) + 1;
    bark = barkFor(ender, 'loss', Meta.lossesTo[ender]);
  }
  saveMeta();
  if (win) sfx.gauntletClear(); else sfx.runOver();
  const stats = {
    matchIdx: run.matchIdx, matchesWon: run.matchesWon, shoves: run.shoves,
    cinders: cinders + run.matchesWon * 2, risk: run.risk,
    newTier: win && run.tier === Meta.tier - 1 ? Meta.tier : 0,
    cause: !win ? deathCause(run.lastDeath) : null,
    bark: win ? winBark : bark,
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
    // sub-threshold aim release: too small to fire, but never leave it silent —
    // a tiny puff at the release point + a soft tone so the control always answers
    const fizzle = input.takeFizzle();
    if (fizzle && world.player.alive && world.state === 'fight') {
      burst(fizzle.x, fizzle.y, 5, { color: '#9fd8ff', speed: 55, life: 0.32, r: 1.8 });
      sfx.fizzle();
    }
    world.update(dt, { joy: input.joystick() });
    setPulse(world.state === 'fight' && world.arenaR < 130 && Meta.music);
    if (world.state === 'fight') setMusicIntensity(1 - (world.arenaR - C.R_FLOOR) / (C.R_START - C.R_FLOOR));
  },
  render() {
    let hud = null;
    if (world && (run || trial)) {
      const firstRival = world.wizards.find((w) => !w.isPlayer);
      hud = {
        target: trial ? trial.target : C.ROUND_TARGET,
        playerWins: trial ? trialWins.player : run.playerWins,
        rivalWins: trial ? trialWins.rival : run.rivalWins,
        playerColor: world.player.color, rivalColor: firstRival ? firstRival.color : '#ff5a1e',
        label: trial
          ? `TRIAL ${trial.num} — ${trial.name.toUpperCase()}`
          : `MATCH ${run.matchIdx + 1} — ${world.cfg.lineup.map((r) => RIVALS[r].name.toUpperCase()).join(' & ')}`,
        gold: trial ? null : run.gold,
        emberIcons: (trial ? (trial.embers || []) : run.embers).map((id) => EMBERS[id].icon).join(' '),
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
  startTrial(i = 0) { startTrial(TRIALS[Math.min(i, TRIALS.length - 1)]); },
  openTrials() { gotoTrials(); },
};
