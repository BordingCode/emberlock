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
  trialsDone: [],          // trial ids beaten (rewards pay once)
  bestMatch: 0,            // furthest match reached (1-based, 6 = cleared)
  runs: 0, clears: 0, shoves: 0,
  sfx: true, music: true, reducedMotion: false,
  coached: false,          // first-run coach toasts shown?
};

export const Meta = { ...DEFAULTS };

export function loadMeta() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(Meta, DEFAULTS, JSON.parse(raw));
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
