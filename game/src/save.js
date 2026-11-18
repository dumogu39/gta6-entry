// Save and load to localStorage. The world is generated deterministically from the seed, so only the
// player's progress and position are stored; traffic, police and pedestrians are re-spawned fresh on
// load. Everything is guarded, so a blocked store degrades to a session-only game.
import { SAVE_KEY } from './config.js';

/** Bump this when the save shape changes; old saves are simply ignored. */
const SAVE_VERSION = 1;

export function saveGame(game) {
  try {
    const p = game.player;
    let missionIndex = game.mission?.index ?? -1;
    let missionStep = game.mission?.step ?? 0;
    let missionActive = game.mission?.active ?? false;
    // A save taken between missions keeps the next job as the one to resume.
    if (!missionActive && game.mission && game.mission.pendingNext !== undefined) {
      missionIndex = game.mission.pendingNext;
      missionStep = 0;
      missionActive = true;
    }
    const data = {
      v: SAVE_VERSION,
      money: p.money,
      health: p.health,
      wanted: p.wanted,
      weapon: p.weapon,
      owned: p.owned,
      ammo: p.ammo,
      x: p.x,
      y: p.y,
      angle: p.angle,
      mode: p.mode,
      missionIndex,
      missionStep,
      missionActive,
      finished: game.mission ? !!game.mission.finished : false,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(game) {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== SAVE_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

export function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Apply a loaded save to the game state, resuming the mission it was on. */
export function applySave(game, data, resumeMission) {
  const p = game.player;
  p.money = data.money;
  p.health = data.health;
  p.wanted = data.wanted;
  p.weapon = data.weapon;
  p.owned = data.owned;
  p.ammo = data.ammo;
  p.x = data.x;
  p.y = data.y;
  p.angle = data.angle;
  p.alive = true;
  if (data.mode === 'drive') {
    // A saved driver re-enters a fresh car at their position rather than keeping a stale one.
    p.mode = 'walk';
    p.car = null;
  }
  if (data.missionActive && data.missionIndex >= 0 && resumeMission) {
    resumeMission(game, data.missionIndex, data.missionStep);
  }
}
