// Small save file in localStorage. Every path is defensive: private browsing
// and disabled storage simply mean "no save available", never a crash.

import { STORAGE_KEY } from './config.js';

const VERSION = 1;

function getStorage() {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return null;
    const probe = '__vh_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

export function save(state) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    const payload = {
      version: VERSION,
      savedAt: Date.now(),
      cash: Math.max(0, Math.round(state.cash ?? 0)),
      missionIndex: Math.max(0, Math.min(5, Math.round(state.missionIndex ?? 0))),
      wanted: Math.max(0, Math.min(6, Math.round(state.wanted ?? 0))),
      position: {
        x: Number.isFinite(state.position?.x) ? state.position.x : 1000,
        y: Number.isFinite(state.position?.y) ? state.position.y : 1000,
      },
      dayPhase: Number.isFinite(state.dayPhase) ? state.dayPhase % 1 : 0.18,
      health: Math.max(0, Math.min(100, state.health ?? 100)),
      missionsDone: Math.max(0, Math.round(state.missionsDone ?? 0)),
      playTime: Math.max(0, state.playTime ?? 0),
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function load() {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || data.version !== VERSION) return null;
    if (!Number.isFinite(data.cash) || !Number.isFinite(data.missionIndex)) return null;
    if (!data.position || !Number.isFinite(data.position.x) || !Number.isFinite(data.position.y)) return null;
    return {
      savedAt: data.savedAt ?? 0,
      cash: Number(data.cash),
      missionIndex: Math.max(0, Math.min(5, data.missionIndex)),
      wanted: Math.max(0, Math.min(6, data.wanted ?? 0)),
      position: { x: data.position.x, y: data.position.y },
      dayPhase: Number.isFinite(data.dayPhase) ? data.dayPhase : 0.18,
      health: Number.isFinite(data.health) ? data.health : 100,
      missionsDone: Number(data.missionsDone ?? data.missionIndex ?? 0),
      playTime: Number(data.playTime ?? 0),
    };
  } catch {
    return null;
  }
}

export function hasSave() {
  return load() !== null;
}

export function clearSave() {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function saveSummary() {
  const data = load();
  if (!data) return null;
  const date = data.savedAt ? new Date(data.savedAt) : null;
  return {
    ...data,
    label: date
      ? `$${data.cash.toLocaleString('en-US')} · job ${data.missionIndex + 1} · ${date.toLocaleDateString('en-US')}`
      : `$${data.cash.toLocaleString('en-US')} · job ${data.missionIndex + 1}`,
  };
}