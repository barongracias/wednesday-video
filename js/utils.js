// js/utils.js — Shared utility functions

export function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

export function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / 1024 ** i;
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
