// js/upload.js — Upload/sync logic, queue management, API calls

import {
  MAX_SIZE_BYTES,
  MAX_DURATION_SEC,
  MAX_BITRATE_KBPS,
  getState,
  getUploadQueue,
  setUploadQueue,
  getUploadAttempts,
  pushUploadAttempt,
  getQueueState,
  setQueueState,
  getCurrentQueueItem,
  setCurrentQueueItem,
  getCurrentUploadXhr,
  setCurrentUploadXhr,
  setServerUploads,
  setServerFlags,
  pushInvite,
  getInvites,
} from "./state.js";
import {
  getSession,
  getCircleId,
  saveCircleId,
  authHeaders,
  persist,
} from "./storage.js";
import { getVideoMeta } from "./camera.js";
import { clamp, formatBytes, sleep } from "./utils.js";
import { nextWednesday } from "./rotation.js";

// Module-level blob references
let _lastRecordingBlob = null;
let _lastUploadInfo = null;

export function getLastRecordingBlob() { return _lastRecordingBlob; }
export function setLastRecordingBlob(b) { _lastRecordingBlob = b; }
export function getLastUploadInfo() { return _lastUploadInfo; }
export function setLastUploadInfo(i) { _lastUploadInfo = i; }

// Callbacks set by ui.js
let _onQueueRender = null;
let _onAttemptsRender = null;
let _onSetProgress = null;
let _onSetUploadStatus = null;
let _onSetBackendStatus = null;
let _onSetFetchStatus = null;
let _onSetCircleLabel = null;
let _onRenderAll = null;
let _onShowToast = null;
let _elRefs = null; // queue button element refs

export function initUpload({
  onQueueRender,
  onAttemptsRender,
  onSetProgress,
  onSetUploadStatus,
  onSetBackendStatus,
  onSetFetchStatus,
  onSetCircleLabel,
  onRenderAll,
  onShowToast,
  elRefs,
}) {
  _onQueueRender = onQueueRender;
  _onAttemptsRender = onAttemptsRender;
  _onSetProgress = onSetProgress;
  _onSetUploadStatus = onSetUploadStatus;
  _onSetBackendStatus = onSetBackendStatus;
  _onSetFetchStatus = onSetFetchStatus;
  _onSetCircleLabel = onSetCircleLabel;
  _onRenderAll = onRenderAll;
  _onShowToast = onShowToast;
  _elRefs = elRefs;
}

// ---- Validation ----

export async function validateBlob(blob, maxDurationInput) {
  if (!blob) {
    _onSetUploadStatus("No video to upload. Record or pick a file.", "error");
    return false;
  }
  if (blob.size > MAX_SIZE_BYTES) {
    _onSetUploadStatus(
      `File too large (${formatBytes(blob.size)}). Max allowed is ${formatBytes(MAX_SIZE_BYTES)}.`,
      "error"
    );
    return false;
  }
  const durationCap = clamp(
    Number(maxDurationInput?.value) || MAX_DURATION_SEC,
    30,
    300
  );
  const { duration } = await getVideoMeta(blob);
  if (duration && duration > durationCap) {
    _onSetUploadStatus(
      `Clip too long (${Math.round(duration)}s). Max allowed is ${durationCap}s.`,
      "error"
    );
    return false;
  }
  return true;
}

// ---- Queue ----

export function enqueueUpload({ blob, source }) {
  const queue = getUploadQueue();
  queue.push({
    id: `q_${Date.now()}`,
    blob,
    source,
    status: "pending",
    size: blob.size,
    createdAt: Date.now(),
    progress: 0,
  });
  pushUploadAttempt({
    status: `queued (${source})`,
    size: blob.size,
    when: Date.now(),
    mock: source === "mock",
    queue: true,
  });
  if (_onAttemptsRender) _onAttemptsRender();
  processQueue();
}

export async function processQueue() {
  const queueState = getQueueState();
  if (queueState === "paused" || queueState === "running") return;

  const queue = getUploadQueue();
  const next = queue.find((u) => u.status === "pending");
  if (!next) {
    setQueueState("idle");
    _updateQueueButtons(false, false, false);
    return;
  }
  setQueueState("running");
  next.status = "uploading";
  setCurrentQueueItem(next);
  _updateQueueButtons(true, false, true);
  _lastRecordingBlob = next.blob;
  await requestSignedUpload(next);
  setQueueState("idle");
  setCurrentQueueItem(null);
  processQueue();
}

export function pauseQueue() {
  setQueueState("paused");
  _updateQueueButtons(false, true, true);
}

export function resumeQueue() {
  setQueueState("idle");
  _updateQueueButtons(true, false, false);
  processQueue();
}

export function cancelQueue() {
  setUploadQueue([]);
  setCurrentQueueItem(null);
  const xhr = getCurrentUploadXhr();
  if (xhr) {
    xhr.abort();
    setCurrentUploadXhr(null);
  }
  setQueueState("idle");
  _updateQueueButtons(false, false, false);
  _onSetUploadStatus("Queue cleared.");
  if (_onQueueRender) _onQueueRender();
}

export function clearCompleted() {
  setUploadQueue(getUploadQueue().filter((u) => u.status !== "done" && u.status !== "failed"));
  if (_onQueueRender) _onQueueRender();
  _onSetUploadStatus("Cleared completed uploads.");
  persist();
}

export function cancelQueueItem(id) {
  const queue = getUploadQueue();
  const idx = queue.findIndex((u) => u.id === id);
  if (idx === -1) return;
  const current = getCurrentQueueItem();
  if (current && current.id === id) {
    const xhr = getCurrentUploadXhr();
    if (xhr) {
      xhr.abort();
      setCurrentUploadXhr(null);
    }
  }
  const removed = queue.splice(idx, 1)[0];
  if (!queue.length) {
    setQueueState("idle");
    _updateQueueButtons(false, false, false);
  }
  pushUploadAttempt({
    status: "cancelled",
    size: removed?.size || 0,
    when: Date.now(),
    mock: removed?.source === "mock",
    queue: true,
  });
  if (_onQueueRender) _onQueueRender();
  if (_onAttemptsRender) _onAttemptsRender();
  persist();
  processQueue();
  if (_onShowToast) _onShowToast("Upload cancelled");
}

function _updateQueueButtons(pauseEnabled, resumeEnabled, cancelEnabled) {
  if (!_elRefs) return;
  const { pauseQueue, resumeQueue, cancelQueue, clearCompleted } = _elRefs;
  if (pauseQueue) pauseQueue.disabled = !pauseEnabled;
  if (resumeQueue) resumeQueue.disabled = !resumeEnabled;
  if (cancelQueue) cancelQueue.disabled = !cancelEnabled;
}

// ---- Signed upload ----

export async function requestSignedUpload(fromQueueItem, { maxDurationInput, apiBaseEl, retryUploadEl } = {}) {
  // Allow callers to pass element refs; fall back to last cached refs
  const apiBase = apiBaseEl?.value?.trim() || _elRefs?.apiBase?.value?.trim() || "";
  const retryBtn = retryUploadEl || _elRefs?.retryUpload;
  const mDurationInput = maxDurationInput || _elRefs?.maxDurationInput;

  if (!apiBase) {
    _onSetUploadStatus("Enter an API base URL first.", "error");
    return;
  }
  if (!_lastRecordingBlob) {
    _onSetUploadStatus("Record or load a file first.", "error");
    return;
  }
  const valid = await validateBlob(_lastRecordingBlob, mDurationInput);
  if (!valid) {
    if (retryBtn) retryBtn.disabled = false;
    return;
  }

  const state = getState();
  const filename =
    `${state.friends[state.hostIndex] || "wednesday"}-${Date.now()}.webm`;
  const payload = {
    circleId: getCircleId() || "demo-circle",
    filename,
    contentType: _lastRecordingBlob.type || "video/webm",
    size: _lastRecordingBlob.size,
    duration: 0,
  };
  const session = getSession();
  if (!session?.userId) {
    _onSetUploadStatus("Log in first (mock magic link).", "error");
    return;
  }
  if (retryBtn) retryBtn.disabled = true;
  _onSetProgress(0);

  try {
    _onSetBackendStatus("Signing...");
    _onSetUploadStatus("Requesting signed URL…");
    const res = await fetch(`${apiBase.replace(/\/$/, "")}/uploads/sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(session),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Sign request failed");
    }
    const data = await res.json();
    _onSetBackendStatus("Signed");
    _onSetUploadStatus(
      `Signed upload ready ${data.mock ? "(mock)" : ""}. Upload URL host: ${
        new URL(data.uploadUrl).host
      }`
    );
    _lastUploadInfo = { data, payload };

    const isMock = data.mock || data.uploadUrl.includes("mock");
    if (isMock) {
      _onSetUploadStatus("Using mock signed URL; no real upload performed.");
      _onSetProgress(100);
      if (fromQueueItem) {
        fromQueueItem.status = "done";
        fromQueueItem.progress = 100;
      }
      pushUploadAttempt({
        status: "mock signed",
        size: _lastRecordingBlob.size,
        when: Date.now(),
        mock: true,
        queue: Boolean(fromQueueItem),
      });
      if (_onAttemptsRender) _onAttemptsRender();
      if (_onQueueRender) _onQueueRender();
      if (retryBtn) retryBtn.disabled = false;
      return;
    }

    await uploadWithProgress(
      data.uploadUrl,
      _lastRecordingBlob,
      payload.contentType,
      fromQueueItem
    );
    _onSetUploadStatus("Uploaded to signed URL (verify in bucket).");
    _onSetProgress(100);
    pushUploadAttempt({
      status: "uploaded",
      size: _lastRecordingBlob.size,
      when: Date.now(),
      mock: false,
      queue: Boolean(fromQueueItem),
    });
    if (fromQueueItem) fromQueueItem.status = "done";

    // Commit metadata
    try {
      const payloadCommit = {
        circleId: payload.circleId,
        resourceUrl: data.resourceUrl,
        size: payload.size,
        contentType: payload.contentType,
        duration: payload.duration,
      };
      await fetch(`${apiBase.replace(/\/$/, "")}/uploads/commit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(session),
        },
        body: JSON.stringify(payloadCommit),
      });
    } catch (errCommit) {
      console.warn("Metadata commit failed", errCommit);
    }

    if (_onAttemptsRender) _onAttemptsRender();
    if (_onQueueRender) _onQueueRender();
    if (retryBtn) retryBtn.disabled = false;
  } catch (err) {
    console.warn(err);
    _onSetBackendStatus("Offline");
    _onSetUploadStatus(err.message || "Failed to sign upload", "error");
    if (retryBtn) retryBtn.disabled = false;
    pushUploadAttempt({
      status: "failed",
      size: _lastRecordingBlob?.size || 0,
      when: Date.now(),
      mock: false,
      queue: Boolean(fromQueueItem),
    });
    if (_onAttemptsRender) _onAttemptsRender();
    if (_onQueueRender) _onQueueRender();
    _onSetProgress(0);
    if (fromQueueItem) fromQueueItem.status = "failed";
  }
}

// ---- XHR upload with progress ----

export function uploadWithProgress(url, blob, contentType, queueItem) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    setCurrentUploadXhr(xhr);
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType || "application/octet-stream");
    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        const percent = (evt.loaded / evt.total) * 100;
        _onSetProgress(percent);
        if (queueItem) {
          queueItem.progress = percent;
          if (_onQueueRender) _onQueueRender();
        }
      }
    };
    xhr.onload = () => {
      setCurrentUploadXhr(null);
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}`));
    };
    xhr.onerror = () => { setCurrentUploadXhr(null); reject(new Error("Network error during upload")); };
    xhr.onabort = () => { setCurrentUploadXhr(null); reject(new Error("Upload aborted")); };
    xhr.send(blob);
  });
}

// ---- Backend API calls ----

export async function pingBackend(apiBase) {
  if (!apiBase) {
    _onSetUploadStatus("Enter an API base URL first.", "error");
    return;
  }
  try {
    _onSetBackendStatus("Pinging...");
    const res = await fetch(`${apiBase.replace(/\/$/, "")}/health`).then((r) => r.json());
    _onSetBackendStatus("Online");
    _onSetUploadStatus(`Backend ok (${res.env || "unknown env"})`);
  } catch (err) {
    console.warn(err);
    _onSetBackendStatus("Offline");
    _onSetUploadStatus("Backend unreachable. Is it running?", "error");
  }
}

export async function requestMagicLink({ apiBase, email, authTokenEl, authEmailKey: emailKey }) {
  if (!apiBase) return { error: "Enter API base first." };
  if (!email) return { error: "Enter email." };
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, "")}/auth/request-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to request link");
    return { token: data.token };
  } catch (err) {
    console.warn(err);
    return { error: err.message || "Request failed" };
  }
}

export async function verifyMagicLink({ apiBase, token }) {
  if (!apiBase) return { error: "Enter API base first." };
  if (!token) return { error: "Paste token from email." };
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, "")}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Verify failed");
    return { userId: data.userId };
  } catch (err) {
    console.warn(err);
    return { error: err.message || "Verify failed" };
  }
}

export async function syncCircle(apiBase) {
  const session = getSession();
  if (!apiBase) { _onSetUploadStatus("Enter API base first.", "error"); return; }
  if (!session?.userId) { _onSetUploadStatus("Log in first.", "error"); return; }

  const api = (path) => `${apiBase.replace(/\/$/, "")}${path}`;
  const state = getState();

  try {
    _onSetBackendStatus("Syncing…");
    const circlesRes = await fetch(api("/circles"), { headers: authHeaders(session) });
    if (!circlesRes.ok) throw new Error("Failed to fetch circles");
    const circles = await circlesRes.json();
    let circle = circles.circles?.[0];
    if (!circle) {
      const createRes = await fetch(api("/circles"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(session) },
        body: JSON.stringify({ name: "Wednesday Demo" }),
      });
      circle = (await createRes.json()).circle;
    }
    // Add missing members
    const existingNames = new Set((circle.members || []).map((m) => m.name.toLowerCase()));
    for (const name of state.friends) {
      if (existingNames.has(name.toLowerCase())) continue;
      await fetch(api(`/circles/${circle.id}/members`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(session) },
        body: JSON.stringify({ email: `${name.toLowerCase()}@example.com`, name }),
      });
    }
    // Refresh circle
    const refreshed = await fetch(api("/circles"), { headers: authHeaders(session) }).then((r) => r.json());
    circle = refreshed.circles?.find((c) => c.id === circle.id) || circle;

    const assignRes = await fetch(api(`/circles/${circle.id}/assignments`), {
      headers: authHeaders(session),
    });
    const assigns = await assignRes.json();
    if (assignRes.ok) {
      const memberNames = circle.members?.map((m) => m.name) || state.friends;
      if (memberNames.length) state.friends = memberNames;
      if (assigns.host?.name) {
        const idx = state.friends.findIndex((n) => n === assigns.host.name);
        state.hostIndex = idx >= 0 ? idx : 0;
      } else {
        state.hostIndex = 0;
      }
      state.nextSwitch = assigns.nextSwitch || state.nextSwitch;
      state.history =
        assigns.assignments?.map((a) => ({
          name:
            circle.members?.find((m) => m.id === a.userId)?.name ||
            assigns.host?.name ||
            "Host",
          when: a.atTs,
          trigger: a.trigger || "server",
        })) || state.history;
      saveCircleId(circle.id);
      _onSetCircleLabel(circle.id);
      if (_onRenderAll) _onRenderAll();
      _onSetBackendStatus("Synced");
      _onSetUploadStatus("Backend circle synced; uploads will use this circle.");
    } else {
      throw new Error(assigns.error || "Failed to sync assignments");
    }
  } catch (err) {
    console.warn(err);
    _onSetBackendStatus("Offline");
    _onSetUploadStatus(err.message || "Failed to sync circle", "error");
  }
}

export async function fetchUploads(apiBase) {
  const session = getSession();
  if (!apiBase || !session?.userId) {
    _onSetUploadStatus("Set API base and log in to fetch uploads.", "error");
    _onSetFetchStatus("Fetch uploads failed (auth/base)", "error");
    return;
  }
  try {
    const res = await fetch(
      `${apiBase.replace(/\/$/, "")}/uploads?circleId=${getCircleId() || ""}`,
      { headers: authHeaders(session) }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Fetch failed");
    setServerUploads((data.uploads || []).map((u) => ({ ...u, status: "server" })));
    if (_onQueueRender) _onQueueRender();
    _onSetUploadStatus(`Fetched ${data.uploads?.length || 0} uploads from server.`);
    _onSetFetchStatus(`Uploads fetched (${data.uploads?.length || 0})`, "success");
  } catch (err) {
    console.warn(err);
    _onSetUploadStatus(err.message || "Fetch uploads failed", "error");
    _onSetFetchStatus("Fetch uploads failed", "error");
  }
}

export async function fetchFlags(apiBase) {
  const session = getSession();
  if (!apiBase || !session?.userId) {
    _onSetUploadStatus("Set API base and log in to fetch flags.", "error");
    _onSetFetchStatus("Fetch flags failed (auth/base)", "error");
    return;
  }
  try {
    const res = await fetch(
      `${apiBase.replace(/\/$/, "")}/flags?circleId=${getCircleId() || ""}`,
      { headers: authHeaders(session) }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Fetch failed");
    setServerFlags(data.flags || []);
    _onSetUploadStatus(`Fetched ${data.flags?.length || 0} flags from server.`);
    _onSetFetchStatus(`Flags fetched (${data.flags?.length || 0})`, "success");
  } catch (err) {
    console.warn(err);
    _onSetUploadStatus(err.message || "Fetch flags failed", "error");
    _onSetFetchStatus("Fetch flags failed", "error");
  }
}

export async function createInvite(apiBase, inviteEmail) {
  const session = getSession();
  if (!apiBase || !session?.userId) {
    _onSetUploadStatus("Set API base and log in to create invites.", "error");
    return { error: "Not set up" };
  }
  if (!inviteEmail) {
    _onSetUploadStatus("Enter an invite email.", "error");
    return { error: "No email" };
  }
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, "")}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(session) },
      body: JSON.stringify({ circleId: getCircleId() || "demo-circle", email: inviteEmail }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Invite failed");
    pushInvite({ email: inviteEmail, token: data.token, url: data.inviteUrl, when: Date.now() });
    _onSetUploadStatus("Invite created (mock); share link manually.");
    _onSetFetchStatus("Invite created", "success");
    return { ok: true };
  } catch (err) {
    console.warn(err);
    _onSetUploadStatus(err.message || "Invite failed", "error");
    _onSetFetchStatus("Invite failed", "error");
    return { error: err.message };
  }
}

export async function acceptInviteToken(token, apiBase) {
  const session = getSession();
  if (!token || !apiBase || !session?.userId) {
    _onSetUploadStatus("Need invite token, API base, and login to accept.", "error");
    return;
  }
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, "")}/invites/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(session) },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Invite accept failed");
    saveCircleId(data.circleId);
    _onSetCircleLabel(data.circleId);
    _onSetUploadStatus("Invite accepted; synced circle.");
    if (_onRenderAll) _onRenderAll();
    _onSetFetchStatus("Invite accepted", "success");
  } catch (err) {
    console.warn(err);
    _onSetUploadStatus(err.message || "Invite accept failed", "error");
    _onSetFetchStatus("Invite accept failed", "error");
  }
}

export async function saveMockUpload({ blob, state }) {
  if (!blob) return { error: "No blob" };
  await sleep(800 + Math.random() * 600);
  const entry = {
    title: `${state.friends[state.hostIndex] || "Host"} recap`,
    by: state.friends[state.hostIndex] || "Unknown",
    size: blob.size,
    status: "complete",
    when: Date.now(),
  };
  state.mockUploads = [entry, ...(state.mockUploads || [])].slice(0, 12);
  persist();
  return { ok: true };
}
