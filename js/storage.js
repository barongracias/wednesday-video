// js/storage.js — localStorage get/set/clear operations

import {
  STORAGE_KEY,
  apiConfigKey,
  userIdKey,
  authTokenKey,
  authEmailKey,
  circleIdKey,
  getFlags,
  getUploadQueue,
  setState,
  setFlags,
  setUploadQueue,
  getState,
} from "./state.js";
import { nextWednesday } from "./rotation.js";

const DEFAULTS = {
  friends: ["Alex", "Bri", "Casey", "Dev", "Em"],
  hostIndex: 0,
  get nextSwitch() { return nextWednesday(Date.now()); },
  history: [],
  mockUploads: [],
  flags: [],
  uploadQueue: [],
};

/** Load state from localStorage, initialise defaults, and return the state object. */
export function hydrateState() {
  const defaults = {
    friends: [...DEFAULTS.friends],
    hostIndex: DEFAULTS.hostIndex,
    nextSwitch: nextWednesday(Date.now()),
    history: [],
    mockUploads: [],
    flags: [],
    uploadQueue: [],
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    setFlags(saved?.flags || []);
    setUploadQueue(saved?.uploadQueue || []);
    const state = { ...defaults, ...saved };
    setState(state);
    return state;
  } catch (err) {
    console.warn("Unable to read saved state", err);
    setFlags([]);
    setUploadQueue([]);
    setState({ ...defaults });
    return { ...defaults };
  }
}

/** Persist current state to localStorage. */
export function persist() {
  try {
    const state = getState();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...state,
        flags: getFlags(),
        // Don't persist actively-uploading items
        uploadQueue: getUploadQueue().filter((u) => u.status !== "uploading"),
      })
    );
  } catch (err) {
    console.warn("Unable to save state", err);
  }
}

// --- Auth / config keys ---

export function getApiBase() {
  return (localStorage.getItem(apiConfigKey) || "").trim();
}

export function saveApiBase(val) {
  localStorage.setItem(apiConfigKey, val);
}

export function getSession() {
  const userId = localStorage.getItem(userIdKey) || "";
  const token = localStorage.getItem(authTokenKey) || "";
  const email = localStorage.getItem(authEmailKey) || "";
  return userId ? { userId, token, email } : null;
}

export function saveSession({ userId, token, email }) {
  if (userId) localStorage.setItem(userIdKey, userId);
  if (token) localStorage.setItem(authTokenKey, token);
  if (email) localStorage.setItem(authEmailKey, email);
}

export function clearSession() {
  localStorage.removeItem(userIdKey);
  localStorage.removeItem(authTokenKey);
  localStorage.removeItem(circleIdKey);
}

export function getCircleId() {
  return localStorage.getItem(circleIdKey) || "";
}

export function saveCircleId(id) {
  localStorage.setItem(circleIdKey, id);
}

export function authHeaders(session) {
  const headers = {};
  if (session?.userId) headers["x-user-id"] = session.userId;
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  return headers;
}
