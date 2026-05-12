// js/ui.js — DOM rendering, event listeners, and app initialisation (entry point)

import {
  WEEK_MS,
  MAX_DURATION_SEC,
  MAX_BITRATE_KBPS,
  apiConfigKey,
  authTokenKey,
  authEmailKey,
  circleIdKey,
  getState,
  setState,
  getFlags,
  getUploadQueue,
  setUploadQueue,
  getUploadAttempts,
  getServerUploads,
  getServerFlags,
  getInvites,
  getTheme,
  setTheme,
} from "./state.js";

import {
  hydrateState,
  persist,
  getApiBase,
  saveApiBase,
  getSession,
  saveSession,
  clearSession,
  getCircleId,
  saveCircleId,
  authHeaders,
} from "./storage.js";

import {
  nextWednesday,
  rotateHost,
  ensureRotation,
  shuffleFriends,
  resetRotation as doResetRotation,
  formatCountdown,
} from "./rotation.js";

import {
  startRecording as cameraStart,
  stopRecording as cameraStop,
  createMockRecording,
  isRecordingSupported,
} from "./camera.js";

import {
  initUpload,
  enqueueUpload,
  processQueue,
  pauseQueue as doPauseQueue,
  resumeQueue as doResumeQueue,
  cancelQueue as doCancelQueue,
  clearCompleted as doClearCompleted,
  cancelQueueItem,
  requestSignedUpload,
  pingBackend,
  requestMagicLink,
  verifyMagicLink,
  syncCircle,
  fetchUploads,
  fetchFlags,
  createInvite,
  acceptInviteToken,
  saveMockUpload,
  getLastRecordingBlob,
  setLastRecordingBlob,
  getLastUploadInfo,
  setLastUploadInfo,
} from "./upload.js";

import { clamp, formatDate, formatBytes, sleep } from "./utils.js";

// ─── Element cache ───────────────────────────────────────────────────────────

const el = {
  currentHost: document.getElementById("current-host"),
  nextSwitch: document.getElementById("next-switch"),
  countdown: document.getElementById("countdown-pill"),
  friendList: document.getElementById("friend-list"),
  friendForm: document.getElementById("friend-form"),
  friendInput: document.getElementById("friend-input"),
  shuffleOrder: document.getElementById("shuffle-order"),
  advanceNow: document.getElementById("advance-now"),
  resetRotation: document.getElementById("reset-rotation"),
  historyList: document.getElementById("history-list"),
  recordingStatus: document.getElementById("recording-status"),
  startRecording: document.getElementById("start-recording"),
  stopRecording: document.getElementById("stop-recording"),
  downloadLink: document.getElementById("download-link"),
  shareRecording: document.getElementById("share-recording"),
  recordingSupport: document.getElementById("recording-support"),
  recordingBanner: document.getElementById("recording-banner"),
  preview: document.getElementById("preview"),
  loadDemo: document.getElementById("load-demo"),
  simulateHandoff: document.getElementById("simulate-handoff"),
  mockRecording: document.getElementById("mock-recording"),
  mockUpload: document.getElementById("mock-upload"),
  demoStatus: document.getElementById("demo-status"),
  mockUploadList: document.getElementById("mock-upload-list"),
  fileInput: document.getElementById("file-input"),
  useUpload: document.getElementById("use-upload"),
  apiBase: document.getElementById("api-base"),
  saveApiBase: document.getElementById("save-api-base"),
  pingApi: document.getElementById("ping-api"),
  signUpload: document.getElementById("sign-upload"),
  retryUpload: document.getElementById("retry-upload"),
  backendStatus: document.getElementById("backend-status"),
  uploadStatus: document.getElementById("upload-status"),
  syncCircle: document.getElementById("sync-circle"),
  circleLabel: document.getElementById("circle-label"),
  uploadProgress: document.getElementById("upload-progress"),
  uploadAttempts: document.getElementById("upload-attempts"),
  uploadQueueList: document.getElementById("upload-queue-list"),
  recordingTimer: document.getElementById("recording-timer"),
  bitrateInput: document.getElementById("bitrate"),
  maxDurationInput: document.getElementById("max-duration"),
  estSize: document.getElementById("est-size"),
  exportState: document.getElementById("export-state"),
  importFile: document.getElementById("import-file"),
  importState: document.getElementById("import-state"),
  notifyPermission: document.getElementById("notify-permission"),
  notifyHost: document.getElementById("notify-host"),
  downloadIcs: document.getElementById("download-ics"),
  flagContent: document.getElementById("flag-content"),
  flagList: document.getElementById("flag-list"),
  pauseQueue: document.getElementById("pause-queue"),
  resumeQueue: document.getElementById("resume-queue"),
  cancelQueue: document.getElementById("cancel-queue"),
  clearCompleted: document.getElementById("clear-completed"),
  consentModal: document.getElementById("consent-modal"),
  consentAccept: document.getElementById("consent-accept"),
  consentCancel: document.getElementById("consent-cancel"),
  fallbackBanner: document.getElementById("fallback-banner"),
  themeToggle: document.getElementById("theme-toggle"),
  fabRecord: document.getElementById("fab-record"),
  fabUpload: document.getElementById("fab-upload"),
  runChecks: document.getElementById("run-checks"),
  scrollRecord: document.getElementById("scroll-record"),
  scrollQueue: document.getElementById("scroll-queue"),
  jumpUpload: document.getElementById("jump-upload"),
  jumpNotify: document.getElementById("jump-notify"),
  statusMedia: document.getElementById("status-media"),
  statusStorage: document.getElementById("status-storage"),
  statusNotify: document.getElementById("status-notify"),
  toast: document.getElementById("toast"),
  fetchUploads: document.getElementById("fetch-uploads"),
  fetchFlags: document.getElementById("fetch-flags"),
  createInvite: document.getElementById("create-invite"),
  fetchStatus: document.getElementById("fetch-status"),
  inviteList: document.getElementById("invite-list"),
  inviteEmail: document.getElementById("invite-email"),
  inviteSubmit: document.getElementById("invite-submit"),
  inviteToken: document.getElementById("invite-token"),
  inviteAccept: document.getElementById("invite-accept"),
  authEmail: document.getElementById("auth-email"),
  authToken: document.getElementById("auth-token"),
  authRequest: document.getElementById("auth-request"),
  authVerify: document.getElementById("auth-verify"),
  authLogout: document.getElementById("auth-logout"),
  authStatus: document.getElementById("auth-status"),
  authMessage: document.getElementById("auth-message"),
};

// ─── UI helpers ──────────────────────────────────────────────────────────────

let toastTimer = null;
let lastNotificationPermission =
  typeof Notification !== "undefined" ? Notification.permission : "denied";
let consentGranted = false;
let pendingConsentAction = null;
let countdownTimer = null;
let lastUrl = null;

function showToast(text) {
  if (!el.toast) return;
  el.toast.textContent = text;
  el.toast.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 2200);
}

function showSupportMessage(text) {
  el.recordingSupport.textContent = text;
  el.recordingSupport.classList.remove("hidden");
}

function setDemoStatus(text) {
  if (el.demoStatus) el.demoStatus.textContent = text;
}

function setBackendStatus(text) {
  if (el.backendStatus) el.backendStatus.textContent = text;
}

function setUploadStatus(text, variant = "info") {
  if (!el.uploadStatus) return;
  el.uploadStatus.textContent = text;
  el.uploadStatus.classList.remove("hidden");
  el.uploadStatus.style.borderColor =
    variant === "error" ? "rgba(255,107,129,0.8)" : "var(--border)";
}

function setAuthStatus(text) {
  if (el.authStatus) el.authStatus.textContent = text;
}

function setAuthMessage(text, variant = "info") {
  if (!el.authMessage) return;
  el.authMessage.textContent = text;
  el.authMessage.classList.remove("hidden");
  el.authMessage.style.borderColor =
    variant === "error" ? "rgba(255,107,129,0.8)" : "var(--border)";
}

function setCircleLabel(text) {
  if (el.circleLabel) el.circleLabel.textContent = `Circle: ${text}`;
}

function setFetchStatus(text, variant = "neutral") {
  if (!el.fetchStatus) return;
  el.fetchStatus.textContent = text;
  el.fetchStatus.classList.toggle("neutral", variant === "neutral");
  el.fetchStatus.classList.toggle("danger", variant === "error");
  el.fetchStatus.classList.toggle("success", variant === "success");
}

function setProgress(percent) {
  if (!el.uploadProgress) return;
  el.uploadProgress.style.width = `${Math.min(Math.max(percent, 0), 100)}%`;
}

function setBadge(elBadge, label, ok) {
  if (!elBadge) return;
  elBadge.textContent = label;
  elBadge.style.borderColor = ok ? "rgba(127,255,212,0.6)" : "rgba(255,107,129,0.6)";
  elBadge.style.color = ok ? "var(--accent)" : "var(--danger)";
}

function applyTheme(next, opts = {}) {
  setTheme(next);
  if (next === "light") {
    document.documentElement.classList.add("light");
  } else {
    document.documentElement.classList.remove("light");
  }
  localStorage.setItem("wednesdays-theme", next);
  if (!opts.silent) showToast(`Theme: ${next}`);
}

// ─── Recording UI ─────────────────────────────────────────────────────────────

function updateRecordingUI(status = "Idle") {
  el.recordingStatus.textContent = status;
  el.recordingBanner.classList.toggle("hidden", status !== "Recording");
  el.stopRecording.disabled = status !== "Recording";
  el.startRecording.disabled = status === "Recording";
  if (status !== "Recording") {
    if (el.recordingTimer) updateRecordTimer(0);
  }
}

function updateRecordTimer(elapsedMs = 0) {
  if (!el.recordingTimer) return;
  const totalMs =
    clamp(Number(el.maxDurationInput?.value) || MAX_DURATION_SEC, 30, 300) * 1000;
  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const ss = `${s % 60}`.padStart(2, "0");
    return `${m}:${ss}`;
  };
  el.recordingTimer.textContent = `${fmt(elapsedMs)} / ${fmt(totalMs)} max`;
}

function updateEstimate(opts = {}) {
  const bitrate = clamp(Number(el.bitrateInput?.value) || 1200, 200, MAX_BITRATE_KBPS);
  const seconds = clamp(Number(el.maxDurationInput?.value) || MAX_DURATION_SEC, 30, 300);
  const bytes = (bitrate * 1000 * seconds) / 8 + (128000 * seconds) / 8;
  if (el.estSize) el.estSize.textContent = `Est. size: ${formatBytes(bytes)}`;
  if (!opts.silent) showToast("Bitrate/duration updated; estimate refreshed.");
}

// ─── Consent modal ────────────────────────────────────────────────────────────

function showConsent(action = null) {
  if (!el.consentModal) return true;
  pendingConsentAction = action;
  el.consentModal.classList.remove("hidden");
  el.consentModal.setAttribute("aria-hidden", "false");
  return false;
}

function hideConsentModal() {
  if (!el.consentModal) return;
  el.consentModal.classList.add("hidden");
  el.consentModal.setAttribute("aria-hidden", "true");
}

// ─── useRecordedBlob (wires blob into the UI) ────────────────────────────────

function useRecordedBlob(blob, source = "capture") {
  setLastRecordingBlob(blob);
  setLastUploadInfo(null);
  enqueueUpload({ blob, source });
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  const url = URL.createObjectURL(blob);
  lastUrl = url;
  el.preview.srcObject = null;
  el.preview.src = url;
  el.preview.muted = false;
  el.preview.controls = true;
  el.downloadLink.href = url;
  const state = getState();
  el.downloadLink.download = `${state.friends[state.hostIndex] || "wednesday"}-${Date.now()}.webm`;
  const shareCapable =
    typeof navigator.canShare === "function" &&
    (() => {
      try {
        return navigator.canShare({
          files: [new File([blob.slice(0, 1)], "probe.webm", { type: blob.type })],
        });
      } catch {
        return false;
      }
    })();
  el.shareRecording.disabled = !shareCapable;
  el.shareRecording.onclick = async () => {
    if (!shareCapable) return;
    try {
      const file = new File([blob], "wednesday.webm", { type: blob.type });
      await navigator.share({ title: "Wednesday's recap", text: "Here's my Wednesday's video.", files: [file] });
    } catch (err) {
      console.warn("Share cancelled or failed", err);
    }
  };
  el.mockUpload.disabled = false;
  setProgress(0);
  updateRecordingUI("Idle");
  showSupportMessage(
    source === "mock"
      ? "Mock video ready; save to mock cloud or download."
      : "Saved locally; download, share, or push to mock cloud."
  );
  setDemoStatus("Video ready");
}

// ─── Recording handlers ───────────────────────────────────────────────────────

async function startRecording() {
  if (!isRecordingSupported()) {
    showSupportMessage("In-browser recording is not supported here. Use your camera app and upload/share manually.");
    if (el.fallbackBanner) el.fallbackBanner.classList.remove("hidden");
    if (el.statusMedia) el.statusMedia.textContent = "MediaRecorder: unsupported";
    return;
  }
  if (el.statusMedia) el.statusMedia.textContent = "MediaRecorder: ok";
  if (el.fallbackBanner) el.fallbackBanner.classList.add("hidden");
  if (!consentGranted) {
    showConsent("record");
    return;
  }
  try {
    setLastRecordingBlob(null);
    el.mockUpload.disabled = true;
    await cameraStart({
      previewEl: el.preview,
      bitrateInput: el.bitrateInput,
      maxDurationInput: el.maxDurationInput,
      onStop: (blob) => useRecordedBlob(blob, "capture"),
      onStatus: updateRecordingUI,
      onTick: updateRecordTimer,
    });
    setDemoStatus("Recording live");
    showSupportMessage("Recording; keep the tab open. Video stays on your device.");
  } catch (err) {
    showSupportMessage("Camera/mic access failed. Check permissions and try again.");
    console.error(err);
  }
}

function stopRecording() {
  cameraStop({ onStatus: updateRecordingUI });
  setDemoStatus("Processing");
}

function useExistingUpload() {
  const file = el.fileInput?.files?.[0];
  if (!file) { showSupportMessage("Pick a video file first."); return; }
  import("./upload.js").then(({ validateBlob }) => {
    validateBlob(file, el.maxDurationInput).then((ok) => {
      if (!ok) return;
      useRecordedBlob(file, "upload");
      showSupportMessage("Loaded local file. You can upload/share/download now.");
    });
  });
}

// ─── Demo helpers ─────────────────────────────────────────────────────────────

function loadDemoData() {
  const state = getState();
  const now = Date.now();
  state.friends = ["Amira", "Diego", "Kavi", "Lena", "Morgan"];
  state.hostIndex = 1;
  state.nextSwitch = nextWednesday(now);
  state.history = [
    { name: "Kavi", when: now - WEEK_MS, trigger: "demo" },
    { name: "Amira", when: now - WEEK_MS * 2, trigger: "demo" },
  ];
  state.mockUploads = [
    { title: "Kavi recap", by: "Kavi", size: 420 * 1024, status: "complete", when: now - 20 * 60 * 1000 },
  ];
  setLastRecordingBlob(null);
  if (el.mockUpload) el.mockUpload.disabled = true;
  renderAll();
  setDemoStatus("Demo data loaded");
  showSupportMessage("Demo circle loaded. Rotate or record against the sample set.");
}

function simulateHandoff() {
  const state = getState();
  if (!state.friends.length) { showSupportMessage("Load the demo circle or add friends before simulating."); return; }
  rotateHost(state, "demo", Date.now());
  renderAll();
  setDemoStatus("Host advanced");
}

async function handleMockRecording() {
  try {
    showSupportMessage("Generating a mock clip without using your camera.");
    setDemoStatus("Generating mock video");
    updateRecordingUI("Processing");
    await createMockRecording(
      (blob) => useRecordedBlob(blob, "mock"),
      updateRecordingUI
    );
  } catch (err) {
    showSupportMessage(err.message || "Mock recording failed.");
    updateRecordingUI("Idle");
  }
}

async function handleSaveMockUpload() {
  const blob = getLastRecordingBlob();
  if (!blob) { showSupportMessage("Record or generate a mock clip before uploading."); return; }
  setDemoStatus("Uploading (mock)");
  el.mockUpload.disabled = true;
  const state = getState();
  const result = await saveMockUpload({ blob, state });
  if (result.ok) {
    renderMockUploads();
    showSupportMessage("Mock upload saved locally. Nothing leaves this device.");
    setDemoStatus("Mock upload saved");
  }
}

// ─── Notifications / calendar ─────────────────────────────────────────────────

async function requestNotificationPermission(opts = {}) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    try {
      const res = await Notification.requestPermission();
      lastNotificationPermission = res;
      if (!opts.silent) setUploadStatus(`Notifications: ${res}`);
    } catch (err) {
      console.warn(err);
      if (!opts.silent) setUploadStatus("Notification permission failed", "error");
    }
  } else {
    lastNotificationPermission = Notification.permission;
    if (!opts.silent) setUploadStatus(`Notifications: ${Notification.permission}`);
  }
}

function notifyHost() {
  if (typeof Notification === "undefined") { setUploadStatus("Notifications not supported in this browser.", "error"); return; }
  if (Notification.permission !== "granted") { setUploadStatus("Enable notifications first.", "error"); return; }
  const state = getState();
  const host = state.friends[state.hostIndex] || "Someone";
  const body = `It's your turn. Record a 60–90s recap before ${formatDate(state.nextSwitch || nextWednesday(Date.now()))}.`;
  try {
    new Notification(`Wednesday's: ${host}`, { body });
    import("./state.js").then(({ pushUploadAttempt }) => {
      pushUploadAttempt({ status: `notified ${host}`, size: 0, when: Date.now(), mock: true });
      renderUploadAttempts();
      renderQueue();
    });
  } catch (err) {
    console.warn(err);
    setUploadStatus("Could not show notification.", "error");
  }
}

function downloadIcsFile() {
  const state = getState();
  const host = state.friends[state.hostIndex] || "Host";
  const start = state.nextSwitch || nextWednesday(Date.now());
  const end = start + 15 * 60 * 1000;
  const uid = `wednesdays-${start}@local`;
  const dt = (ts) => new Date(ts).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Wednesdays//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`, `DTSTAMP:${dt(Date.now())}`, `DTSTART:${dt(start)}`, `DTEND:${dt(end)}`,
    `SUMMARY:Wednesday's host: ${host}`, `DESCRIPTION:It's ${host}'s turn to record a recap.`,
    "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", `DESCRIPTION:Reminder: ${host} is up.`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `wednesdays-${host}.ics`; a.click();
  URL.revokeObjectURL(url);
  setUploadStatus("Calendar reminder downloaded.");
}

// ─── Flags ────────────────────────────────────────────────────────────────────

function flagContent() {
  const reason = prompt("Describe the issue (e.g., inappropriate, consent, other):");
  if (!reason) return;
  const note = prompt("Any extra context? (optional)") || "";
  import("./state.js").then(({ pushFlag, getFlags }) => {
    pushFlag({ reason, note, when: Date.now() });
    renderFlags();
    setUploadStatus("Flag saved locally. Add server moderation before wider use.");
    const base = el.apiBase?.value?.trim();
    const session = getSession();
    if (base && session?.userId) {
      fetch(`${base.replace(/\/$/, "")}/flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": session.userId },
        body: JSON.stringify({ reason, note, circleId: getCircleId() || "local" }),
      }).catch((err) => console.warn("Flag API failed", err));
    }
  });
}

// ─── Device checks ────────────────────────────────────────────────────────────

function runChecks(opts = {}) {
  const mediaOk = typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices);
  const storageOk = (() => {
    try { localStorage.setItem("__w_test", "1"); localStorage.removeItem("__w_test"); return true; }
    catch { return false; }
  })();
  const notifyOk = typeof Notification !== "undefined" && Notification.permission === "granted";
  setBadge(el.statusMedia, `MediaRecorder: ${mediaOk ? "ok" : "no"}`, mediaOk);
  setBadge(el.statusStorage, `LocalStorage: ${storageOk ? "ok" : "no"}`, storageOk);
  setBadge(el.statusNotify, `Notifications: ${Notification?.permission || "n/a"}`, notifyOk);
  if (!mediaOk && el.fallbackBanner) el.fallbackBanner.classList.remove("hidden");
  if (!opts.silent) showToast("Checks updated");
}

// ─── Backup / import ──────────────────────────────────────────────────────────

function exportState() {
  const state = getState();
  const payload = { state, circleId: getCircleId(), savedAt: Date.now(), version: "v1" };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `wednesdays-backup-${Date.now()}.json`; a.click();
  URL.revokeObjectURL(url);
  setUploadStatus("Backup downloaded locally.");
}

function importState() {
  const file = el.importFile?.files?.[0];
  if (!file) { setUploadStatus("Pick a backup JSON file to import.", "error"); return; }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.state) throw new Error("No state found in backup");
      const state = getState();
      Object.assign(state, parsed.state);
      if (parsed.circleId) saveCircleId(parsed.circleId);
      renderAll();
      setUploadStatus("Backup imported. Review roster and history.");
    } catch (err) {
      console.warn(err);
      setUploadStatus("Failed to import backup. Check file format.", "error");
    }
  };
  reader.readAsText(file);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function hydrateSessionUI() {
  const session = getSession();
  if (session?.email && el.authEmail) el.authEmail.value = session.email;
  if (session?.token && el.authToken) el.authToken.value = session.token;
  if (session?.userId) {
    setAuthStatus(`Logged in as ${session.email || session.userId}`);
    setUploadStatus("Using saved session. Ready to request signed uploads.");
  } else {
    setAuthStatus("Logged out");
  }
  const cid = getCircleId();
  if (cid) setCircleLabel(cid);
  // Token in URL
  const urlToken = new URLSearchParams(window.location.search).get("token");
  if (urlToken && el.authToken) {
    el.authToken.value = urlToken;
    localStorage.setItem(authTokenKey, urlToken);
    setAuthMessage("Token detected from URL. Click Verify to log in.");
  }
  const urlBase = new URLSearchParams(window.location.search).get("api");
  if (urlBase && el.apiBase) {
    el.apiBase.value = urlBase;
    saveApiBase(urlBase);
  }
}

async function handleAuthRequest() {
  const apiBase = el.apiBase?.value?.trim();
  const email = el.authEmail?.value?.trim();
  setAuthStatus("Sending…");
  const result = await requestMagicLink({ apiBase, email });
  if (result.error) {
    setAuthStatus("Logged out");
    setAuthMessage(result.error, "error");
    return;
  }
  if (result.token) {
    if (el.authToken) el.authToken.value = result.token;
    localStorage.setItem(authTokenKey, result.token);
  }
  if (email) localStorage.setItem(authEmailKey, email);
  setAuthStatus("Link sent (mock)");
  setAuthMessage("Token returned for dev; paste above or simulate email flow.");
}

async function handleAuthVerify() {
  const apiBase = el.apiBase?.value?.trim();
  const token = el.authToken?.value?.trim();
  setAuthStatus("Verifying…");
  const result = await verifyMagicLink({ apiBase, token });
  if (result.error) {
    setAuthStatus("Logged out");
    setAuthMessage(result.error, "error");
    return;
  }
  saveSession({ userId: result.userId, token, email: el.authEmail?.value || "" });
  setAuthStatus(`Logged in as ${el.authEmail?.value || result.userId}`);
  setAuthMessage("Logged in. You can now request signed uploads and circle changes.");
  setUploadStatus("Authenticated. Ready for signed uploads.");
}

function logout() {
  clearSession();
  setAuthStatus("Logged out");
  setAuthMessage("Logged out locally.");
  setUploadStatus("Need to log in for uploads.", "error");
  setCircleLabel("none");
}

async function acceptInviteFromUrl() {
  const token = new URLSearchParams(window.location.search).get("invite");
  if (!token) return;
  const base = el.apiBase?.value?.trim();
  if (!base) return;
  await acceptInviteToken(token, base);
}

// ─── Render functions ─────────────────────────────────────────────────────────

function renderHost() {
  const state = getState();
  if (!state.friends.length) {
    el.currentHost.textContent = "Add friends to start";
    el.nextSwitch.textContent = "";
    el.countdown.textContent = "—";
    el.countdown.classList.add("neutral");
    return;
  }
  el.currentHost.textContent = state.friends[state.hostIndex] || "Someone new";
  if (state.nextSwitch) {
    el.countdown.textContent = `Next handoff in ${formatCountdown(state.nextSwitch)}`;
    el.countdown.classList.remove("neutral");
    el.nextSwitch.textContent = `Handoff: ${formatDate(state.nextSwitch)}`;
  }
}

function renderFriends() {
  const state = getState();
  el.friendList.innerHTML = "";
  if (!state.friends.length) {
    const empty = document.createElement("li");
    empty.className = "muted tiny";
    empty.textContent = "No friends yet. Add a few to start the rotation.";
    el.friendList.appendChild(empty);
    return;
  }
  state.friends.forEach((name, idx) => {
    const li = document.createElement("li");
    li.className = "friend";
    const main = document.createElement("div");
    main.innerHTML = `<div>${name}</div><div class="meta">#${idx + 1} in rotation</div>`;
    const remove = document.createElement("button");
    remove.className = "ghost";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      const wasHost = idx === state.hostIndex;
      state.friends.splice(idx, 1);
      if (!state.friends.length) {
        state.nextSwitch = nextWednesday(Date.now());
        state.history = [];
        state.hostIndex = 0;
      } else {
        if (idx < state.hostIndex) state.hostIndex -= 1;
        if (wasHost || state.hostIndex >= state.friends.length) {
          state.hostIndex = state.hostIndex % state.friends.length;
        }
      }
      persist();
      renderAll();
    });
    li.append(main, remove);
    el.friendList.appendChild(li);
  });
}

function renderHistory() {
  const state = getState();
  el.historyList.innerHTML = "";
  if (!state.history || !state.history.length) {
    const li = document.createElement("li");
    li.className = "muted tiny";
    li.textContent = "History lives on this device only.";
    el.historyList.appendChild(li);
    return;
  }
  state.history.slice(0, 10).forEach((entry) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${entry.name}</strong> — ${formatDate(entry.when)} <span class="muted tiny">(${entry.trigger})</span>`;
    el.historyList.appendChild(li);
  });
}

function renderMockUploads() {
  el.mockUploadList.innerHTML = "";
  const state = getState();
  const hasBlob = Boolean(getLastRecordingBlob());
  if (!state.mockUploads || !state.mockUploads.length) {
    const li = document.createElement("li");
    li.className = "muted tiny";
    li.textContent = "No mock uploads yet. Generate a mock recording, then save it.";
    el.mockUploadList.appendChild(li);
    el.mockUpload.disabled = !hasBlob;
    return;
  }
  state.mockUploads.slice(0, 10).forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${item.title}</strong> — ${formatBytes(item.size)} <span class="muted tiny">(${item.by}, ${item.status}, ${formatDate(item.when)})</span>`;
    el.mockUploadList.appendChild(li);
  });
  el.mockUpload.disabled = !hasBlob;
}

function renderUploadAttempts() {
  if (!el.uploadAttempts) return;
  el.uploadAttempts.innerHTML = "";
  const attempts = getUploadAttempts();
  if (!attempts.length) {
    const li = document.createElement("li");
    li.className = "muted tiny";
    li.textContent = "No uploads yet. Request a signed upload to see progress here.";
    el.uploadAttempts.appendChild(li);
    return;
  }
  attempts.slice(0, 8).forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${item.status}</strong> — ${formatBytes(item.size)} <span class="muted tiny">(${formatDate(item.when)}${item.mock ? ", mock" : ""}${item.queue ? ", queued" : ""})</span>`;
    el.uploadAttempts.appendChild(li);
  });
}

function renderFlags() {
  if (!el.flagList) return;
  el.flagList.innerHTML = "";
  const allFlags = [...getServerFlags(), ...getFlags()].slice(0, 20);
  if (!allFlags.length) {
    const li = document.createElement("li");
    li.className = "muted tiny";
    li.textContent = "No reports yet.";
    el.flagList.appendChild(li);
    return;
  }
  allFlags.forEach((f) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${f.reason}</strong> — ${formatDate(f.when)} <span class="muted tiny">${f.note || ""}</span>`;
    el.flagList.appendChild(li);
  });
}

function renderQueue() {
  if (!el.uploadQueueList) return;
  el.uploadQueueList.innerHTML = "";
  const uploadQueue = getUploadQueue();
  const serverUploads = getServerUploads();
  if (!uploadQueue.length && !serverUploads.length) {
    const li = document.createElement("li");
    li.className = "muted tiny";
    li.textContent = "Queue is empty.";
    el.uploadQueueList.appendChild(li);
    if (el.clearCompleted) el.clearCompleted.disabled = true;
    return;
  }
  let hasCompleted = false;
  uploadQueue.forEach((item) => {
    const li = document.createElement("li");
    const badge = document.createElement("span");
    badge.className = "badge inline";
    badge.textContent = item.status;
    const info = document.createElement("div");
    info.className = "queue-row";
    const text = document.createElement("div");
    const pct = item.status === "uploading" && item.progress ? ` — ${Math.round(item.progress)}%` : "";
    text.innerHTML = `${formatBytes(item.size)} <span class="muted tiny">${item.source}${pct}</span>`;
    const actions = document.createElement("div");
    if (item.status === "pending" || item.status === "uploading") {
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "ghost danger tiny-btn";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", () => cancelQueueItem(item.id));
      actions.appendChild(cancelBtn);
    }
    info.append(badge, text, actions);
    li.appendChild(info);
    const barWrap = document.createElement("div");
    barWrap.className = "queue-progress";
    const bar = document.createElement("div");
    bar.className = "queue-progress-bar";
    bar.style.width =
      item.status === "uploading" && item.progress
        ? `${Math.round(item.progress)}%`
        : item.status === "done"
        ? "100%"
        : "0%";
    barWrap.appendChild(bar);
    li.appendChild(barWrap);
    el.uploadQueueList.appendChild(li);
    if (item.status === "done" || item.status === "failed") hasCompleted = true;
  });
  if (serverUploads.length) {
    const divider = document.createElement("li");
    divider.className = "muted tiny";
    divider.textContent = "Recent server uploads:";
    el.uploadQueueList.appendChild(divider);
    serverUploads.slice(0, 5).forEach((u) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="badge inline">server</span> ${formatBytes(u.size)} <span class="muted tiny">${u.contentType || ""}</span>`;
      el.uploadQueueList.appendChild(li);
    });
  }
  if (el.clearCompleted) el.clearCompleted.disabled = !hasCompleted;
  // Prune old completed
  const maxKeep = 5;
  const completed = uploadQueue.filter((u) => u.status === "done" || u.status === "failed");
  if (completed.length > maxKeep) {
    const keep = uploadQueue.filter((u) => u.status !== "done" && u.status !== "failed");
    keep.push(...completed.slice(0, maxKeep));
    setUploadQueue(keep);
  }
}

function renderInvites() {
  if (!el.inviteList) return;
  el.inviteList.innerHTML = "";
  const invites = getInvites();
  if (!invites.length) {
    const li = document.createElement("li");
    li.className = "muted tiny";
    li.textContent = "No invites yet.";
    el.inviteList.appendChild(li);
    return;
  }
  invites.slice(0, 10).forEach((inv) => {
    const li = document.createElement("li");
    const row = document.createElement("div");
    row.className = "queue-row";
    const text = document.createElement("div");
    text.innerHTML = `<strong>${inv.email}</strong> <span class="muted tiny">${formatDate(inv.when)}</span>`;
    const actions = document.createElement("div");
    const copyBtn = document.createElement("button");
    copyBtn.className = "ghost tiny-btn";
    copyBtn.textContent = "Copy link";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(inv.url || inv.token);
        showToast("Invite link copied");
      } catch {
        showToast("Copy failed; select text manually.");
      }
    });
    actions.appendChild(copyBtn);
    row.append(text, actions);
    li.appendChild(row);
    el.inviteList.appendChild(li);
  });
}

function renderAll() {
  const state = getState();
  ensureRotation(state);
  renderHost();
  renderFriends();
  renderHistory();
  renderMockUploads();
  renderQueue();
  renderUploadAttempts();
  renderFlags();
  renderInvites();
  persist();
}

// ─── Countdown ticker ─────────────────────────────────────────────────────────

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(renderAll, 1000 * 30);
}

// ─── Event listeners ──────────────────────────────────────────────────────────

function attachListeners() {
  el.friendForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = el.friendInput.value.trim();
    if (!name) return;
    const state = getState();
    if (state.friends.find((n) => n.toLowerCase() === name.toLowerCase())) {
      showSupportMessage(`${name} is already in the list.`);
      return;
    }
    state.friends.push(name);
    if (state.friends.length === 1) {
      state.hostIndex = 0;
      state.nextSwitch = nextWednesday(Date.now());
    }
    el.friendInput.value = "";
    renderAll();
  });

  el.shuffleOrder.addEventListener("click", () => { shuffleFriends(getState()); renderAll(); });
  el.advanceNow.addEventListener("click", () => {
    const state = getState();
    if (!state.friends.length) return;
    rotateHost(state, "manual", Date.now());
    renderAll();
  });
  el.resetRotation.addEventListener("click", () => { doResetRotation(getState()); renderAll(); });

  el.startRecording.addEventListener("click", startRecording);
  el.stopRecording.addEventListener("click", stopRecording);
  el.loadDemo.addEventListener("click", loadDemoData);
  el.simulateHandoff.addEventListener("click", simulateHandoff);
  el.mockRecording.addEventListener("click", handleMockRecording);
  el.mockUpload.addEventListener("click", handleSaveMockUpload);
  el.useUpload.addEventListener("click", useExistingUpload);

  el.saveApiBase.addEventListener("click", () => {
    const val = el.apiBase.value.trim();
    saveApiBase(val);
    setUploadStatus(`Saved API base: ${val || "not set"}`);
  });

  el.pingApi.addEventListener("click", () => pingBackend(el.apiBase?.value?.trim()));

  el.signUpload.addEventListener("click", () => {
    const queue = getUploadQueue();
    const pending = queue.find((u) => u.status === "pending");
    if (pending) {
      processQueue();
    } else {
      requestSignedUpload(null, {
        maxDurationInput: el.maxDurationInput,
        apiBaseEl: el.apiBase,
        retryUploadEl: el.retryUpload,
      });
    }
  });

  el.retryUpload?.addEventListener("click", () => processQueue());
  el.syncCircle?.addEventListener("click", () => syncCircle(el.apiBase?.value?.trim()));
  el.pauseQueue?.addEventListener("click", doPauseQueue);
  el.resumeQueue?.addEventListener("click", doResumeQueue);
  el.cancelQueue?.addEventListener("click", doCancelQueue);
  el.clearCompleted?.addEventListener("click", doClearCompleted);

  el.authRequest?.addEventListener("click", handleAuthRequest);
  el.authVerify?.addEventListener("click", handleAuthVerify);
  el.authLogout?.addEventListener("click", logout);

  el.exportState?.addEventListener("click", exportState);
  el.importState?.addEventListener("click", importState);
  el.notifyPermission?.addEventListener("click", () => requestNotificationPermission());
  el.notifyHost?.addEventListener("click", notifyHost);
  el.downloadIcs?.addEventListener("click", downloadIcsFile);
  el.flagContent?.addEventListener("click", flagContent);
  el.bitrateInput?.addEventListener("input", () => updateEstimate());
  el.maxDurationInput?.addEventListener("input", () => updateEstimate());

  el.consentAccept?.addEventListener("click", () => {
    consentGranted = true;
    const action = pendingConsentAction;
    pendingConsentAction = null;
    hideConsentModal();
    showToast("Consent acknowledged. You can record now.");
    if (action === "record") startRecording();
  });

  el.consentCancel?.addEventListener("click", () => {
    consentGranted = false;
    pendingConsentAction = null;
    hideConsentModal();
    showToast("Recording cancelled.");
  });

  el.themeToggle?.addEventListener("click", () =>
    applyTheme(getTheme() === "light" ? "dark" : "light")
  );

  el.fabRecord?.addEventListener("click", () =>
    document.getElementById("record-card")?.scrollIntoView({ behavior: "smooth" })
  );
  el.fabUpload?.addEventListener("click", () =>
    document.getElementById("backend-card")?.scrollIntoView({ behavior: "smooth" })
  );
  el.runChecks?.addEventListener("click", () => runChecks());
  el.scrollRecord?.addEventListener("click", () =>
    document.getElementById("record-card")?.scrollIntoView({ behavior: "smooth" })
  );
  el.scrollQueue?.addEventListener("click", () =>
    document.getElementById("backend-card")?.scrollIntoView({ behavior: "smooth" })
  );
  el.jumpUpload?.addEventListener("click", () =>
    document.getElementById("backend-card")?.scrollIntoView({ behavior: "smooth" })
  );
  el.jumpNotify?.addEventListener("click", () => {
    requestNotificationPermission();
    document.getElementById("reminders-card")?.scrollIntoView({ behavior: "smooth" });
  });

  el.fetchUploads?.addEventListener("click", () => fetchUploads(el.apiBase?.value?.trim()));
  el.fetchFlags?.addEventListener("click", () => fetchFlags(el.apiBase?.value?.trim()));

  el.createInvite?.addEventListener("click", async () => {
    const result = await createInvite(el.apiBase?.value?.trim(), el.inviteEmail?.value?.trim());
    if (result.ok) { renderInvites(); if (el.inviteEmail) el.inviteEmail.value = ""; }
  });
  el.inviteSubmit?.addEventListener("click", async () => {
    const result = await createInvite(el.apiBase?.value?.trim(), el.inviteEmail?.value?.trim());
    if (result.ok) { renderInvites(); if (el.inviteEmail) el.inviteEmail.value = ""; }
  });
  el.inviteAccept?.addEventListener("click", async () => {
    const token = (el.inviteToken?.value || "").trim();
    await acceptInviteToken(token, el.apiBase?.value?.trim());
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  // Hydrate state first
  hydrateState();

  // Wire up upload module callbacks
  initUpload({
    onQueueRender: renderQueue,
    onAttemptsRender: renderUploadAttempts,
    onSetProgress: setProgress,
    onSetUploadStatus: setUploadStatus,
    onSetBackendStatus: setBackendStatus,
    onSetFetchStatus: setFetchStatus,
    onSetCircleLabel: setCircleLabel,
    onRenderAll: renderAll,
    onShowToast: showToast,
    elRefs: {
      pauseQueue: el.pauseQueue,
      resumeQueue: el.resumeQueue,
      cancelQueue: el.cancelQueue,
      clearCompleted: el.clearCompleted,
      apiBase: el.apiBase,
      retryUpload: el.retryUpload,
      maxDurationInput: el.maxDurationInput,
    },
  });

  attachListeners();

  // Initial render
  renderAll();
  setDemoStatus("Idle");
  if (el.apiBase) el.apiBase.value = getApiBase();
  applyTheme(getTheme(), { silent: true });
  setBackendStatus("Offline");
  hydrateSessionUI();
  setProgress(0);
  updateEstimate({ silent: true });
  runChecks({ silent: true });
  acceptInviteFromUrl();

  // Disable queue buttons until there's work
  if (el.pauseQueue) el.pauseQueue.disabled = true;
  if (el.resumeQueue) el.resumeQueue.disabled = true;
  if (el.cancelQueue) el.cancelQueue.disabled = true;
  if (el.clearCompleted) el.clearCompleted.disabled = true;

  startCountdown();

  // Service worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((err) =>
      console.warn("SW registration failed", err)
    );
  }

  requestNotificationPermission({ silent: true });
}

init();
