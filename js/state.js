// js/state.js — App state, constants, and config keys

export const STORAGE_KEY = "wednesdays-state-v1";
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const apiConfigKey = "wednesdays-api-base";
export const userIdKey = "wednesdays-user-id";
export const authTokenKey = "wednesdays-auth-token";
export const authEmailKey = "wednesdays-auth-email";
export const circleIdKey = "wednesdays-circle-id";

export const MAX_SIZE_BYTES = 150 * 1024 * 1024; // 150 MB
export const MAX_DURATION_SEC = 120; // 2 minutes
export const MAX_BITRATE_KBPS = 4000;

// Runtime state — mutable references shared across modules via getter/setter
let _state = null;
let _flags = [];
let _uploadQueue = [];
let _uploadAttempts = [];
let _serverUploads = [];
let _serverFlags = [];
let _invites = [];
let _theme =
  localStorage.getItem("wednesdays-theme") ||
  (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark");

export function getState() { return _state; }
export function setState(s) { _state = s; }

export function getFlags() { return _flags; }
export function setFlags(f) { _flags = f; }
export function pushFlag(f) { _flags.unshift(f); }

export function getUploadQueue() { return _uploadQueue; }
export function setUploadQueue(q) { _uploadQueue = q; }

export function getUploadAttempts() { return _uploadAttempts; }
export function setUploadAttempts(a) { _uploadAttempts = a; }
export function pushUploadAttempt(a) { _uploadAttempts.unshift(a); }

export function getServerUploads() { return _serverUploads; }
export function setServerUploads(u) { _serverUploads = u; }

export function getServerFlags() { return _serverFlags; }
export function setServerFlags(f) { _serverFlags = f; }

export function getInvites() { return _invites; }
export function pushInvite(inv) { _invites.unshift(inv); }

export function getTheme() { return _theme; }
export function setTheme(t) { _theme = t; }

// Queue runtime state
let _queueState = "idle"; // idle | running | paused
let _currentQueueItem = null;
let _currentUploadXhr = null;

export function getQueueState() { return _queueState; }
export function setQueueState(s) { _queueState = s; }

export function getCurrentQueueItem() { return _currentQueueItem; }
export function setCurrentQueueItem(item) { _currentQueueItem = item; }

export function getCurrentUploadXhr() { return _currentUploadXhr; }
export function setCurrentUploadXhr(xhr) { _currentUploadXhr = xhr; }
