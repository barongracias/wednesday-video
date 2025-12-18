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
    backendStatus: document.getElementById("backend-status"),
    uploadStatus: document.getElementById("upload-status"),
    syncCircle: document.getElementById("sync-circle"),
    circleLabel: document.getElementById("circle-label"),
    authEmail: document.getElementById("auth-email"),
    authToken: document.getElementById("auth-token"),
    authRequest: document.getElementById("auth-request"),
    authVerify: document.getElementById("auth-verify"),
    authLogout: document.getElementById("auth-logout"),
    authStatus: document.getElementById("auth-status"),
    authMessage: document.getElementById("auth-message"),
  };

  let state = hydrateState();
  let countdownTimer = null;

  function hydrateState() {
    const defaults = {
      friends: ["Alex", "Bri", "Casey", "Dev", "Em"],
      hostIndex: 0,
      nextSwitch: nextWednesday(Date.now()),
      history: [],
      mockUploads: [],
    };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return { ...defaults, ...saved };
    } catch (err) {
      console.warn("Unable to read saved state", err);
      return { ...defaults };
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    state.hostIndex = (state.hostIndex + 1) % state.friends.length;
    state.history = state.history || [];
    state.history.unshift({
      name: state.friends[state.hostIndex],
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
    if (!state.mockUploads || !state.mockUploads.length) {
      const li = document.createElement("li");
      li.className = "muted tiny";
      li.textContent = "No mock uploads yet. Generate a mock recording, then save it.";
      el.mockUploadList.appendChild(li);
      el.mockUpload.disabled = !lastRecordingBlob;
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
    el.mockUpload.disabled = !lastRecordingBlob;
  }

  function getSession() {
    const userId = localStorage.getItem(userIdKey) || "";
    const token = localStorage.getItem(authTokenKey) || "";
    const email = localStorage.getItem(authEmailKey) || "";
    return userId ? { userId, token, email } : null;
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
  }

  function renderAll() {
    ensureRotation();
    renderHost();
    renderFriends();
    renderHistory();
    renderMockUploads();
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
    el.mockUpload.disabled = true;
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

  async function requestSignedUpload() {
    const base = el.apiBase.value.trim();
    if (!base) {
      setUploadStatus("Enter an API base URL first.", "error");
      return;
    }
    if (!lastRecordingBlob) {
      setUploadStatus("Record or load a file first.", "error");
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
    };
    const session = getSession();
    if (!session?.userId) {
      setUploadStatus("Log in first (mock magic link).", "error");
      return;
    }
    try {
      setBackendStatus("Signing...");
      setUploadStatus("Requesting signed URL…");
      const res = await fetch(`${base.replace(/\/$/, "")}/uploads/sign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": session.userId,
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
        `Signed upload ready (mock). Upload URL host: ${new URL(data.uploadUrl).host}`
      );
      if (data.uploadUrl.includes("mock")) {
        setUploadStatus("Using mock signed URL; no real upload performed.");
        return;
      }
      try {
        await fetch(data.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": payload.contentType },
          body: lastRecordingBlob,
        });
        setUploadStatus("Uploaded to signed URL (verify in bucket).");
      } catch (errUpload) {
        console.warn("Upload failed", errUpload);
        setUploadStatus("Signed, but upload failed (CORS/credentials). Check console.", "error");
      }
    } catch (err) {
      console.warn(err);
      setBackendStatus("Offline");
      setUploadStatus(err.message || "Failed to sign upload", "error");
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
        headers: {
          "x-user-id": session.userId,
        },
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
            "x-user-id": session.userId,
          },
          body: JSON.stringify({ name: "Wednesday Demo" }),
        });
        circle = (await createRes.json()).circle;
        // add members from local state
        for (const name of state.friends) {
          await fetch(api(`/circles/${circle.id}/members`), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": session.userId,
            },
            body: JSON.stringify({ email: `${name.toLowerCase()}@example.com`, name }),
          });
        }
      }
      // get assignments
      const assignRes = await fetch(api(`/circles/${circle.id}/assignments`), {
        headers: { "x-user-id": session.userId },
      });
      const assigns = await assignRes.json();
      if (assignRes.ok) {
        state.friends = circle.members?.map((m) => m.name) || state.friends;
        if (assigns.host?.name) {
          const idx = state.friends.findIndex((n) => n === assigns.host.name);
          state.hostIndex = idx >= 0 ? idx : 0;
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
  const apiConfigKey = "wednesdays-api-base";
  const userIdKey = "wednesdays-user-id";
  const authTokenKey = "wednesdays-auth-token";
  const authEmailKey = "wednesdays-auth-email";
  const circleIdKey = "wednesdays-circle-id";

  function getApiBase() {
    return (localStorage.getItem(apiConfigKey) || "").trim();
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

  function updateRecordingUI(status = "Idle") {
    el.recordingStatus.textContent = status;
    el.recordingBanner.classList.toggle("hidden", status !== "Recording");
    el.stopRecording.disabled = status !== "Recording";
    el.startRecording.disabled = status === "Recording";
  }

  function useRecordedBlob(blob, source = "capture") {
    lastRecordingBlob = blob;
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
      return;
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
      const mimeType =
        MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") &&
        "video/webm;codecs=vp9,opus";
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (evt) => {
        if (evt.data?.size) chunks.push(evt.data);
      };
      recorder.onstop = handleRecordingStop;
      recorder.start();
      updateRecordingUI("Recording");
      setDemoStatus("Recording live");
      showSupportMessage("Recording; keep the tab open. Video stays on your device.");
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
    useRecordedBlob(file, "upload");
    showSupportMessage("Loaded local file. You can upload/share/download now.");
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
  el.signUpload.addEventListener("click", requestSignedUpload);
  el.syncCircle?.addEventListener("click", syncCircle);

  // Auth listeners
  el.authRequest?.addEventListener("click", requestMagicLink);
  el.authVerify?.addEventListener("click", verifyMagicLink);
  el.authLogout?.addEventListener("click", logout);

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
  setBackendStatus("Offline");
  hydrateSessionUI();
  startCountdown();
})();
