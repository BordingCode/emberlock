// Persistent meta-state in localStorage. Variety unlocks + settings + records.
import { PLAYER_COLOR } from './data.js';

const KEY = 'emberlock_v1';

const DEFAULTS = {
  cinders: 0,
  unlockedSpells: [],      // 'hook', 'ward'
  unlockedEmbers: [],      // 'rivers', 'twins'
  robes: [],               // owned robe colours
  robe: PLAYER_COLOR,
  tier: 0,                 // highest unlocked Ascension tier
  trialsDone: [],          // trial ids beaten PURE (the ✦ mark)
  trialsAided: [],         // trial ids beaten on a lower stance (the ◆ mark)
  trialPaid: {},           // trial id -> cinders already paid (a better clear tops up)
  lastStance: 'pure',      // stance pre-selected on the prepare screen
  bestMatch: 0,            // furthest match reached (1-based, 6 = cleared)
  runs: 0, clears: 0, shoves: 0,
  lossesTo: {},            // rivalId -> times this rival's lineup ended a run
  winsOver: {},            // rivalId -> times beaten in a match
  sfx: true, music: true, reducedMotion: false,
  coached: false,          // first-run coach toasts shown?
};

const fresh = () => JSON.parse(JSON.stringify(DEFAULTS)); // arrays/maps must not alias DEFAULTS
export const Meta = fresh();

export function loadMeta() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(Meta, fresh(), JSON.parse(raw));
  } catch (e) { /* corrupt save — keep defaults */ }
  return Meta;
}

export function saveMeta() {
  try { localStorage.setItem(KEY, JSON.stringify(Meta)); } catch (e) { /* storage full/blocked */ }
}

export function spellUnlocked(id) {
  return Meta.unlockedSpells.includes(id);
}
export function emberUnlocked(id) {
  return Meta.unlockedEmbers.includes(id);
}
