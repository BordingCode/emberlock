// DOM screens & HUD buttons. The canvas is the game; DOM is menus, cards, buttons.
import { SPELLS, UPGRADES, EMBERS, RIVALS, META_SHOP } from './data.js';
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
  const sanctum = el('button', 'btn', `SANCTUM <small>${Meta.cinders} ◈</small>`);
  sanctum.onclick = () => cb.sanctum();
  const help = el('button', 'btn', 'HOW TO PLAY');
  help.onclick = () => cb.help();
  row.append(sanctum, help);
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
export function renderDraft(matchIdx, lineup, options, cb) {
  const s = $('#scr-draft');
  s.innerHTML = '';
  const main = RIVALS[lineup[0]];
  s.append(el('h2', 'h', `MATCH ${matchIdx + 1} OF 5`));
  const foes = lineup.map((r) => `<b style="color:${RIVALS[r].color}">${RIVALS[r].name} ${RIVALS[r].title}</b>`).join(' & ');
  s.append(el('p', 'sub', `You face ${foes}.`));
  s.append(el('p', 'taunt', `“${main.taunt}”`));
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
export function renderMatchEnd(matchIdx, nextLineup, cb) {
  const s = $('#scr-matchend');
  s.innerHTML = '';
  s.append(el('h2', 'h win', 'MATCH WON'));
  s.append(el('p', 'sub', `+2 cinders banked. ${5 - matchIdx - 1} ${5 - matchIdx - 1 === 1 ? 'match' : 'matches'} stand between you and the Last Flame.`));
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
      <p><b>The only rule:</b> shove the other wizards into the lava. Damage is a tickle — <em>position kills</em>.</p>
      <p><b>LEFT thumb</b> — touch & drag anywhere on the left side to move.</p>
      <p><b>RIGHT thumb</b> — drag to aim (you'll see the line), <b>release to hurl a fireball</b>. It knocks foes back. Slide back to your start point to cancel.</p>
      <p><b>Spell buttons</b> — bought spells appear bottom-right. Surge dashes where you're moving — it also breaks a stagger. Use it when you're flying toward the fire.</p>
      <p><b>The island shrinks.</b> Stay off the glowing rim — red glow under your feet means the lava wants you.</p>
      <p><b>The Gauntlet:</b> five matches, each first-to-3 rounds. Win rounds & kills to earn ◆ gold for the Forge. <b>Lose one match and the run ends.</b> Banked ◈ cinders unlock new spells, embers and robes in the Sanctum.</p>
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
