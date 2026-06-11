// All tuning numbers and content tables in one place. Rivals and Embers are DATA
// rows read by shared systems — that's where PvC variety comes from, not code paths.

export const C = {
  // arena (world is 540x960, arena centred in the upper play area)
  AX: 270, AY: 420,
  R_START: 228,          // island radius at round start
  R_FLOOR: 64,           // never shrinks below — guaranteed knife-fight finale
  SHRINK_HOLD: 8,        // seconds before shrinking starts
  SHRINK_RATE: 6.5,      // radius units / s  (floor reached ~33s in)

  // wizards
  WIZ_R: 17,
  HP: 100,
  SPEED: 165,
  LAVA_DPS: 22,
  EDGE_WARN: 30,         // "danger glow" distance from the rim

  // the coupled feel triad (KB field-note): impulse + stagger + decel — tune together
  FB_IMPULSE: 430,       // shove ≈ 100px slide
  STAGGER: 0.27,         // knockback overrides input for this long
  KB_DECEL: 900,

  // fireball (everyone's free baseline)
  FB_SPEED: 400,
  FB_RADIUS: 9,
  FB_CD: 0.9,
  FB_DMG: 8,
  FB_WINDUP: 0.16,       // cast charge glow — telegraph + masks input latency

  ROUND_TARGET: 3,       // round wins to take a match
  GAUNTLET_LEN: 5,
  COUNTDOWN: 1.6,

  // economy (taut faucet -> sink)
  GOLD_KILL: 4, GOLD_WIN: 8, GOLD_TOP2: 5,
  OFFENSE_PENALTY: 0.06, // Warlock's rule: each offensive spell -6% base fireball impulse
};

// ---- Spells ----------------------------------------------------------------
// kind: 'active' (slot-limited, gets a button) | 'utility' | 'upgrade'
export const SPELLS = {
  surge: {
    id: 'surge', kind: 'active', name: 'Surge', icon: '⟫', cost: 6, cd: 5, offensive: false,
    desc: 'Dash in your move direction. Escape a shove — or dive for the kill.',
    aiDesc: 'dash',
  },
  scatter: {
    id: 'scatter', kind: 'active', name: 'Scatter', icon: '🜂', cost: 9, cd: 6, offensive: true,
    desc: 'Fan of 3 fireballs, lighter shove each. Punishes crowded ground.',
  },
  mote: {
    id: 'mote', kind: 'active', name: 'Homing Mote', icon: '◉', cost: 8, cd: 7, offensive: true,
    desc: 'Slow seeking orb with a gentle push. Herds foes toward the edge.',
  },
  nova: {
    id: 'nova', kind: 'active', name: 'Repel Nova', icon: '✺', cost: 10, cd: 8, offensive: true,
    desc: 'Radial blast around you. Panic button — or a double-shove dive.',
  },
  mine: {
    id: 'mine', kind: 'active', name: 'Lava Anchor', icon: '◈', cost: 9, cd: 7, offensive: true,
    desc: 'Drop a charge at your feet. Detonates with a mighty shove.',
  },
  hook: {
    id: 'hook', kind: 'active', name: 'Hook', icon: '⌁', cost: 12, cd: 8, offensive: true, locked: true,
    desc: 'Yank a foe TOWARD you — then shove them past you into the fire.',
  },
  ward: {
    id: 'ward', kind: 'utility', name: 'Ward', icon: '◍', cost: 7, locked: true,
    desc: 'A bubble that negates the next hit. One charge each round.',
  },
  boots: {
    id: 'boots', kind: 'utility', name: 'Cinder Boots', icon: '∿', cost: 6,
    desc: '+12% move speed. Position is everything.',
  },
  heart: {
    id: 'heart', kind: 'utility', name: 'Heartstone', icon: '♥', cost: 8,
    desc: '+30 max HP. (The lava does not care much.)',
  },
};

// fireball upgrade tracks: levels with prices
export const UPGRADES = {
  force: { id: 'force', name: 'Force', icon: '✸', costs: [6, 10, 16], desc: '+15% fireball shove per rank.' },
  quick: { id: 'quick', name: 'Quickcast', icon: '⚡', costs: [7, 12], desc: '−15% fireball cooldown per rank.' },
  great: { id: 'great', name: 'Greatball', icon: '●', costs: [6, 10], desc: 'Bigger fireball, +4 damage per rank.' },
};

// ---- Rivals -----------------------------------------------------------------
// One shared steering+FSM; each rival is a row of weights + loadout + colour.
// weights: seek (engage), flee (edge fear), dodge (bolt evade), angle (kill-angle hunger)
// range: preferred fighting distance.
export const RIVALS = {
  pyra: {
    id: 'pyra', name: 'Pyra', title: 'the Rash', color: '#ff3d9e', dark: '#7a1048',
    range: 95, weights: { seek: 1.25, flee: 0.8, dodge: 0.7, angle: 1.1 },
    loadout: ['surge', 'nova'], aggro: 1.3,
    taunt: 'Pyra dives in headfirst. Punish her overreach.',
  },
  cinder: {
    id: 'cinder', name: 'Old Cinder', title: 'the Patient', color: '#ff8a1e', dark: '#6e3404',
    range: 200, weights: { seek: 0.7, flee: 1.4, dodge: 0.9, angle: 0.8 },
    loadout: ['mine', 'mote'], aggro: 0.7, centerHug: 1.0,
    taunt: 'Old Cinder holds the centre and seeds it with anchors. Dig him out.',
  },
  gale: {
    id: 'gale', name: 'Gale', title: 'the Untouched', color: '#3dffb6', dark: '#0a6647',
    range: 165, weights: { seek: 0.9, flee: 1.1, dodge: 1.5, angle: 1.0 },
    loadout: ['scatter', 'surge'], aggro: 0.9, speedMul: 1.1,
    taunt: 'Gale slips every bolt. Corner her against the shrinking rim.',
  },
  magnus: {
    id: 'magnus', name: 'Magnus', title: 'the Unmoved', color: '#b6ff3d', dark: '#3f6e04',
    range: 120, weights: { seek: 1.0, flee: 1.0, dodge: 0.5, angle: 1.2 },
    loadout: ['ward'], aggro: 1.0, forceMul: 1.3, hpMul: 1.3,
    taunt: 'Magnus walks through your chip damage and shoves like a landslide. Don’t trade — out-angle him.',
  },
  wisp: {
    id: 'wisp', name: 'Wisp', title: 'the Unread', color: '#c63dff', dark: '#52086e',
    range: 130, weights: { seek: 1.0, flee: 0.9, dodge: 1.0, angle: 0.9 },
    loadout: ['hook', 'surge'], aggro: 1.0, erratic: 1.0,
    taunt: 'Wisp cannot be read. He hooks you when you feel safest.',
  },
  ash: {
    id: 'ash', name: 'Ash', title: 'the Last Flame', color: '#ffd24a', dark: '#7a5a06',
    range: 130, weights: { seek: 1.1, flee: 1.2, dodge: 1.3, angle: 1.3 },
    loadout: ['hook', 'nova', 'ward'], aggro: 1.1, boss: true, forceMul: 1.15, hpMul: 1.2,
    taunt: 'Ash, the Last Flame. Everything the others know, he taught them.',
  },
};

// the 5-match gauntlet: who you face, in order. Lose ONE match -> the run ends.
export const GAUNTLET = [
  { rivals: ['pyra'] },
  { rivals: ['cinder'] },
  { rivals: ['gale', 'pyra'] },
  { rivals: ['magnus', 'wisp'] },
  { rivals: ['ash', 'wisp'], boss: true },
];

// per-match AI competence (the honest difficulty dial: the bot gets BETTER, never buffed)
// aimErr = gaussian sigma in radians; react = seconds before responding to a new threat
export const AI_TIERS = [
  { aimErr: 0.30, react: 0.42, dodgeMul: 0.60 },
  { aimErr: 0.24, react: 0.36, dodgeMul: 0.75 },
  { aimErr: 0.19, react: 0.30, dodgeMul: 0.90 },
  { aimErr: 0.15, react: 0.24, dodgeMul: 1.00 },
  { aimErr: 0.11, react: 0.18, dodgeMul: 1.15 },
];

// ---- Embers (run modifiers) -------------------------------------------------
export const EMBERS = {
  tide: {
    id: 'tide', name: 'Rising Tide', icon: '◐',
    desc: 'The island shrinks 30% faster.',
  },
  volatile: {
    id: 'volatile', name: 'Volatile', icon: '✶',
    desc: 'EVERY wizard’s shove hits 40% harder. Chaos.',
  },
  glass: {
    id: 'glass', name: 'Glass', icon: '❖',
    desc: 'Lava burns twice as fast. One good shove can kill.',
  },
  rivers: {
    id: 'rivers', name: 'Rivers of Fire', icon: '〰', locked: true,
    desc: 'A slowly turning lava crack splits the island.',
  },
  twins: {
    id: 'twins', name: 'Twin Suns', icon: '◎', locked: true,
    desc: 'One extra rival joins EVERY match.',
  },
};

// ---- Trials: a ladder of crafted challenge fights ----------------------------
// Each trial = one match with fixed rules. Beat one to unlock the next.
// Reward (cinders) pays once. All of it is data over existing systems:
// lineup/aiTier (rivals), embers (modifiers), arena overrides, fixed loadouts.
export const TRIALS = [
  { id: 't1', num: 'I', name: 'First Spark', reward: 2,
    desc: 'Pyra. One round, winner takes all. Your shove is already strengthened — land it.',
    lineup: ['pyra'], target: 1, aiTier: 0, ranks: { force: 1 } },
  { id: 't2', num: 'II', name: 'Small Ground', reward: 2,
    desc: 'Old Cinder on a half-sized island. Nowhere to hide from his anchors.',
    lineup: ['cinder'], target: 2, aiTier: 1, arena: { rStart: 150 } },
  { id: 't3', num: 'III', name: 'Bare Hands', reward: 3,
    desc: 'Gale, and you carry nothing but the basic fireball. Pure aim.',
    lineup: ['gale'], target: 2, aiTier: 1 },
  { id: 't4', num: 'IV', name: 'Glass Dance', reward: 3,
    desc: 'Wisp under Glass and Volatile. Every shove is nearly lethal — both ways.',
    lineup: ['wisp'], target: 2, aiTier: 1, embers: ['glass', 'volatile'] },
  { id: 't5', num: 'V', name: 'Two Suns', reward: 4,
    desc: 'Pyra and Gale together. You get Surge — use it to keep them apart.',
    lineup: ['pyra', 'gale'], target: 2, aiTier: 1, actives: ['surge'] },
  { id: 't6', num: 'VI', name: 'Minefield', reward: 4,
    desc: 'Magnus, on ground seeded with six masterless anchors.',
    lineup: ['magnus'], target: 2, aiTier: 2, mines: 6 },
  { id: 't7', num: 'VII', name: 'Rising Fast', reward: 4,
    desc: 'The island sinks from the first second, twice as fast. Cinder and Wisp wait.',
    lineup: ['cinder', 'wisp'], target: 2, aiTier: 2, arena: { hold: 0, rateMul: 2 } },
  { id: 't8', num: 'VIII', name: 'The Long Night', reward: 5,
    desc: 'Magnus and Pyra across a river of fire. First to four rounds.',
    lineup: ['magnus', 'pyra'], target: 4, aiTier: 2, embers: ['rivers'], actives: ['surge'] },
  { id: 't9', num: 'IX', name: 'Featherweight', reward: 5,
    desc: 'Your shove is a third weaker. Theirs is not. Position twice as well.',
    lineup: ['gale', 'wisp'], target: 2, aiTier: 2, impulseMul: 0.7 },
  { id: 't10', num: 'X', name: 'Three Flames', reward: 6,
    desc: 'Pyra, Gale and Wisp at once. Let them tangle — then push.',
    lineup: ['pyra', 'gale', 'wisp'], target: 2, aiTier: 2, actives: ['surge'], utility: 'ward' },
  { id: 't11', num: 'XI', name: "Ash's Shadow", reward: 6,
    desc: 'The Last Flame alone, at his sharpest. Prove the gauntlet was no luck.',
    lineup: ['ash'], target: 2, aiTier: 4, ranks: { force: 1 }, actives: ['surge'] },
  { id: 't12', num: 'XII', name: 'The Emberlocked', reward: 10, robe: '#f5f2ff',
    desc: 'Ash and Magnus, on Glass, on a Rising Tide. First to three. The white robe of the Emberlocked awaits.',
    lineup: ['ash', 'magnus'], target: 3, aiTier: 4, embers: ['glass', 'tide'], ranks: { force: 1 }, actives: ['surge'], utility: 'ward' },
];
export const TROPHY_ROBE = '#f5f2ff';

// ---- Meta (Cinders) shop — variety, not power -------------------------------
export const META_SHOP = [
  { id: 'unlock_hook', name: 'Unlock: Hook', icon: '⌁', cost: 10, type: 'spell', target: 'hook', desc: 'The yank. Adds Hook to shops and drafts.' },
  { id: 'unlock_ward', name: 'Unlock: Ward', icon: '◍', cost: 8, type: 'spell', target: 'ward', desc: 'The bubble. Adds Ward to shops and drafts.' },
  { id: 'unlock_rivers', name: 'Ember: Rivers of Fire', icon: '〰', cost: 10, type: 'ember', target: 'rivers', desc: 'A new run modifier in the draw.' },
  { id: 'unlock_twins', name: 'Ember: Twin Suns', icon: '◎', cost: 12, type: 'ember', target: 'twins', desc: 'A new run modifier in the draw.' },
  { id: 'robe_magenta', name: 'Robe: Wildfire', icon: '🜲', cost: 4, type: 'robe', target: '#ff3d9e', desc: 'A new robe for your wizard.' },
  { id: 'robe_gold', name: 'Robe: Gilded', icon: '🜲', cost: 4, type: 'robe', target: '#ffd24a', desc: 'A new robe for your wizard.' },
  { id: 'robe_verdant', name: 'Robe: Verdant', icon: '🜲', cost: 4, type: 'robe', target: '#b6ff3d', desc: 'A new robe for your wizard.' },
  { id: 'robe_void', name: 'Robe: Voidtouched', icon: '🜲', cost: 6, type: 'robe', target: '#c63dff', desc: 'A new robe for your wizard.' },
];

export const PLAYER_COLOR = '#3df0ff'; // default robe (cyan); robes override
export const PLAYER_DARK = '#0a5a66';
