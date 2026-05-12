// js/camera.js — MediaRecorder setup, recording lifecycle

import { MAX_DURATION_SEC, MAX_BITRATE_KBPS } from "./state.js";
import { clamp } from "./utils.js";

// Module-level recording state
let recorder = null;
let stream = null;
let chunks = [];
let recordDeadline = null;
let recordTicker = null;

/** Returns the currently cached stream (if any). */
export function getStream() { return stream; }

/**
 * Start a live recording session.
 * @param {object} opts
 * @param {HTMLVideoElement} opts.previewEl
 * @param {HTMLInputElement} opts.bitrateInput
 * @param {HTMLInputElement} opts.maxDurationInput
 * @param {function(Blob):void} opts.onStop  - called with the finished blob
 * @param {function(string):void} opts.onStatus - "Recording" | "Processing"
 * @param {function(number):void} opts.onTick - elapsed ms
 */
export async function startRecording({ previewEl, bitrateInput, maxDurationInput, onStop, onStatus, onTick }) {
  if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported on this device.");
  }

  // Reset any previous recording
  chunks = [];

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
    audio: true,
  });

  previewEl.srcObject = stream;
  previewEl.muted = true;
  await previewEl.play();

  const maxDuration = clamp(Number(maxDurationInput?.value) || MAX_DURATION_SEC, 30, 300);
  const targetDurationMs = maxDuration * 1000;
  const bitrate = clamp(Number(bitrateInput?.value) || 1200, 200, MAX_BITRATE_KBPS);

  const mimeType =
    MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") && "video/webm;codecs=vp9,opus";

  recorder = new MediaRecorder(stream, {
    mimeType: mimeType || undefined,
    videoBitsPerSecond: bitrate * 1000,
    audioBitsPerSecond: 128000,
  });

  recorder.ondataavailable = (evt) => {
    if (evt.data?.size) chunks.push(evt.data);
  };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
    onStop(blob);
  };

  recorder.start();
  onStatus("Recording");

  recordDeadline = Date.now() + targetDurationMs;

  const tick = () => {
    if (!recordDeadline) return;
    const elapsed = targetDurationMs - Math.max(recordDeadline - Date.now(), 0);
    onTick(elapsed);
    if (Date.now() >= recordDeadline) {
      stopRecording({ onStatus });
    }
  };
  recordTicker = setInterval(tick, 500);
}

/**
 * Stop the active recording.
 */
export function stopRecording({ onStatus } = {}) {
  if (recordTicker) {
    clearInterval(recordTicker);
    recordTicker = null;
  }
  recordDeadline = null;

  if (recorder && recorder.state === "recording") {
    recorder.stop();
  }
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (onStatus) onStatus("Processing");
}

/**
 * Generates a 2-second mock video using canvas.captureStream + MediaRecorder.
 * @param {function(Blob):void} onDone
 * @param {function(string):void} onStatus
 */
export async function createMockRecording(onDone, onStatus) {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported here; mock recording unavailable.");
  }
  const canvas = document.createElement("canvas");
  if (!canvas.captureStream) {
    throw new Error("Canvas captureStream is unavailable; try a newer browser.");
  }
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");
  const mockStream = canvas.captureStream(20);

  const mimeType =
    MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") && "video/webm;codecs=vp9,opus";
  const mockRecorder = new MediaRecorder(mockStream, mimeType ? { mimeType } : undefined);
  const mockChunks = [];

  mockRecorder.ondataavailable = (evt) => {
    if (evt.data?.size) mockChunks.push(evt.data);
  };
  mockRecorder.onstop = () => {
    mockStream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(mockChunks, { type: mockRecorder.mimeType || "video/webm" });
    onDone(blob);
  };

  let frame = 0;
  const colors = ["#7fffd4", "#7ab9ff", "#ff6b81"];
  const paint = () => {
    ctx.fillStyle = colors[frame % colors.length];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#041016";
    ctx.font = "28px -apple-system, 'SF Pro Display', sans-serif";
    ctx.fillText("Wednesday's (mock)", 30, 70);
    ctx.fillText(`Frame ${frame}`, 30, 120);
    ctx.fillText(new Date().toLocaleTimeString(), 30, 170);
    frame += 1;
  };

  const interval = setInterval(paint, 80);
  mockRecorder.start();
  if (onStatus) onStatus("Processing");

  setTimeout(() => {
    clearInterval(interval);
    if (mockRecorder.state === "recording") mockRecorder.stop();
  }, 2200);
}

/**
 * Check whether in-browser recording is available.
 */
export function isRecordingSupported() {
  return typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices);
}

/**
 * Extract video duration from a blob via a hidden video element.
 */
export function getVideoMeta(blob) {
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
