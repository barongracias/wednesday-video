(() => {
  const STORAGE_KEY = "wednesdays-state-v1";
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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

  let flags = [];
  let uploadQueue = [];
  let state = hydrateState();
  let countdownTimer = null;

  function hydrateState() {
    const defaults = {
      friends: ["Alex", "Bri", "Casey", "Dev", "Em"],
      hostIndex: 0,
      nextSwitch: nextWednesday(Date.now()),
      history: [],
      mockUploads: [],
      flags: [],
      uploadQueue: [],
    };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      flags = saved?.flags || [];
      uploadQueue = saved?.uploadQueue || [];
      return { ...defaults, ...saved };
    } catch (err) {
      console.warn("Unable to read saved state", err);
      flags = [];
      uploadQueue = [];
      return { ...defaults };
    }
  }

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...state,
          flags,
          uploadQueue: uploadQueue.filter((u) => u.status !== "uploading"), // don't persist active
        })
      );
    } catch (err) {
      console.warn("Unable to save state", err);
    }
  }

  function nextWednesday(afterTs) {
    const d = new Date(afterTs);
    const day = d.getDay(); // 0 is Sun, 3 is Wed
    d.setHours(0, 0, 0, 0);
    const delta = (3 - day + 7) % 7 || 7;
    d.setDate(d.getDate() + delta);
    return d.getTime();
  }

  function ensureRotation() {
    if (!state.friends.length) return;
    if (!state.nextSwitch) state.nextSwitch = nextWednesday(Date.now());
    const now = Date.now();
    while (now >= state.nextSwitch) {
      rotateHost("auto", state.nextSwitch);
    }
  }

  function rotateHost(trigger = "manual", pivotTs = Date.now()) {
    if (!state.friends.length) return;
    const prevHost = state.friends[state.hostIndex] || "Host";
    state.hostIndex = (state.hostIndex + 1) % state.friends.length;
    state.history = state.history || [];
    state.history.unshift({
      name: prevHost,
      when: pivotTs,
      trigger,
    });
    state.history = state.history.slice(0, 30);
    state.nextSwitch =
      trigger === "manual"
        ? nextWednesday(pivotTs)
        : (state.nextSwitch || nextWednesday(pivotTs)) + WEEK_MS;
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const val = bytes / 1024 ** i;
    return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function formatCountdown(targetTs) {
    const now = Date.now();
    const diff = Math.max(targetTs - now, 0);
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff / (60 * 60 * 1000)) % 24);
    const mins = Math.floor((diff / (60 * 1000)) % 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  function renderHost() {
    if (!state.friends.length) {
      el.currentHost.textContent = "Add friends to start";
      el.nextSwitch.textContent = "";
      el.countdown.textContent = "—";
      el.countdown.classList.add("neutral");
      return;
    }
    el.currentHost.textContent = state.friends[state.hostIndex] || "Someone new";
    if (state.nextSwitch) {
      el.countdown.textContent = `Next handoff in ${formatCountdown(
        state.nextSwitch
      )}`;
      el.countdown.classList.remove("neutral");
      el.nextSwitch.textContent = `Handoff: ${formatDate(state.nextSwitch)}`;
    }
  }

  function renderFriends() {
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
      li.innerHTML = `<strong>${entry.name}</strong> — ${formatDate(
        entry.when
      )} <span class="muted tiny">(${entry.trigger})</span>`;
      el.historyList.appendChild(li);
    });
  }

  function renderMockUploads() {
    el.mockUploadList.innerHTML = "";
    // lastRecordingBlob is declared later in the IIFE; guard with typeof check
    const hasBlob = typeof lastRecordingBlob !== "undefined" && lastRecordingBlob !== null;
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
      li.innerHTML = `<strong>${item.title}</strong> — ${formatBytes(
        item.size
      )} <span class="muted tiny">(${item.by}, ${item.status}, ${formatDate(
        item.when
      )})</span>`;
      el.mockUploadList.appendChild(li);
    });
    el.mockUpload.disabled = !hasBlob;
  }

  function renderUploadAttempts() {
    if (!el.uploadAttempts) return;
    el.uploadAttempts.innerHTML = "";
    if (!uploadAttempts.length) {
      const li = document.createElement("li");
      li.className = "muted tiny";
      li.textContent = "No uploads yet. Request a signed upload to see progress here.";
      el.uploadAttempts.appendChild(li);
      return;
    }
    uploadAttempts.slice(0, 8).forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${item.status}</strong> — ${formatBytes(
        item.size
      )} <span class="muted tiny">(${formatDate(item.when)}${item.mock ? ", mock" : ""}${
        item.queue ? ", queued" : ""
      })</span>`;
      el.uploadAttempts.appendChild(li);
    });
  }

  function renderFlags() {
    if (!el.flagList) return;
    el.flagList.innerHTML = "";
    const allFlags = [...serverFlags, ...flags].slice(0, 20);
    if (!allFlags.length) {
      const li = document.createElement("li");
      li.className = "muted tiny";
      li.textContent = "No reports yet.";
      el.flagList.appendChild(li);
      return;
    }
    allFlags.slice(0, 20).forEach((f) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${f.reason}</strong> — ${formatDate(
        f.when
      )} <span class="muted tiny">${f.note || ""}</span>`;
      el.flagList.appendChild(li);
    });
  }

  function renderQueue() {
    if (!el.uploadQueueList) return;
    el.uploadQueueList.innerHTML = "";
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
      const pct =
        item.status === "uploading" && item.progress
          ? ` — ${Math.round(item.progress)}%`
          : "";
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
        li.innerHTML = `<span class="badge inline">server</span> ${formatBytes(
          u.size
        )} <span class="muted tiny">${u.contentType || ""}</span>`;
        el.uploadQueueList.appendChild(li);
      });
    }
    if (el.clearCompleted) el.clearCompleted.disabled = !hasCompleted;
    // prune completed beyond recent 5
    const maxKeep = 5;
    const completed = uploadQueue.filter((u) => u.status === "done" || u.status === "failed");
    if (completed.length > maxKeep) {
      const keep = uploadQueue.filter((u) => u.status !== "done" && u.status !== "failed");
      keep.push(...completed.slice(0, maxKeep));
      uploadQueue = keep;
    }
  }

  function getSession() {
    const userId = localStorage.getItem(userIdKey) || "";
    const token = localStorage.getItem(authTokenKey) || "";
    const email = localStorage.getItem(authEmailKey) || "";
    return userId ? { userId, token, email } : null;
  }

  function authHeaders(session) {
    const headers = {};
    if (session?.userId) headers["x-user-id"] = session.userId;
    if (session?.token) headers.Authorization = `Bearer ${session.token}`;
    return headers;
  }

  function getCircleId() {
    return localStorage.getItem(circleIdKey) || "";
  }

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
    // If token present in URL, prefill for convenience.
    const urlToken = new URLSearchParams(window.location.search).get("token");
    if (urlToken && el.authToken) {
      el.authToken.value = urlToken;
      localStorage.setItem(authTokenKey, urlToken);
      setAuthMessage("Token detected from URL. Click Verify to log in.");
    }
    const urlBase = new URLSearchParams(window.location.search).get("api");
    if (urlBase && el.apiBase) {
      el.apiBase.value = urlBase;
      localStorage.setItem(apiConfigKey, urlBase);
    }
  }

  function renderAll() {
    ensureRotation();
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

  function shuffleFriends() {
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

  function resetRotation() {
    state.hostIndex = 0;
    state.nextSwitch = nextWednesday(Date.now());
    state.history = [];
  }

  function loadDemoData() {
    const now = Date.now();
    state.friends = ["Amira", "Diego", "Kavi", "Lena", "Morgan"];
    state.hostIndex = 1;
    state.nextSwitch = nextWednesday(now);
    state.history = [
      { name: "Kavi", when: now - WEEK_MS, trigger: "demo" },
      { name: "Amira", when: now - WEEK_MS * 2, trigger: "demo" },
    ];
    state.mockUploads = [
      {
        title: "Kavi recap",
        by: "Kavi",
        size: 420 * 1024,
        status: "complete",
        when: now - 20 * 60 * 1000,
      },
    ];
    lastRecordingBlob = null;
    if (el.mockUpload) el.mockUpload.disabled = true;
    renderAll();
    setDemoStatus("Demo data loaded");
    showSupportMessage("Demo circle loaded. Rotate or record against the sample set.");
  }

  function simulateHandoff() {
    if (!state.friends.length) {
      showSupportMessage("Load the demo circle or add friends before simulating.");
      return;
    }
    rotateHost("demo", Date.now());
    renderAll();
    setDemoStatus("Host advanced");
  }

  async function createMockRecording() {
    if (typeof MediaRecorder === "undefined") {
      showSupportMessage("MediaRecorder is not supported here; mock recording unavailable.");
      return;
    }
    const canvas = document.createElement("canvas");
    if (!canvas.captureStream) {
      showSupportMessage("Canvas captureStream is unavailable; try a newer browser.");
      return;
    }
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    const stream = canvas.captureStream(20);
    const mimeType =
      MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") &&
      "video/webm;codecs=vp9,opus";
    const mockRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const mockChunks = [];
    mockRecorder.ondataavailable = (evt) => {
      if (evt.data?.size) mockChunks.push(evt.data);
    };
    mockRecorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(mockChunks, { type: mockRecorder.mimeType || "video/webm" });
      useRecordedBlob(blob, "mock");
    };

    let frame = 0;
    const colors = ["#7fffd4", "#7ab9ff", "#ff6b81"];
    const paint = () => {
      ctx.fillStyle = colors[frame % colors.length];
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#041016";
      ctx.font = "28px Space Grotesk, 'SF Pro Display', sans-serif";
      ctx.fillText("Wednesday's (mock)", 30, 70);
      ctx.fillText(`Frame ${frame}`, 30, 120);
      ctx.fillText(new Date().toLocaleTimeString(), 30, 170);
      frame += 1;
    };
    const interval = setInterval(paint, 80);
    mockRecorder.start();
    updateRecordingUI("Processing");
    setDemoStatus("Generating mock video");
    showSupportMessage("Generating a mock clip without using your camera.");
    setTimeout(() => {
      clearInterval(interval);
      if (mockRecorder.state === "recording") mockRecorder.stop();
    }, 2200);
  }

  function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  async function saveMockUpload() {
    if (!lastRecordingBlob) {
      showSupportMessage("Record or generate a mock clip before uploading.");
      return;
    }
    setDemoStatus("Uploading (mock)");
    el.mockUpload.disabled = true;
    await sleep(800 + Math.random() * 600);
    const entry = {
      title: `${state.friends[state.hostIndex] || "Host"} recap`,
      by: state.friends[state.hostIndex] || "Unknown",
      size: lastRecordingBlob.size,
      status: "complete",
      when: Date.now(),
    };
    state.mockUploads = [entry, ...(state.mockUploads || [])].slice(0, 12);
    renderMockUploads();
    persist();
    showSupportMessage("Mock upload saved locally. Nothing leaves this device.");
    setDemoStatus("Mock upload saved");
  }

  async function pingBackend() {
    const base = el.apiBase.value.trim();
    if (!base) {
      setUploadStatus("Enter an API base URL first.", "error");
      return;
    }
    try {
      setBackendStatus("Pinging...");
      const res = await fetch(`${base.replace(/\/$/, "")}/health`).then((r) => r.json());
      setBackendStatus("Online");
      setUploadStatus(`Backend ok (${res.env || "unknown env"})`);
    } catch (err) {
      console.warn(err);
      setBackendStatus("Offline");
      setUploadStatus("Backend unreachable. Is it running?", "error");
    }
  }

  async function requestSignedUpload(fromQueueItem) {
    const base = el.apiBase.value.trim();
    if (!base) {
      setUploadStatus("Enter an API base URL first.", "error");
      return;
    }
    if (!lastRecordingBlob) {
      setUploadStatus("Record or load a file first.", "error");
      return;
    }
    const valid = await validateBlob(lastRecordingBlob);
    if (!valid) {
      el.retryUpload.disabled = false;
      return;
    }
    const filename =
      el.downloadLink?.download ||
      `${state.friends[state.hostIndex] || "wednesday"}-${Date.now()}.webm`;
    const payload = {
      circleId: getCircleId() || "demo-circle",
      filename,
      contentType: lastRecordingBlob.type || "video/webm",
      size: lastRecordingBlob.size,
      duration: 0,
    };
    const session = getSession();
    if (!session?.userId) {
      setUploadStatus("Log in first (mock magic link).", "error");
      return;
    }
    el.retryUpload.disabled = true;
    setProgress(0);
    try {
      setBackendStatus("Signing...");
      setUploadStatus("Requesting signed URL…");
      const res = await fetch(`${base.replace(/\/$/, "")}/uploads/sign`, {
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
      setBackendStatus("Signed");
      setUploadStatus(
        `Signed upload ready ${data.mock ? "(mock)" : ""}. Upload URL host: ${
          new URL(data.uploadUrl).host
        }`
      );
      lastUploadInfo = { data, payload };
      if (data.mock) {
        setUploadStatus("Using mock signed URL; no real upload performed.");
        setProgress(100);
        if (fromQueueItem) {
          fromQueueItem.status = "done";
          fromQueueItem.progress = 100;
        }
        uploadAttempts.unshift({
          status: "mock signed",
          size: lastRecordingBlob.size,
          when: Date.now(),
          mock: true,
          queue: Boolean(fromQueueItem),
        });
        renderUploadAttempts();
        renderQueue();
        el.retryUpload.disabled = false;
        return;
      }
      if (data.uploadUrl.includes("mock")) {
        setUploadStatus("Using mock signed URL; no real upload performed.");
        setProgress(100);
        if (fromQueueItem) {
          fromQueueItem.status = "done";
          fromQueueItem.progress = 100;
        }
        uploadAttempts.unshift({
          status: "mock signed",
          size: lastRecordingBlob.size,
          when: Date.now(),
          mock: true,
          queue: Boolean(fromQueueItem),
        });
        renderUploadAttempts();
        renderQueue();
        el.retryUpload.disabled = false;
        return;
      }
      await uploadWithProgress(data.uploadUrl, lastRecordingBlob, payload.contentType, fromQueueItem);
      setUploadStatus("Uploaded to signed URL (verify in bucket).");
      setProgress(100);
      uploadAttempts.unshift({
        status: "uploaded",
        size: lastRecordingBlob.size,
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
        await fetch(`${base.replace(/\/$/, "")}/uploads/commit`, {
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
      renderUploadAttempts();
      renderQueue();
      el.retryUpload.disabled = false;
    } catch (err) {
      console.warn(err);
      setBackendStatus("Offline");
      setUploadStatus(err.message || "Failed to sign upload", "error");
      el.retryUpload.disabled = false;
      uploadAttempts.unshift({
        status: "failed",
        size: lastRecordingBlob?.size || 0,
        when: Date.now(),
        mock: false,
        queue: Boolean(fromQueueItem),
      });
      renderUploadAttempts();
      renderQueue();
      setProgress(0);
      if (fromQueueItem) fromQueueItem.status = "failed";
    }
  }

  async function requestMagicLink() {
    const base = el.apiBase.value.trim();
    const email = el.authEmail.value.trim();
    if (!base) return setAuthMessage("Enter API base first.", "error");
    if (!email) return setAuthMessage("Enter email.", "error");
    try {
      setAuthStatus("Sending…");
      const res = await fetch(`${base.replace(/\/$/, "")}/auth/request-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to request link");
      // In dev we get token back; save it for convenience.
      if (data.token) {
        el.authToken.value = data.token;
        localStorage.setItem(authTokenKey, data.token);
      }
      localStorage.setItem(authEmailKey, email);
      setAuthStatus("Link sent (mock)");
      setAuthMessage("Token returned for dev; paste above or simulate email flow.");
    } catch (err) {
      console.warn(err);
      setAuthStatus("Logged out");
      setAuthMessage(err.message || "Request failed", "error");
    }
  }

  async function verifyMagicLink() {
    const base = el.apiBase.value.trim();
    const token = el.authToken.value.trim();
    if (!base) return setAuthMessage("Enter API base first.", "error");
    if (!token) return setAuthMessage("Paste token from email.", "error");
    try {
      setAuthStatus("Verifying…");
      const res = await fetch(`${base.replace(/\/$/, "")}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verify failed");
      localStorage.setItem(userIdKey, data.userId);
      localStorage.setItem(authTokenKey, token);
      setAuthStatus(`Logged in as ${el.authEmail.value || data.userId}`);
      setAuthMessage("Logged in. You can now request signed uploads and circle changes.");
      setUploadStatus("Authenticated. Ready for signed uploads.");
    } catch (err) {
      console.warn(err);
      setAuthStatus("Logged out");
      setAuthMessage(err.message || "Verify failed", "error");
    }
  }

  function logout() {
    localStorage.removeItem(userIdKey);
    localStorage.removeItem(authTokenKey);
    localStorage.removeItem(circleIdKey);
    setAuthStatus("Logged out");
    setAuthMessage("Logged out locally.");
    setUploadStatus("Need to log in for uploads.", "error");
    setCircleLabel("none");
  }

  function getVideoMeta(blob) {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const duration = video.duration || 0;
        URL.revokeObjectURL(video.src);
        resolve({ duration });
      };
      video.onerror = () => resolve({ duration: 0 });
      video.src = URL.createObjectURL(blob);
    });
  }

  async function validateBlob(blob) {
    if (!blob) {
      setUploadStatus("No video to upload. Record or pick a file.", "error");
      return false;
    }
    if (blob.size > MAX_SIZE_BYTES) {
      setUploadStatus(
        `File too large (${formatBytes(blob.size)}). Max allowed is ${formatBytes(MAX_SIZE_BYTES)}.`,
        "error"
      );
      return false;
    }
    const durationCap = clamp(
      Number(el.maxDurationInput?.value) || MAX_DURATION_SEC,
      30,
      300
    );
    const { duration } = await getVideoMeta(blob);
    if (duration && duration > durationCap) {
      setUploadStatus(
        `Clip too long (${Math.round(duration)}s). Max allowed is ${durationCap}s.`,
        "error"
      );
      return false;
    }
    return true;
  }

  function enqueueUpload({ blob, source }) {
    uploadQueue.push({
      id: `q_${Date.now()}`,
      blob,
      source,
      status: "pending",
      size: blob.size,
      createdAt: Date.now(),
      progress: 0,
    });
    uploadAttempts.unshift({
      status: `queued (${source})`,
      size: blob.size,
      when: Date.now(),
      mock: source === "mock",
      queue: true,
    });
    renderUploadAttempts();
    processQueue();
  }

  async function processQueue() {
    if (queueState === "paused") return;
    if (queueState === "running") return;
    const next = uploadQueue.find((u) => u.status === "pending");
    if (!next) {
      queueState = "idle";
      el.pauseQueue.disabled = true;
      el.cancelQueue.disabled = true;
      el.resumeQueue.disabled = true;
      return;
    }
    queueState = "running";
    next.status = "uploading";
    currentQueueItem = next;
    el.pauseQueue.disabled = false;
    el.cancelQueue.disabled = false;
    el.resumeQueue.disabled = true;
    lastRecordingBlob = next.blob;
    await requestSignedUpload(next);
    queueState = "idle";
    currentQueueItem = null;
    processQueue();
  }

  function pauseQueue() {
    queueState = "paused";
    el.pauseQueue.disabled = true;
    el.resumeQueue.disabled = false;
    el.cancelQueue.disabled = false;
  }

  function resumeQueue() {
    queueState = "idle";
    el.pauseQueue.disabled = false;
    el.resumeQueue.disabled = true;
    processQueue();
  }

  function cancelQueue() {
    uploadQueue = [];
    currentQueueItem = null;
    if (currentUploadXhr) {
      currentUploadXhr.abort();
      currentUploadXhr = null;
    }
    queueState = "idle";
    el.pauseQueue.disabled = true;
    el.resumeQueue.disabled = true;
    el.cancelQueue.disabled = true;
    setUploadStatus("Queue cleared.");
    renderQueue();
  }

  function clearCompleted() {
    uploadQueue = uploadQueue.filter((u) => u.status !== "done" && u.status !== "failed");
    renderQueue();
    setUploadStatus("Cleared completed uploads.");
    persist();
  }

  function cancelQueueItem(id) {
    const idx = uploadQueue.findIndex((u) => u.id === id);
    if (idx === -1) return;
    if (currentQueueItem && currentQueueItem.id === id && currentUploadXhr) {
      currentUploadXhr.abort();
      currentUploadXhr = null;
    }
    const removed = uploadQueue.splice(idx, 1)[0];
    if (!uploadQueue.length) {
      queueState = "idle";
      el.pauseQueue.disabled = true;
      el.resumeQueue.disabled = true;
      el.cancelQueue.disabled = true;
    }
    uploadAttempts.unshift({
      status: "cancelled",
      size: removed?.size || 0,
      when: Date.now(),
      mock: removed?.source === "mock",
      queue: true,
    });
    renderQueue();
    renderUploadAttempts();
    persist();
    processQueue();
    showToast("Upload cancelled");
  }

  let pendingConsentAction = null;

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

  async function createInvite() {
    const base = el.apiBase?.value?.trim();
    const session = getSession();
    if (!base || !session?.userId) {
      setUploadStatus("Set API base and log in to create invites.", "error");
      return;
    }
    const email = (el.inviteEmail?.value || "").trim();
    if (!email) {
      setUploadStatus("Enter an invite email.", "error");
      return;
    }
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/invites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(session),
        },
        body: JSON.stringify({ circleId: getCircleId() || "demo-circle", email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invite failed");
      invites.unshift({ email, token: data.token, url: data.inviteUrl, when: Date.now() });
      renderInvites();
      setUploadStatus("Invite created (mock); share link manually.");
      setFetchStatus("Invite created", "success");
      if (el.inviteEmail) el.inviteEmail.value = "";
    } catch (err) {
      console.warn(err);
      setUploadStatus(err.message || "Invite failed", "error");
      setFetchStatus("Invite failed", "error");
    }
  }

  async function acceptInviteFromUrl() {
    const token = new URLSearchParams(window.location.search).get("invite");
    if (!token) return;
    const base = el.apiBase?.value?.trim();
    const session = getSession();
    if (!base || !session?.userId) return;
    await acceptInviteToken(token, base, session);
  }

  async function acceptInviteToken(token, base, session) {
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/invites/${token}/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(session),
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invite accept failed");
      localStorage.setItem(circleIdKey, data.circleId);
      setCircleLabel(data.circleId);
      setUploadStatus("Invite accepted; synced circle.");
      renderAll();
      setFetchStatus("Invite accepted", "success");
    } catch (err) {
      console.warn(err);
      setUploadStatus(err.message || "Invite accept failed", "error");
      setFetchStatus("Invite accept failed", "error");
    }
  }

  function renderInvites() {
    if (!el.inviteList) return;
    el.inviteList.innerHTML = "";
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
      text.innerHTML = `<strong>${inv.email}</strong> <span class="muted tiny">${formatDate(
        inv.when
      )}</span>`;
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

  async function uploadWithProgress(url, blob, contentType, queueItem) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      currentUploadXhr = xhr;
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", contentType || "application/octet-stream");
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const percent = (evt.loaded / evt.total) * 100;
          setProgress(percent);
          if (queueItem) {
            queueItem.progress = percent;
            renderQueue();
          }
        }
      };
      xhr.onload = () => {
        currentUploadXhr = null;
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed with status ${xhr.status}`));
      };
      xhr.onerror = () => {
        currentUploadXhr = null;
        reject(new Error("Network error during upload"));
      };
      xhr.onabort = () => {
        currentUploadXhr = null;
        reject(new Error("Upload aborted"));
      };
      xhr.send(blob);
    });
  }

  // Backup/import
  function exportState() {
    const payload = {
      state,
      circleId: getCircleId(),
      savedAt: Date.now(),
      version: "v1",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wednesdays-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setUploadStatus("Backup downloaded locally.");
  }

  function importState() {
    const file = el.importFile?.files?.[0];
    if (!file) {
      setUploadStatus("Pick a backup JSON file to import.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.state) throw new Error("No state found in backup");
        state = { ...state, ...parsed.state };
        if (parsed.circleId) localStorage.setItem(circleIdKey, parsed.circleId);
        renderAll();
        setUploadStatus("Backup imported. Review roster and history.");
      } catch (err) {
        console.warn(err);
        setUploadStatus("Failed to import backup. Check file format.", "error");
      }
    };
    reader.readAsText(file);
  }

  // Notifications and reminders
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

  function notifyHost(trigger = "manual") {
    if (typeof Notification === "undefined") {
      setUploadStatus("Notifications not supported in this browser.", "error");
      return;
    }
    if (Notification.permission !== "granted") {
      setUploadStatus("Enable notifications first.", "error");
      return;
    }
    const host = state.friends[state.hostIndex] || "Someone";
    const body = `It's your turn. Record a 60–90s recap before ${formatDate(
      state.nextSwitch || nextWednesday(Date.now())
    )}.`;
    try {
      new Notification(`Wednesday's: ${host}`, { body });
      uploadAttempts.unshift({
        status: `notified ${host}`,
        size: 0,
        when: Date.now(),
        mock: true,
      });
      renderUploadAttempts();
      renderQueue();
    } catch (err) {
      console.warn(err);
      setUploadStatus("Could not show notification.", "error");
    }
  }

  function downloadIcsFile() {
    const host = state.friends[state.hostIndex] || "Host";
    const start = state.nextSwitch || nextWednesday(Date.now());
    const end = start + 15 * 60 * 1000;
    const uid = `wednesdays-${start}@local`;
    const dt = (ts) => new Date(ts).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Wednesdays//EN",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dt(Date.now())}`,
      `DTSTART:${dt(start)}`,
      `DTEND:${dt(end)}`,
      `SUMMARY:Wednesday's host: ${host}`,
      `DESCRIPTION:It's ${host}'s turn to record a recap.`,
      "BEGIN:VALARM",
      "TRIGGER:-PT15M",
      "ACTION:DISPLAY",
      `DESCRIPTION:Reminder: ${host} is up.`,
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wednesdays-${host}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    setUploadStatus("Calendar reminder downloaded.");
  }

  function flagContent() {
    const reason = prompt("Describe the issue (e.g., inappropriate, consent, other):");
    if (!reason) return;
    const note = prompt("Any extra context? (optional)") || "";
    flags.unshift({ reason, note, when: Date.now() });
    renderFlags();
    setUploadStatus("Flag saved locally. Add server moderation before wider use.");
    const base = el.apiBase?.value?.trim();
    const session = getSession();
    if (base && session?.userId) {
      fetch(`${base.replace(/\/$/, "")}/flags`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": session.userId,
        },
        body: JSON.stringify({ reason, note, circleId: getCircleId() || "local" }),
      }).catch((err) => console.warn("Flag API failed", err));
    }
  }

  async function syncCircle() {
    const base = el.apiBase.value.trim();
    const session = getSession();
    if (!base) return setUploadStatus("Enter API base first.", "error");
    if (!session?.userId) return setUploadStatus("Log in first.", "error");
    const api = (path) => `${base.replace(/\/$/, "")}${path}`;
    try {
      setBackendStatus("Syncing…");
      // fetch circles
      const circlesRes = await fetch(api("/circles"), {
        headers: authHeaders(session),
      });
      if (!circlesRes.ok) throw new Error("Failed to fetch circles");
      const circles = await circlesRes.json();
      let circle = circles.circles?.[0];
      if (!circle) {
        // create a demo circle
        const createRes = await fetch(api("/circles"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(session),
          },
          body: JSON.stringify({ name: "Wednesday Demo" }),
        });
        circle = (await createRes.json()).circle;
      }
      // add missing members from local state
      const existingNames = new Set((circle.members || []).map((m) => m.name.toLowerCase()));
      for (const name of state.friends) {
        if (existingNames.has(name.toLowerCase())) continue;
        await fetch(api(`/circles/${circle.id}/members`), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(session),
          },
          body: JSON.stringify({ email: `${name.toLowerCase()}@example.com`, name }),
        });
      }
      // refresh circle members
      const refreshed = await fetch(api("/circles"), {
        headers: authHeaders(session),
      }).then((r) => r.json());
      circle = refreshed.circles?.find((c) => c.id === circle.id) || circle;
      // get assignments
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
        localStorage.setItem(circleIdKey, circle.id);
        setCircleLabel(circle.id);
        renderAll();
        setBackendStatus("Synced");
        setUploadStatus("Backend circle synced; uploads will use this circle.");
      } else {
        throw new Error(assigns.error || "Failed to sync assignments");
      }
    } catch (err) {
      console.warn(err);
      setBackendStatus("Offline");
      setUploadStatus(err.message || "Failed to sync circle", "error");
    }
  }

  // Recording logic
  let recorder = null;
  let stream = null;
  let chunks = [];
  let lastUrl = null;
  let lastRecordingBlob = null;
  let lastUploadInfo = null;
  let recordDeadline = null;
  let recordTicker = null;
  let uploadAttempts = [];
  let lastNotificationPermission = typeof Notification !== "undefined" ? Notification.permission : "denied";
  let queueState = "idle"; // idle, running, paused
  let currentQueueItem = null;
  let currentUploadXhr = null;
  let consentGranted = false;
  let toastTimer = null;
  let theme =
    localStorage.getItem("wednesdays-theme") ||
    (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark");
  let serverUploads = [];
  let serverFlags = [];
  let invites = [];
  let lastFetchStatus = "No fetches yet";
  const apiConfigKey = "wednesdays-api-base";
  const userIdKey = "wednesdays-user-id";
  const authTokenKey = "wednesdays-auth-token";
  const authEmailKey = "wednesdays-auth-email";
  const circleIdKey = "wednesdays-circle-id";
  const MAX_SIZE_BYTES = 150 * 1024 * 1024; // 150MB cap
  const MAX_DURATION_SEC = 120; // 2 minutes
  const MAX_BITRATE_KBPS = 4000;

  function getApiBase() {
    return (localStorage.getItem(apiConfigKey) || "").trim();
  }

  function clamp(n, min, max) {
    return Math.min(Math.max(n, min), max);
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
    lastFetchStatus = text;
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

  function updateEstimate(opts = {}) {
    const bitrate = clamp(Number(el.bitrateInput?.value) || 1200, 200, MAX_BITRATE_KBPS);
    const seconds = clamp(Number(el.maxDurationInput?.value) || MAX_DURATION_SEC, 30, 300);
    const bytes = (bitrate * 1000 * seconds) / 8 + 128000 * seconds / 8; // video + audio rough
    if (el.estSize) el.estSize.textContent = `Est. size: ${formatBytes(bytes)}`;
    if (!opts.silent) showToast("Bitrate/duration updated; estimate refreshed.");
  }

  function showToast(text) {
    if (!el.toast) return;
    el.toast.textContent = text;
    el.toast.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.classList.add("hidden");
    }, 2200);
  }

  function applyTheme(next, opts = {}) {
    theme = next;
    if (theme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
    localStorage.setItem("wednesdays-theme", theme);
    if (!opts.silent) showToast(`Theme: ${theme}`);
  }

  function toggleTheme() {
    applyTheme(theme === "light" ? "dark" : "light");
  }

  function setBadge(elBadge, label, ok) {
    if (!elBadge) return;
    elBadge.textContent = label;
    elBadge.style.borderColor = ok ? "rgba(127,255,212,0.6)" : "rgba(255,107,129,0.6)";
    elBadge.style.color = ok ? "var(--accent)" : "var(--danger)";
  }

  function runChecks(opts = {}) {
    const mediaOk = typeof MediaRecorder !== "undefined" && navigator.mediaDevices;
    const storageOk = (() => {
      try {
        localStorage.setItem("__w_test", "1");
        localStorage.removeItem("__w_test");
        return true;
      } catch {
        return false;
      }
    })();
    const notifyOk = typeof Notification !== "undefined" && Notification.permission === "granted";
    setBadge(el.statusMedia, `MediaRecorder: ${mediaOk ? "ok" : "no"}`, mediaOk);
    setBadge(el.statusStorage, `LocalStorage: ${storageOk ? "ok" : "no"}`, storageOk);
    setBadge(el.statusNotify, `Notifications: ${Notification?.permission || "n/a"}`, notifyOk);
    if (!mediaOk && el.fallbackBanner) el.fallbackBanner.classList.remove("hidden");
    if (!opts.silent) showToast("Checks updated");
  }

  async function fetchUploads() {
    const base = el.apiBase?.value?.trim();
    const session = getSession();
    if (!base || !session?.userId) {
      setUploadStatus("Set API base and log in to fetch uploads.", "error");
      setFetchStatus("Fetch uploads failed (auth/base)", "error");
      return;
    }
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/uploads?circleId=${getCircleId() || ""}`, {
        headers: authHeaders(session),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fetch failed");
      serverUploads = (data.uploads || []).map((u) => ({ ...u, status: "server" }));
      renderQueue();
      setUploadStatus(`Fetched ${serverUploads.length} uploads from server.`);
      setFetchStatus(`Uploads fetched (${serverUploads.length})`, "success");
    } catch (err) {
      console.warn(err);
      setUploadStatus(err.message || "Fetch uploads failed", "error");
      setFetchStatus("Fetch uploads failed", "error");
    }
  }

  async function fetchFlags() {
    const base = el.apiBase?.value?.trim();
    const session = getSession();
    if (!base || !session?.userId) {
      setUploadStatus("Set API base and log in to fetch flags.", "error");
      setFetchStatus("Fetch flags failed (auth/base)", "error");
      return;
    }
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/flags?circleId=${getCircleId() || ""}`, {
        headers: authHeaders(session),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fetch failed");
      serverFlags = data.flags || [];
      renderFlags();
      setUploadStatus(`Fetched ${serverFlags.length} flags from server.`);
      setFetchStatus(`Flags fetched (${serverFlags.length})`, "success");
    } catch (err) {
      console.warn(err);
      setUploadStatus(err.message || "Fetch flags failed", "error");
      setFetchStatus("Fetch flags failed", "error");
    }
  }

  function setRecordingTimerText(text) {
    if (el.recordingTimer) el.recordingTimer.textContent = text;
  }

  function updateRecordTimer(elapsedMs = 0) {
    if (!el.recordingTimer) return;
    const totalMs = clamp(
      Number(el.maxDurationInput?.value) || MAX_DURATION_SEC,
      30,
      300
    ) * 1000;
    const leftMs = Math.max(totalMs - elapsedMs, 0);
    const fmt = (ms) => {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const ss = `${s % 60}`.padStart(2, "0");
      return `${m}:${ss}`;
    };
    el.recordingTimer.textContent = `${fmt(elapsedMs)} / ${fmt(totalMs)} max`;
  }

  function updateRecordingUI(status = "Idle") {
    el.recordingStatus.textContent = status;
    el.recordingBanner.classList.toggle("hidden", status !== "Recording");
    el.stopRecording.disabled = status !== "Recording";
    el.startRecording.disabled = status === "Recording";
    if (status !== "Recording") {
      recordDeadline = null;
      if (recordTicker) clearInterval(recordTicker);
      updateRecordTimer(0);
    }
    setRecordingTimerText(el.recordingTimer?.textContent || "00:00 / 02:00 max");
  }

  function useRecordedBlob(blob, source = "capture") {
    lastRecordingBlob = blob;
    lastUploadInfo = null;
    enqueueUpload({ blob, source });
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    const url = URL.createObjectURL(blob);
    lastUrl = url;
    el.preview.srcObject = null;
    el.preview.src = url;
    el.preview.muted = false;
    el.preview.controls = true;
    el.downloadLink.href = url;
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
        await navigator.share({
          title: "Wednesday's recap",
          text: "Here's my Wednesday's video.",
          files: [file],
        });
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

  async function startRecording() {
    if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") {
      showSupportMessage(
        "In-browser recording is not supported here. Use your camera app and upload/share manually."
      );
      if (el.fallbackBanner) el.fallbackBanner.classList.remove("hidden");
      if (el.statusMedia) el.statusMedia.textContent = "MediaRecorder: unsupported";
      return;
    }
    if (el.statusMedia) el.statusMedia.textContent = "MediaRecorder: ok";
    if (el.fallbackBanner) el.fallbackBanner.classList.add("hidden");
    if (!consentGranted) {
      const ok = showConsent("record");
      if (!ok) return;
    }
    try {
      lastRecordingBlob = null;
      el.mockUpload.disabled = true;
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
      el.preview.srcObject = stream;
      el.preview.muted = true;
      await el.preview.play();
      chunks = [];
      const maxDuration = clamp(Number(el.maxDurationInput?.value) || MAX_DURATION_SEC, 30, 300);
      const targetDurationMs = maxDuration * 1000;
      const bitrate = clamp(Number(el.bitrateInput?.value) || 1200, 200, MAX_BITRATE_KBPS);
      const mimeType =
        MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") &&
        "video/webm;codecs=vp9,opus";
      recorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined,
        videoBitsPerSecond: bitrate * 1000,
        audioBitsPerSecond: 128000,
      });
      recorder.ondataavailable = (evt) => {
        if (evt.data?.size) chunks.push(evt.data);
      };
      recorder.onstop = handleRecordingStop;
      recorder.start();
      updateRecordingUI("Recording");
      setDemoStatus("Recording live");
      showSupportMessage("Recording; keep the tab open. Video stays on your device.");
      recordDeadline = Date.now() + targetDurationMs;
      const tick = () => {
        if (!recordDeadline) return;
        const elapsed = targetDurationMs - Math.max(recordDeadline - Date.now(), 0);
        updateRecordTimer(elapsed);
        if (Date.now() >= recordDeadline) {
          stopRecording();
        }
      };
      recordTicker = setInterval(tick, 500);
    } catch (err) {
      showSupportMessage("Camera/mic access failed. Check permissions and try again.");
      console.error(err);
    }
  }

  function stopRecording() {
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    updateRecordingUI("Processing");
    setDemoStatus("Processing");
  }

  function useExistingUpload() {
    const file = el.fileInput?.files?.[0];
    if (!file) {
      showSupportMessage("Pick a video file first.");
      return;
    }
    validateBlob(file).then((ok) => {
      if (!ok) return;
      useRecordedBlob(file, "upload");
      showSupportMessage("Loaded local file. You can upload/share/download now.");
    });
  }

  function handleRecordingStop() {
    const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
    useRecordedBlob(blob, "capture");
  }

  // Event listeners
  el.friendForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = el.friendInput.value.trim();
    if (!name) return;
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

  el.shuffleOrder.addEventListener("click", () => {
    shuffleFriends();
    renderAll();
  });

  el.advanceNow.addEventListener("click", () => {
    if (!state.friends.length) return;
    rotateHost("manual", Date.now());
    renderAll();
  });

  el.resetRotation.addEventListener("click", () => {
    resetRotation();
    renderAll();
  });

  el.startRecording.addEventListener("click", startRecording);
  el.stopRecording.addEventListener("click", stopRecording);
  el.loadDemo.addEventListener("click", loadDemoData);
  el.simulateHandoff.addEventListener("click", simulateHandoff);
  el.mockRecording.addEventListener("click", createMockRecording);
  el.mockUpload.addEventListener("click", saveMockUpload);
  el.useUpload.addEventListener("click", useExistingUpload);
  el.saveApiBase.addEventListener("click", () => {
    const val = el.apiBase.value.trim();
    localStorage.setItem(apiConfigKey, val);
    setUploadStatus(`Saved API base: ${val || "not set"}`);
  });
  el.pingApi.addEventListener("click", pingBackend);
  el.signUpload.addEventListener("click", () => {
    const pending = uploadQueue.find((u) => u.status === "pending");
    if (pending) {
      processQueue();
    } else {
      requestSignedUpload();
    }
  });
  el.retryUpload?.addEventListener("click", () => processQueue());
  el.syncCircle?.addEventListener("click", syncCircle);
  el.pauseQueue?.addEventListener("click", pauseQueue);
  el.resumeQueue?.addEventListener("click", resumeQueue);
  el.cancelQueue?.addEventListener("click", cancelQueue);
  el.clearCompleted?.addEventListener("click", clearCompleted);

  // Auth listeners
  el.authRequest?.addEventListener("click", requestMagicLink);
  el.authVerify?.addEventListener("click", verifyMagicLink);
  el.authLogout?.addEventListener("click", logout);

  // Backup/import listeners
  el.exportState?.addEventListener("click", exportState);
  el.importState?.addEventListener("click", importState);
  el.notifyPermission?.addEventListener("click", requestNotificationPermission);
  el.notifyHost?.addEventListener("click", () => notifyHost("manual"));
  el.downloadIcs?.addEventListener("click", downloadIcsFile);
  el.flagContent?.addEventListener("click", flagContent);
  el.bitrateInput?.addEventListener("input", updateEstimate);
  el.maxDurationInput?.addEventListener("input", updateEstimate);
  el.consentAccept?.addEventListener("click", () => {
    consentGranted = true;
    const action = pendingConsentAction;
    pendingConsentAction = null;
    hideConsentModal();
    showToast("Consent acknowledged. You can record now.");
    if (action === "record") {
      startRecording();
    }
  });
  el.consentCancel?.addEventListener("click", () => {
    consentGranted = false;
    pendingConsentAction = null;
    hideConsentModal();
    showToast("Recording cancelled.");
  });
  el.themeToggle?.addEventListener("click", toggleTheme);
  el.fabRecord?.addEventListener("click", () =>
    document.getElementById("record-card")?.scrollIntoView({ behavior: "smooth" })
  );
  el.fabUpload?.addEventListener("click", () =>
    document.getElementById("backend-card")?.scrollIntoView({ behavior: "smooth" })
  );
  el.runChecks?.addEventListener("click", runChecks);
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
  el.fetchUploads?.addEventListener("click", fetchUploads);
  el.fetchFlags?.addEventListener("click", fetchFlags);
  el.createInvite?.addEventListener("click", createInvite);
  el.inviteSubmit?.addEventListener("click", createInvite);
  el.inviteAccept?.addEventListener("click", async () => {
    const token = (el.inviteToken?.value || "").trim();
    const base = el.apiBase?.value?.trim();
    const session = getSession();
    if (!token || !base || !session?.userId) {
      setUploadStatus("Need invite token, API base, and login to accept.", "error");
      return;
    }
    await acceptInviteToken(token, base, session);
  });

  function startCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(renderAll, 1000 * 30);
  }

  ensureRotation();
  renderAll();
  setDemoStatus("Idle");
  if (el.apiBase) {
    el.apiBase.value = getApiBase();
  }
  applyTheme(theme, { silent: true });
  setBackendStatus("Offline");
  hydrateSessionUI();
  setProgress(0);
  updateEstimate({ silent: true });
  runChecks({ silent: true });
  acceptInviteFromUrl();
  if (el.pauseQueue) {
    el.pauseQueue.disabled = true;
    el.resumeQueue.disabled = true;
    el.cancelQueue.disabled = true;
    el.clearCompleted.disabled = true;
  }
  startCountdown();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("SW registration failed", err);
    });
  }
  requestNotificationPermission({ silent: true });
})();
