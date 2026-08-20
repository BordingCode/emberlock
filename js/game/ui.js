// DOM screens & HUD buttons. The canvas is the game; DOM is menus, cards, buttons.
import { SPELLS, UPGRADES, EMBERS, RIVALS, META_SHOP, TRIALS, TROPHY_ROBE, STANCES, stanceById, stanceReward } from './data.js';
import { Meta, saveMeta } from './meta.js';
import { sfx } from '../audio.js';

export const $ = (s) => document.querySelector(s);
export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  $('#screens').classList.toggle('open', !!id);
  $('#hud').classList.toggle('hidden', !!id);
}

let toastTimer = null;
export function toast(text, dur = 2.8) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), dur * 1000);
}

// ---- main menu ---------------------------------------------------------------
export function renderMenu(cb) {
  const s = $('#scr-menu');
  s.innerHTML = '';
  s.append(el('h1', 'title', 'EMBER<span>LOCK</span>'));
  s.append(el('p', 'tagline', 'Last wizard standing. The island is sinking.'));

  const stats = el('div', 'menu-stats');
  stats.append(el('div', '', `<b>${Meta.cinders}</b> cinders`));
  stats.append(el('div', '', Meta.bestMatch >= 6 ? '<b>Gauntlet cleared</b>' : `Best: <b>match ${Meta.bestMatch || '—'}</b>`));
  if (Meta.tier > 0) stats.append(el('div', '', `Ascension <b>${Meta.tier}</b> unlocked`));
  s.append(stats);

  let tier = Math.min(Meta.tier, Meta.lastTier ?? Meta.tier);
  const begin = el('button', 'btn btn-primary', 'BEGIN THE GAUNTLET');
  if (Meta.tier > 0) {
    const tierRow = el('div', 'tier-row');
    const lbl = el('span', '', '');
    const setLbl = () => { lbl.innerHTML = tier === 0 ? 'Tier 0 — the Gauntlet' : `Ascension ${tier} — sharper rivals, +1 Ember`; };
    setLbl();
    const minus = el('button', 'btn btn-small', '−');
    const plus = el('button', 'btn btn-small', '+');
    minus.onclick = () => { tier = Math.max(0, tier - 1); setLbl(); };
    plus.onclick = () => { tier = Math.min(Meta.tier, tier + 1); setLbl(); };
    tierRow.append(minus, lbl, plus);
    s.append(tierRow);
  }
  begin.onclick = () => { sfx.pick(); Meta.lastTier = tier; saveMeta(); cb.begin(tier); };
  s.append(begin);

  const row = el('div', 'menu-row');
  const trials = el('button', 'btn', `TRIALS <small>${Meta.trialsDone.length}/${TRIALS.length}</small>`);
  trials.onclick = () => cb.trials();
  const sanctum = el('button', 'btn', `SANCTUM <small>${Meta.cinders} ◈</small>`);
  sanctum.onclick = () => cb.sanctum();
  const help = el('button', 'btn', 'HOW TO PLAY');
  help.onclick = () => cb.help();
  row.append(trials, sanctum, help);
  s.append(row);

  const opts = el('div', 'menu-opts');
  const mk = (label, key) => {
    const b = el('button', 'btn btn-toggle' + (Meta[key] ? ' on' : ''), label);
    b.onclick = () => { Meta[key] = !Meta[key]; b.classList.toggle('on', Meta[key]); saveMeta(); cb.settingsChanged(); };
    return b;
  };
  opts.append(mk('SOUND', 'sfx'), mk('MUSIC', 'music'), mk('CALM FX', 'reducedMotion'));
  s.append(opts);
  s.append(el('p', 'lose-note', 'Lose one match and the run is over. No second chances.'));
  showScreen('scr-menu');
}

// ---- card helper ----------------------------------------------------------------
function card(item, onPick) {
  const c = el('button', 'card' + (item.disabled ? ' disabled' : ''));
  c.append(el('div', 'card-icon', item.icon));
  c.append(el('div', 'card-name', item.name));
  if (item.sub) c.append(el('div', 'card-sub', item.sub));
  c.append(el('div', 'card-desc', item.desc));
  if (item.cost != null) c.append(el('div', 'card-cost', item.owned ? 'OWNED' : `${item.cost} ${item.curr || '◆'}`));
  if (!item.disabled) c.onclick = () => onPick(item);
  return c;
}

// ---- ember pick (run start) -------------------------------------------------------
export function renderEmberPick(offers, riskPool, cb) {
  const s = $('#scr-ember');
  s.innerHTML = '';
  s.append(el('h2', 'h', 'CHOOSE YOUR EMBER'));
  s.append(el('p', 'sub', 'One rule bends for this whole run.'));
  const row = el('div', 'card-row');
  let chosen = null;
  let risk = false;
  const confirm = el('button', 'btn btn-primary disabled', 'SEAL IT');
  offers.forEach((id) => {
    const e = EMBERS[id];
    const c = card({ icon: e.icon, name: e.name, desc: e.desc }, () => {
      chosen = id;
      row.querySelectorAll('.card').forEach((x) => x.classList.remove('sel'));
      c.classList.add('sel');
      confirm.classList.remove('disabled');
      sfx.pick();
    });
    row.append(c);
  });
  s.append(row);
  if (riskPool.length) {
    const rb = el('button', 'btn btn-toggle risk-btn', '☄ RISK: draw a SECOND ember, +50% cinders');
    rb.onclick = () => { risk = !risk; rb.classList.toggle('on', risk); sfx.pick(); };
    s.append(rb);
  }
  confirm.onclick = () => {
    if (!chosen) return;
    sfx.emberSeal();
    cb(chosen, risk);
  };
  s.append(confirm);
  showScreen('scr-ember');
}

// ---- draft (before each match): pick 1 of 3, free ----------------------------------
export function renderDraft(matchIdx, lineup, options, cb, taunt) {
  const s = $('#scr-draft');
  s.innerHTML = '';
  const main = RIVALS[lineup[0]];
  s.append(el('h2', 'h', `MATCH ${matchIdx + 1} OF 5`));
  const foes = lineup.map((r) => `<b style="color:${RIVALS[r].color}">${RIVALS[r].name} ${RIVALS[r].title}</b>`).join(' & ');
  s.append(el('p', 'sub', `You face ${foes}.`));
  // an escalated bark (after repeated losses) replaces the default tactical taunt; else fall back
  s.append(el('p', 'taunt', taunt || `“${main.taunt}”`));
  s.append(el('h3', 'h3', 'TAKE ONE GIFT'));
  const row = el('div', 'card-row');
  options.forEach((item) => row.append(card(item, (it) => { sfx.pick(); cb(it); })));
  s.append(row);
  showScreen('scr-draft');
}

// ---- shop (between rounds) ----------------------------------------------------------
export function renderShop(gold, items, note, cb) {
  const s = $('#scr-shop');
  s.innerHTML = '';
  s.append(el('h2', 'h', 'THE FORGE'));
  s.append(el('p', 'sub', `<b class="gold">${gold} ◆</b> — kills and round wins pay for power.`));
  if (note) s.append(el('p', 'shop-note', note));
  const row = el('div', 'card-grid');
  items.forEach((item) => row.append(card(item, (it) => cb.buy(it))));
  s.append(row);
  const go = el('button', 'btn btn-primary', 'TO BATTLE');
  go.onclick = () => cb.done();
  s.append(go);
  showScreen('scr-shop');
}

// ---- match end (won a match, next looms) ---------------------------------------------
export function renderMatchEnd(matchIdx, nextLineup, cb, bark) {
  const s = $('#scr-matchend');
  s.innerHTML = '';
  s.append(el('h2', 'h win', 'MATCH WON'));
  s.append(el('p', 'sub', `+2 cinders banked. ${5 - matchIdx - 1} ${5 - matchIdx - 1 === 1 ? 'match' : 'matches'} stand between you and the Last Flame.`));
  if (bark) s.append(el('p', 'taunt', bark));
  const go = el('button', 'btn btn-primary', 'ONWARD');
  go.onclick = () => cb();
  s.append(go);
  showScreen('scr-matchend');
}

// ---- run end ----------------------------------------------------------------------------
export function renderRunEnd(win, stats, cb) {
  const s = $('#scr-runend');
  s.innerHTML = '';
  s.append(el('h2', 'h ' + (win ? 'win' : 'lose'), win ? 'THE GAUNTLET FALLS' : 'THE RUN ENDS HERE'));
  s.append(el('p', 'sub', win
    ? 'Every rival shoved into the fire. The island remembers your name.'
    : `Defeated in match ${stats.matchIdx + 1}. The lava keeps what it takes — no rematch, no mercy.`));
  if (!win && stats.cause) s.append(el('p', 'lose-note', stats.cause));
  if (stats.bark) s.append(el('p', 'taunt', stats.bark));
  const grid = el('div', 'end-stats');
  grid.append(el('div', '', `<b>${stats.shoves}</b> shoves`));
  grid.append(el('div', '', `<b>${stats.matchesWon}</b> matches won`));
  grid.append(el('div', '', `<b>+${stats.cinders}</b> cinders${stats.risk ? ' (risk ×1.5)' : ''}`));
  s.append(grid);
  if (stats.newTier) s.append(el('p', 'unlock-note', `☄ ASCENSION ${stats.newTier} UNLOCKED — sharper rivals await.`));
  const go = el('button', 'btn btn-primary', 'RETURN');
  go.onclick = () => cb();
  s.append(go);
  showScreen('scr-runend');
}

// ---- trials: the challenge ladder ------------------------------------------------------------
// a trial counts as cleared (opens the next rung) on ANY stance — only ✦ needs PURE
export function trialCleared(id) {
  return Meta.trialsDone.includes(id) || Meta.trialsAided.includes(id);
}

export function renderTrials(cb) {
  const s = $('#scr-trials');
  s.innerHTML = '';
  s.append(el('h2', 'h', 'THE TRIALS'));
  const aidedCount = TRIALS.filter((t) => !Meta.trialsDone.includes(t.id) && Meta.trialsAided.includes(t.id)).length;
  s.append(el('p', 'sub', `Twelve crafted fights, each unlocking the next. <b>${Meta.trialsDone.length}/${TRIALS.length}</b> conquered${aidedCount ? ` · <b class="aided-txt">${aidedCount}</b> cleared aided` : ''}.`));
  const backTop = el('button', 'btn btn-small', 'BACK');
  backTop.onclick = () => cb.back();
  s.append(backTop);
  const list = el('div', 'trial-list');
  TRIALS.forEach((t, i) => {
    const done = Meta.trialsDone.includes(t.id);
    const aided = !done && Meta.trialsAided.includes(t.id);
    const prev = TRIALS[i - 1];
    const unlocked = i === 0 || trialCleared(prev.id);
    const row = el('button', 'trial-row' + (done ? ' done' : aided ? ' aided' : unlocked ? ' next' : ' locked'));
    const foes = t.lineup.map((r) => `<b style="color:${RIVALS[r].color}">${RIVALS[r].name}</b>`).join(' · ');
    const left = Math.max(0, t.reward - (Meta.trialPaid[t.id] || 0));
    row.innerHTML = `
      <div class="trial-num">${done ? '✦' : aided ? '◆' : unlocked ? t.num : '🔒'}</div>
      <div class="trial-main">
        <div class="trial-name">TRIAL ${t.num} — ${t.name.toUpperCase()}</div>
        ${unlocked ? `<div class="trial-desc">${t.desc}</div><div class="trial-foes">${foes} · first to ${t.target}</div>` : '<div class="trial-desc">Clear the previous trial to reveal this one.</div>'}
      </div>
      <div class="trial-reward">${done ? 'WON' : aided ? `AIDED${left ? `<br>+${left} ◈ left` : ''}` : `+${left} ◈`}</div>`;
    if (unlocked) row.onclick = () => { sfx.pick(); cb.start(t); };
    list.append(row);
  });
  s.append(list);
  showScreen('scr-trials');
}

// ---- trial prepare: pick your stance, then your boons -----------------------
// The stance is the difficulty dial: fewer cinders for more help, and only PURE
// earns the ✦. Boons are chosen, never rolled — these fights are crafted, so the
// player should get to answer them deliberately.
export function renderTrialPrep(t, pool, cb) {
  const s = $('#scr-prep');
  s.innerHTML = '';
  s.append(el('h2', 'h', `TRIAL ${t.num} — ${t.name.toUpperCase()}`));
  const foes = t.lineup.map((r) => `<b style="color:${RIVALS[r].color}">${RIVALS[r].name}</b>`).join(' · ');
  s.append(el('p', 'sub', `${t.desc}<br>${foes} · first to ${t.target}`));

  const given = [
    ...Object.entries(t.ranks || {}).map(([k, n]) => `${UPGRADES[k].icon} ${UPGRADES[k].name} ${n}`),
    ...(t.actives || []).map((id) => `${SPELLS[id].icon} ${SPELLS[id].name}`),
    ...(t.utility ? [`${SPELLS[t.utility].icon} ${SPELLS[t.utility].name}`] : []),
  ];
  s.append(el('p', 'trial-foes', given.length ? `The trial grants you: ${given.join(' · ')}` : 'The trial grants you nothing but the bare fireball.'));

  let stance = stanceById(Meta.lastStance);
  const chosen = [];
  const left = Math.max(0, t.reward - (Meta.trialPaid[t.id] || 0));

  s.append(el('h3', 'h3', 'CHOOSE YOUR STANCE'));
  const stanceList = el('div', 'stance-list');
  const boonWrap = el('div', 'boon-wrap');
  const count = el('p', 'boon-count', '');
  const go = el('button', 'btn btn-primary', 'ENTER THE TRIAL');

  const refresh = () => {
    stanceList.querySelectorAll('.stance-row').forEach((r) => r.classList.toggle('sel', r.dataset.stance === stance.id));
    boonWrap.innerHTML = '';
    if (stance.boons > 0) {
      const head = el('h3', 'h3', `TAKE ${stance.boons === 1 ? 'ONE BOON' : `${stance.boons} BOONS`}`);
      boonWrap.append(head);
      const grid = el('div', 'card-grid');
      pool.forEach((item) => {
        const taken = chosen.includes(item);
        const blocked = !taken && (
          chosen.length >= stance.boons ||
          (item.kind === 'active' && chosen.filter((c) => c.kind === 'active').length >= item.activeSlots) ||
          (item.kind === 'utility' && chosen.some((c) => c.kind === 'utility'))
        );
        const c = card({ ...item, disabled: blocked, sub: taken ? '✓ TAKEN' : item.sub }, () => {
          const i = chosen.indexOf(item);
          if (i >= 0) chosen.splice(i, 1); else chosen.push(item);
          sfx.pick();
          refresh();
        });
        if (taken) c.classList.add('sel');
        grid.append(c);
      });
      boonWrap.append(grid);
    }
    count.textContent = stance.boons
      ? `${chosen.length} of ${stance.boons} ${stance.boons === 1 ? 'boon' : 'boons'} chosen`
      : 'no boons — the trial as written';
    const reward = stanceReward(t.reward, stance);
    const pay = Math.min(left, reward);
    go.classList.toggle('disabled', chosen.length !== stance.boons);
    go.innerHTML = `ENTER THE TRIAL <small>${pay ? `+${pay} ◈` : 'no cinders left'} · ${stance.mark}</small>`;
  };

  STANCES.forEach((st) => {
    const row = el('button', 'stance-row');
    row.dataset.stance = st.id;
    row.innerHTML = `
      <div class="stance-mark">${st.mark}</div>
      <div class="trial-main">
        <div class="trial-name">${st.name}${st.id === 'pure' ? ' — the true clear' : ''}</div>
        <div class="trial-desc">${st.desc}</div>
      </div>
      <div class="trial-reward">${Math.min(left, stanceReward(t.reward, st)) || 0} ◈</div>`;
    row.onclick = () => {
      if (stance.id === st.id) return;
      stance = st;
      chosen.length = 0;
      sfx.pick();
      refresh();
    };
    stanceList.append(row);
  });
  s.append(stanceList, boonWrap);

  go.onclick = () => {
    if (chosen.length !== stance.boons) return;
    Meta.lastStance = stance.id;
    saveMeta();
    sfx.emberSeal();
    cb.start(t, stance, chosen);
  };
  const back = el('button', 'btn btn-small', 'BACK');
  back.onclick = () => cb.back();
  const row = el('div', 'menu-row');
  row.append(go, back);
  const foot = el('div', 'prep-foot');   // pinned: the grid is long on a phone
  foot.append(count, row);
  s.append(foot);
  refresh();
  showScreen('scr-prep');
}

export function renderTrialEnd(win, trial, res, cb) {
  const s = $('#scr-runend');
  s.innerHTML = '';
  const pure = res.stance.id === 'pure';
  s.append(el('h2', 'h ' + (win ? 'win' : 'lose'),
    win ? (pure ? 'TRIAL CONQUERED' : 'TRIAL CLEARED — AIDED') : 'THE TRIAL STANDS'));
  s.append(el('p', 'sub', win
    ? (res.paid
      ? `Trial ${trial.num} — ${trial.name} — falls${pure ? '' : ` on ${res.stance.name.toLowerCase()} footing`}. <b>+${res.paid} ◈</b> banked${trial.robe && pure ? ', and the white robe of the Emberlocked is yours' : ''}.`
      : `Trial ${trial.num} falls again. Its cinders are already spent.`)
    : `Trial ${trial.num} — ${trial.name} — holds its ground. It will be here when you return.`));
  if (win && !pure) {
    s.append(el('p', 'lose-note', trial.robe
      ? `Marked ◆ AIDED. The white robe — and the ✦ — wait for a PURE clear${res.left ? `, worth ${res.left} ◈ more` : ''}.`
      : `Marked ◆ AIDED. Beat it PURE for the ✦${res.left ? ` and the last ${res.left} ◈` : ''}.`));
  }
  const row = el('div', 'menu-row');
  if (!win) {
    const retry = el('button', 'btn btn-primary', 'TRY AGAIN');
    retry.onclick = () => cb.retry();
    row.append(retry);
  }
  const back = el('button', 'btn' + (win ? ' btn-primary' : ''), win ? 'THE LADDER' : 'BACK');
  back.onclick = () => cb.back();
  row.append(back);
  s.append(row);
  showScreen('scr-runend');
}

// ---- sanctum (meta shop: variety, not power) -----------------------------------------------
export function renderSanctum(cb) {
  const s = $('#scr-sanctum');
  s.innerHTML = '';
  s.append(el('h2', 'h', 'THE SANCTUM'));
  s.append(el('p', 'sub', `<b class="gold">${Meta.cinders} ◈</b> cinders — spend them on new tools, not raw power.`));
  const backTop = el('button', 'btn btn-small', 'BACK');
  backTop.onclick = () => cb();
  s.append(backTop);
  const row = el('div', 'card-grid');
  META_SHOP.forEach((m) => {
    let owned = false;
    if (m.type === 'spell') owned = Meta.unlockedSpells.includes(m.target);
    if (m.type === 'ember') owned = Meta.unlockedEmbers.includes(m.target);
    if (m.type === 'robe') owned = Meta.robes.includes(m.target);
    const equipped = m.type === 'robe' && Meta.robe === m.target;
    const item = {
      ...m, curr: '◈', owned,
      sub: equipped ? 'WORN' : undefined,
      disabled: !owned && Meta.cinders < m.cost,
    };
    row.append(card(item, () => {
      if (owned) {
        if (m.type === 'robe') { Meta.robe = m.target; saveMeta(); sfx.pick(); renderSanctum(cb); }
        return;
      }
      Meta.cinders -= m.cost;
      if (m.type === 'spell') Meta.unlockedSpells.push(m.target);
      if (m.type === 'ember') Meta.unlockedEmbers.push(m.target);
      if (m.type === 'robe') { Meta.robes.push(m.target); Meta.robe = m.target; }
      saveMeta(); sfx.buy();
      renderSanctum(cb);
    }));
  });
  // default robe re-equip
  const def = card({ icon: '🜲', name: 'Robe: Tidecaller', desc: 'The first robe. Cyan as cold water.', cost: 0, curr: '◈', owned: true, sub: Meta.robe === '#3df0ff' ? 'WORN' : undefined }, () => {
    Meta.robe = '#3df0ff'; saveMeta(); sfx.pick(); renderSanctum(cb);
  });
  row.append(def);
  // trophy robe: only exists if Trial XII has been conquered
  if (Meta.robes.includes(TROPHY_ROBE)) {
    const trophy = card({ icon: '☄', name: 'Robe: Emberlocked', desc: 'White-hot. Won, never bought — proof of Trial XII.', cost: 0, curr: '◈', owned: true, sub: Meta.robe === TROPHY_ROBE ? 'WORN' : 'TROPHY' }, () => {
      Meta.robe = TROPHY_ROBE; saveMeta(); sfx.pick(); renderSanctum(cb);
    });
    row.append(trophy);
  }
  s.append(row);
  const back = el('button', 'btn', 'BACK');
  back.onclick = () => cb();
  s.append(back);
  showScreen('scr-sanctum');
}

// ---- help ------------------------------------------------------------------------------------
export function renderHelp(cb) {
  const s = $('#scr-help');
  s.innerHTML = `
    <h2 class="h">HOW TO PLAY</h2>
    <div class="help-body">
      <p><b>The only rule:</b> shove the other wizards into the lava. <em>Position kills</em> — and <b>the wounded fly farther</b>: every point of damage makes a wizard lighter, up to half again as much shove. Smell the blood.</p>
      <p><b>Block with fire:</b> bolts that meet mid-air destroy each other. Your fireball is also your shield.</p>
      <p><b>LEFT thumb</b> — touch & drag anywhere on the left side to move.</p>
      <p><b>RIGHT thumb</b> — drag to aim (you'll see the line), <b>release to hurl a fireball</b>. A quick <b>tap</b> also fires, toward the spot you tapped. Slide back to your start point to cancel a drag.</p>
      <p><b>Spell buttons</b> — bought spells appear bottom-right. Surge dashes where you're moving — it also breaks a stagger. Use it when you're flying toward the fire.</p>
      <p><b>The island shrinks.</b> Stay off the glowing rim — red glow under your feet means the lava wants you.</p>
      <p><b>The Gauntlet:</b> five matches, each first-to-3 rounds. Win rounds & kills to earn ◆ gold for the Forge. <b>Lose one match and the run ends.</b> Banked ◈ cinders unlock new spells, embers and robes in the Sanctum.</p>
      <p><b>The Trials:</b> twelve crafted challenge fights, each with its own twist. Beat one to unlock the next; each pays cinders once. The twelfth guards a robe you cannot buy.</p>
    </div>
    <button class="btn btn-primary" id="help-back">BACK</button>`;
  $('#help-back').onclick = () => cb();
  showScreen('scr-help');
}

// ---- spell buttons (bottom-right, radial cooldown wipe) -----------------------------------------
export function buildSpellButtons(actives, onCast) {
  const wrap = $('#spell-btns');
  wrap.innerHTML = '';
  actives.forEach((id, i) => {
    const b = el('button', 'spell-btn', `<span class="sp-icon">${SPELLS[id].icon}</span><span class="sp-name">${SPELLS[id].name}</span>`);
    b.dataset.spell = id;
    const fire = (e) => { e.preventDefault(); onCast(id); };
    b.addEventListener('pointerdown', fire);
    wrap.append(b);
  });
}

export function updateSpellButtons(world) {
  const wrap = $('#spell-btns');
  for (const b of wrap.children) {
    const id = b.dataset.spell;
    const cd = world && world.player.cds[id] || 0;
    const max = SPELLS[id].cd;
    const k = cd / max;
    b.style.setProperty('--cd', `${k * 100}%`);
    b.classList.toggle('cooling', cd > 0.01);
  }
}
