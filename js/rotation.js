// js/rotation.js — Weekly rotation logic

import { WEEK_MS } from "./state.js";

/**
 * Returns the timestamp of the next Wednesday midnight (local time) after `afterTs`.
 */
export function nextWednesday(afterTs) {
  const d = new Date(afterTs);
  const day = d.getDay(); // 0 = Sun, 3 = Wed
  d.setHours(0, 0, 0, 0);
  const delta = (3 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return d.getTime();
}

/**
 * Advance the host index, push a history entry, and update nextSwitch on `state`.
 * @param {object} state  - mutable app state
 * @param {string} trigger - "manual" | "auto" | "demo" | "server"
 * @param {number} pivotTs - timestamp used as the rotation pivot
 */
export function rotateHost(state, trigger = "manual", pivotTs = Date.now()) {
  if (!state.friends.length) return;
  const prevHost = state.friends[state.hostIndex] || "Host";
  state.hostIndex = (state.hostIndex + 1) % state.friends.length;
  state.history = state.history || [];
  state.history.unshift({ name: prevHost, when: pivotTs, trigger });
  state.history = state.history.slice(0, 30);
  state.nextSwitch =
    trigger === "manual"
      ? nextWednesday(pivotTs)
      : (state.nextSwitch || nextWednesday(pivotTs)) + WEEK_MS;
}

/**
 * Auto-advance through any missed Wednesdays since last save.
 */
export function ensureRotation(state) {
  if (!state.friends.length) return;
  if (!state.nextSwitch) state.nextSwitch = nextWednesday(Date.now());
  const now = Date.now();
  while (now >= state.nextSwitch) {
    rotateHost(state, "auto", state.nextSwitch);
  }
}

/**
 * Fisher-Yates shuffle, keeping current host in position.
 */
export function shuffleFriends(state) {
  if (state.friends.length < 2) return;
  const currentHost = state.friends[state.hostIndex];
  for (let i = state.friends.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.friends[i], state.friends[j]] = [state.friends[j], state.friends[i]];
  }
  state.hostIndex = Math.max(
    state.friends.findIndex((n) => n === currentHost),
    0
  );
}

/**
 * Reset rotation back to first friend, next Wednesday from now.
 */
export function resetRotation(state) {
  state.hostIndex = 0;
  state.nextSwitch = nextWednesday(Date.now());
  state.history = [];
}

/**
 * Format a countdown from now to `targetTs`.
 */
export function formatCountdown(targetTs) {
  const now = Date.now();
  const diff = Math.max(targetTs - now, 0);
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff / (60 * 60 * 1000)) % 24);
  const mins = Math.floor((diff / (60 * 1000)) % 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
