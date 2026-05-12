import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { nanoid } from "nanoid";
import nodemailer from "nodemailer";
import { Storage } from "@google-cloud/storage";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 8787;
const GCS_BUCKET = process.env.GCS_BUCKET || "your-bucket";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8000";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, "data", "db.json");
const SQLITE_PATH = process.env.SQLITE_DB || path.join(__dirname, "data", "wednesdays.db");
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 60000);
const RATE_MAX = Number(process.env.RATE_MAX || 120);
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 200_000_000); // 200MB
const MAX_UPLOAD_SECONDS = Number(process.env.MAX_UPLOAD_SECONDS || 180); // 3 minutes
const USE_SQLITE = process.env.USE_SQLITE === "true";

// In-memory demo store. Replace with a real DB before production.
const db = {
  users: {}, // id -> {email}
  circles: {}, // id -> {name, ownerId, members: [{id,email,name}], assignments: [{userId, atTs}], timezone}
  loginTokens: {}, // token -> {userId, expires}
  uploads: [], // {id,circleId,userId,size,contentType,duration,resourceUrl,when}
  flags: [], // {id,circleId,userId,reason,note,when}
  invites: [], // {token,circleId,email,expires}
};

let saveInFlight = false;
let dirty = false;

async function ensureDbDir() {
  await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
}

async function loadDbFromDisk() {
  try {
    const buf = await fs.readFile(DB_FILE, "utf8");
    const parsed = JSON.parse(buf);
    db.users = parsed.users || {};
    db.circles = parsed.circles || {};
    db.loginTokens = parsed.loginTokens || {};
    db.uploads = parsed.uploads || [];
    db.flags = parsed.flags || [];
    db.invites = parsed.invites || [];
    console.log("[db] loaded from disk");
  } catch (err) {
    console.warn("[db] starting fresh (no persisted data yet)", err.message);
  }
}

async function saveDb() {
  if (saveInFlight || !dirty) return;
  saveInFlight = true;
  dirty = false;
  try {
    await ensureDbDir();
    await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8");
    console.log("[db] saved");
  } catch (err) {
    console.warn("[db] failed to save", err);
  } finally {
    saveInFlight = false;
  }
}

function markDirty() {
  dirty = true;
  setTimeout(saveDb, 500);
}

function syncJsonToSqlite() {
  if (!sqliteDb) return;
  const userStmt = sqliteDb.prepare("INSERT OR IGNORE INTO users (id,email) VALUES (?,?)");
  const circleStmt = sqliteDb.prepare(
    "INSERT OR REPLACE INTO circles (id,name,ownerId,timezone) VALUES (?,?,?,?)"
  );
  const memberStmt = sqliteDb.prepare(
    "INSERT OR IGNORE INTO members (circleId,userId,email,name) VALUES (?,?,?,?)"
  );
  const assignStmt = sqliteDb.prepare(
    "INSERT OR IGNORE INTO assignments (circleId,userId,atTs,trigger) VALUES (?,?,?,?)"
  );
  const uploadStmt = sqliteDb.prepare(
    "INSERT OR IGNORE INTO uploads (id,circleId,userId,size,contentType,duration,resourceUrl,createdAt) VALUES (?,?,?,?,?,?,?,?)"
  );
  const flagStmt = sqliteDb.prepare(
    "INSERT OR IGNORE INTO flags (id,circleId,userId,reason,note,createdAt) VALUES (?,?,?,?,?,?)"
  );
  const inviteStmt = sqliteDb.prepare(
    "INSERT OR REPLACE INTO invites (token,circleId,email,expires) VALUES (?,?,?,?)"
  );

  Object.values(db.users).forEach((u) => userStmt.run(u.id, u.email));
  Object.values(db.circles).forEach((c) => {
    circleStmt.run(c.id, c.name, c.ownerId, c.timezone || "UTC");
    (c.members || []).forEach((m) => memberStmt.run(c.id, m.id, m.email, m.name));
    (c.assignments || []).forEach((a) => assignStmt.run(c.id, a.userId, a.atTs, a.trigger));
  });
  (db.uploads || []).forEach((u) =>
    uploadStmt.run(
      u.id,
      u.circleId,
      u.userId,
      u.size || 0,
      u.contentType || "video/webm",
      u.duration || 0,
      u.resourceUrl || "",
      u.when || Date.now()
    )
  );
  (db.flags || []).forEach((f) =>
    flagStmt.run(f.id, f.circleId || "unspecified", f.userId, f.reason, f.note || "", f.when)
  );
  (db.invites || []).forEach((i) => inviteStmt.run(i.token, i.circleId, i.email, i.expires));
  console.log("[sqlite] synced JSON store to sqlite");
}
let storageClient = null;
let serviceAccountEmail = null;
const requestLog = [];
const rateBuckets = new Map();
if (process.env.SERVICE_ACCOUNT_KEY_B64) {
  try {
    const creds = JSON.parse(
      Buffer.from(process.env.SERVICE_ACCOUNT_KEY_B64, "base64").toString("utf8")
    );
    storageClient = new Storage({
      projectId: process.env.GCP_PROJECT_ID || creds.project_id,
      credentials: creds,
    });
    serviceAccountEmail = creds.client_email;
    console.log("[gcs] initialized storage client");
  } catch (err) {
    console.warn("[gcs] failed to init storage client, using mock signing", err);
  }
}

let mailer = null;
if (process.env.SMTP_HOST) {
  try {
    mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    console.log("[email] SMTP transporter configured");
  } catch (err) {
    console.warn("[email] failed to set up SMTP transporter; falling back to console", err);
  }
}

loadDbFromDisk();
setInterval(saveDb, 10000);
let sqliteDb = null;
if (USE_SQLITE) {
  try {
    await fs.mkdir(path.dirname(SQLITE_PATH), { recursive: true });
    sqliteDb = new Database(SQLITE_PATH);
    sqliteDb.exec(
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE);
       CREATE TABLE IF NOT EXISTS circles (id TEXT PRIMARY KEY, name TEXT, ownerId TEXT, timezone TEXT);
       CREATE TABLE IF NOT EXISTS members (circleId TEXT, userId TEXT, email TEXT, name TEXT);
       CREATE TABLE IF NOT EXISTS assignments (circleId TEXT, userId TEXT, atTs INTEGER, trigger TEXT);
       CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, circleId TEXT, userId TEXT, size INTEGER, contentType TEXT, duration INTEGER, resourceUrl TEXT, createdAt INTEGER);
       CREATE TABLE IF NOT EXISTS flags (id TEXT PRIMARY KEY, circleId TEXT, userId TEXT, reason TEXT, note TEXT, createdAt INTEGER);
       CREATE TABLE IF NOT EXISTS invites (token TEXT PRIMARY KEY, circleId TEXT, email TEXT, expires INTEGER);`
    );
    syncJsonToSqlite();
    console.log("[sqlite] ready at", SQLITE_PATH);
  } catch (err) {
    console.warn("[sqlite] init failed, falling back to JSON store", err);
    sqliteDb = null;
  }
}

const requireUser = (req, res, next) => {
  const userId = req.header("x-user-id") || req.query.userId;
  if (!userId || !db.users[userId]) {
    return res.status(401).json({ error: "unauthenticated; provide x-user-id (mock only)" });
  }
  req.userId = userId;
  next();
};

const rateLimit = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;
  const bucket = rateBuckets.get(ip) || [];
  const recent = bucket.filter((t) => t > windowStart);
  recent.push(now);
  rateBuckets.set(ip, recent);
  if (recent.length > RATE_MAX) {
    return res.status(429).json({ error: "rate limit exceeded" });
  }
  next();
};

app.use((req, res, next) => {
  requestLog.push({ path: req.path, method: req.method, at: Date.now() });
  if (requestLog.length > 200) requestLog.shift();
  next();
});

app.get("/health", (req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || "development" });
});

// Mock magic link flow: request link -> returns token (would be emailed), verify -> returns session userId
app.post("/auth/request-link", rateLimit, (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });
  let user = Object.values(db.users).find((u) => u.email === email);
  if (!user) {
    const id = nanoid(10);
    user = { id, email };
    db.users[id] = user;
    markDirty();
  }
  const token = nanoid(24);
  db.loginTokens[token] = { userId: user.id, expires: Date.now() + 15 * 60 * 1000 };
  markDirty();
  sendMagicLink(email, token).catch((err) =>
    console.warn("[email] sendMagicLink failed; continuing", err)
  );
  res.json({
    token,
    message: mailer ? "Link emailed (check inbox)" : "Mock token; would be emailed in production",
  });
});

app.post("/auth/verify", rateLimit, (req, res) => {
  const { token } = req.body || {};
  const entry = db.loginTokens[token];
  if (!entry || entry.expires < Date.now()) {
    return res.status(400).json({ error: "invalid or expired token" });
  }
  res.json({ userId: entry.userId });
});

// Circles
app.get("/circles", rateLimit, requireUser, (req, res) => {
  const userId = req.userId;
  const circles = Object.values(db.circles).filter(
    (c) => c.ownerId === userId || c.members.some((m) => m.id === userId)
  );
  res.json({ circles });
});

app.post("/circles", rateLimit, requireUser, (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });
  const id = nanoid(8);
  const circle = {
    id,
    name,
    ownerId: req.userId,
    members: [{ id: req.userId, email: db.users[req.userId]?.email || "owner", name: "Owner" }],
    assignments: [],
    nextSwitch: nextWednesday(Date.now()),
    hostIndex: 0,
    timezone: req.body?.timezone || "UTC",
  };
  db.circles[id] = circle;
  markDirty();
  if (sqliteDb) {
    sqliteDb
      .prepare("INSERT OR REPLACE INTO circles (id,name,ownerId,timezone) VALUES (?,?,?,?)")
      .run(id, name, req.userId, circle.timezone);
    sqliteDb
      .prepare("INSERT OR REPLACE INTO users (id,email) VALUES (?,?)")
      .run(req.userId, db.users[req.userId]?.email || "owner");
    sqliteDb
      .prepare("INSERT OR REPLACE INTO members (circleId,userId,email,name) VALUES (?,?,?,?)")
      .run(id, req.userId, db.users[req.userId]?.email || "owner", "Owner");
  }
  res.status(201).json({ circle });
});

app.post("/circles/:id/members", rateLimit, requireUser, (req, res) => {
  const circle = db.circles[req.params.id];
  if (!circle) return res.status(404).json({ error: "not found" });
  if (circle.ownerId !== req.userId) return res.status(403).json({ error: "only owner can add" });
  const { email, name } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });
  const id = nanoid(10);
  circle.members.push({ id, email, name: name || email.split("@")[0] });
  markDirty();
  if (sqliteDb) {
    sqliteDb
      .prepare("INSERT OR REPLACE INTO users (id,email) VALUES (?,?)")
      .run(id, email);
    sqliteDb
      .prepare("INSERT INTO members (circleId,userId,email,name) VALUES (?,?,?,?)")
      .run(circle.id, id, email, name || email.split("@")[0]);
  }
  res.status(201).json({ members: circle.members });
});

app.post("/circles/:id/advance", rateLimit, requireUser, (req, res) => {
  const circle = db.circles[req.params.id];
  if (!circle) return res.status(404).json({ error: "not found" });
  if (!circle.members.length) return res.status(400).json({ error: "no members" });
  circle.hostIndex = (circle.hostIndex + 1) % circle.members.length;
  const host = circle.members[circle.hostIndex];
  circle.assignments.unshift({ userId: host.id, atTs: Date.now(), trigger: "manual" });
  circle.assignments = circle.assignments.slice(0, 100);
  circle.nextSwitch = nextWednesday(Date.now());
  markDirty();
  res.json({ host, nextSwitch: circle.nextSwitch, assignments: circle.assignments });
});

app.get("/circles/:id/assignments", rateLimit, requireUser, (req, res) => {
  const circle = db.circles[req.params.id];
  if (!circle) return res.status(404).json({ error: "not found" });
  // auto-advance if past nextSwitch
  const now = Date.now();
  while (circle.nextSwitch && now >= circle.nextSwitch && circle.members.length) {
    circle.hostIndex = (circle.hostIndex + 1) % circle.members.length;
    const host = circle.members[circle.hostIndex];
    circle.assignments.unshift({ userId: host.id, atTs: circle.nextSwitch, trigger: "auto" });
    circle.assignments = circle.assignments.slice(0, 100);
    circle.nextSwitch = nextWednesday(circle.nextSwitch + 1000);
    markDirty();
  }
  res.json({
    host: circle.members[circle.hostIndex],
    nextSwitch: circle.nextSwitch,
    assignments: circle.assignments,
  });
});

// Record upload metadata (after successful upload)
app.post("/uploads/commit", rateLimit, requireUser, (req, res) => {
  const { circleId, resourceUrl, size, contentType, duration } = req.body || {};
  if (!circleId || !resourceUrl) return res.status(400).json({ error: "circleId and resourceUrl required" });
  const circle = db.circles[circleId];
  if (!circle) return res.status(404).json({ error: "circle not found" });
  const isMember = circle.members.some((m) => m.id === req.userId);
  if (!isMember) return res.status(403).json({ error: "not a circle member" });
  db.uploads.unshift({
    id: nanoid(10),
    circleId,
    userId: req.userId,
    size,
    contentType,
    duration,
    resourceUrl,
    when: Date.now(),
  });
  db.uploads = db.uploads.slice(0, 200);
  markDirty();
   if (sqliteDb) {
     sqliteDb
       .prepare(
         "INSERT INTO uploads (id,circleId,userId,size,contentType,duration,resourceUrl,createdAt) VALUES (?,?,?,?,?,?,?,?)"
       )
       .run(nanoid(10), circleId, req.userId, size || 0, contentType || "video/webm", duration || 0, resourceUrl, Date.now());
   }
  res.json({ ok: true });
});

app.get("/uploads", rateLimit, requireUser, (req, res) => {
  const circleId = req.query.circleId;
  const uploads = circleId ? db.uploads.filter((u) => u.circleId === circleId) : db.uploads;
  res.json({ uploads });
});

// Flags
app.post("/flags", rateLimit, requireUser, (req, res) => {
  const { circleId, reason, note } = req.body || {};
  if (!reason) return res.status(400).json({ error: "reason required" });
  db.flags.unshift({
    id: nanoid(10),
    circleId: circleId || "unspecified",
    userId: req.userId,
    reason,
    note,
    when: Date.now(),
  });
  db.flags = db.flags.slice(0, 200);
  markDirty();
  if (sqliteDb) {
    sqliteDb
      .prepare("INSERT INTO flags (id,circleId,userId,reason,note,createdAt) VALUES (?,?,?,?,?,?)")
      .run(nanoid(10), circleId || "unspecified", req.userId, reason, note || "", Date.now());
  }
  res.status(201).json({ ok: true });
});

app.get("/flags", rateLimit, requireUser, (req, res) => {
  const circleId = req.query.circleId;
  const flags = circleId
    ? db.flags.filter((f) => f.circleId === circleId)
    : db.flags;
  res.json({ flags });
});

// Invites
app.post("/invites", rateLimit, requireUser, (req, res) => {
  const { circleId, email } = req.body || {};
  if (!circleId || !email) return res.status(400).json({ error: "circleId and email required" });
  const circle = db.circles[circleId];
  if (!circle) return res.status(404).json({ error: "circle not found" });
  if (circle.ownerId !== req.userId) return res.status(403).json({ error: "only owner can invite" });
  const token = nanoid(24);
  db.invites.push({
    token,
    circleId,
    email,
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  markDirty();
  res.status(201).json({ token, inviteUrl: `${FRONTEND_URL}?invite=${token}` });
});

app.get("/invites/:token", rateLimit, (req, res) => {
  const inv = db.invites.find((i) => i.token === req.params.token);
  if (!inv || inv.expires < Date.now()) return res.status(404).json({ error: "invite not found" });
  const circle = db.circles[inv.circleId];
  if (!circle) return res.status(404).json({ error: "circle not found" });
  res.json({ circle: { id: circle.id, name: circle.name }, email: inv.email, expires: inv.expires });
});

app.post("/invites/:token/accept", rateLimit, (req, res) => {
  const invIdx = db.invites.findIndex((i) => i.token === req.params.token);
  if (invIdx === -1) return res.status(404).json({ error: "invite not found" });
  const inv = db.invites[invIdx];
  if (inv.expires < Date.now()) return res.status(400).json({ error: "invite expired" });
  const circle = db.circles[inv.circleId];
  if (!circle) return res.status(404).json({ error: "circle not found" });
  // create user if needed
  let user = Object.values(db.users).find((u) => u.email === inv.email);
  if (!user) {
    const id = nanoid(10);
    user = { id, email: inv.email };
    db.users[id] = user;
  }
  if (!circle.members.some((m) => m.email === inv.email)) {
    circle.members.push({ id: user.id, email: user.email, name: user.email.split("@")[0] });
  }
  db.invites.splice(invIdx, 1);
  if (sqliteDb) {
    sqliteDb.prepare("INSERT OR REPLACE INTO users (id,email) VALUES (?,?)").run(user.id, user.email);
    sqliteDb
      .prepare("INSERT OR REPLACE INTO members (circleId,userId,email,name) VALUES (?,?,?,?)")
      .run(circle.id, user.id, user.email, user.email.split("@")[0]);
    sqliteDb.prepare("DELETE FROM invites WHERE token = ?").run(req.params.token);
  }
  markDirty();
  res.json({ userId: user.id, circleId: circle.id });
});

// MOCK: Signed URL generation. When SERVICE_ACCOUNT_KEY_B64 is set, real GCS v4 signed URLs are
// issued. Without it, signUrls() throws and the catch block below returns a mock URL that
// contains "mock" in the query string — the frontend detects this and skips the actual PUT.
// Set SERVICE_ACCOUNT_KEY_B64 + GCS_BUCKET + GCP_PROJECT_ID for real uploads.
app.post("/uploads/sign", rateLimit, requireUser, (req, res) => {
  const { circleId, filename, contentType, size, duration } = req.body || {};
  if (!circleId || !filename) return res.status(400).json({ error: "circleId and filename required" });
  const circle = db.circles[circleId];
  if (!circle) return res.status(404).json({ error: "circle not found" });
  const isMember = circle.members.some((m) => m.id === req.userId);
  if (!isMember) return res.status(403).json({ error: "not a circle member" });
  if (size && size > MAX_UPLOAD_BYTES) {
    return res.status(400).json({ error: "file too large" });
  }
  if (duration && duration > MAX_UPLOAD_SECONDS) {
    return res.status(400).json({ error: "duration too long" });
  }
  const objectPath = `circles/${circleId}/${nanoid(6)}-${sanitize(filename)}`;
  const expiresInSeconds = 15 * 60; // seconds
  signUrls(objectPath, contentType, expiresInSeconds)
    .then((signed) => {
      res.json({
        uploadUrl: signed.uploadUrl,
        downloadUrl: signed.downloadUrl,
        resourceUrl: `gs://${GCS_BUCKET}/${objectPath}`,
        expiresIn: expiresInSeconds,
        meta: { contentType, size },
      });
    })
    .catch((err) => {
      console.warn("[sign] falling back to mock", err);
      res.json({
        uploadUrl: `https://storage.googleapis.com/${GCS_BUCKET}/${objectPath}?X-Goog-Signature=mock&expires=${expiresInSeconds}`,
        downloadUrl: `https://storage.googleapis.com/${GCS_BUCKET}/${objectPath}?X-Goog-Signature=mock&expires=${expiresInSeconds}`,
        resourceUrl: `gs://${GCS_BUCKET}/${objectPath}`,
        expiresIn: expiresInSeconds,
        meta: { contentType, size },
        mock: true,
      });
    });
});

// Multipart/resumable mock endpoints
app.post("/uploads/multipart/start", rateLimit, requireUser, (req, res) => {
  const { circleId, filename, parts = 3 } = req.body || {};
  if (!circleId || !filename) return res.status(400).json({ error: "circleId and filename required" });
  const uploadId = nanoid(12);
  const urls = Array.from({ length: Math.min(10, Number(parts) || 3) }).map((_, idx) => ({
    partNumber: idx + 1,
    url: `https://storage.googleapis.com/${GCS_BUCKET}/multipart/${uploadId}/part${idx + 1}?mock=1`,
  }));
  res.json({ uploadId, parts: urls, mock: true });
});

app.post("/uploads/multipart/complete", rateLimit, requireUser, (req, res) => {
  const { uploadId, parts, circleId, filename } = req.body || {};
  if (!uploadId) return res.status(400).json({ error: "uploadId required" });
  res.json({
    ok: true,
    resourceUrl: `gs://${GCS_BUCKET}/multipart/${uploadId}/${sanitize(filename || "file")}`,
    parts: parts || [],
    mock: true,
  });
});

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function nextWednesday(afterTs) {
  const d = new Date(afterTs);
  const day = d.getDay();
  d.setHours(0, 0, 0, 0);
  const delta = (3 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return d.getTime();
}

async function signUrls(objectPath, contentType, expiresInSeconds) {
  if (!storageClient || !serviceAccountEmail) throw new Error("no storage client configured");
  const bucket = storageClient.bucket(GCS_BUCKET);
  const file = bucket.file(objectPath);
  const expires = Date.now() + expiresInSeconds * 1000;
  const [uploadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires,
    contentType: contentType || "application/octet-stream",
  });
  const [downloadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires,
  });
  return { uploadUrl, downloadUrl };
}

async function sendMagicLink(email, token) {
  const link = `${FRONTEND_URL}?token=${encodeURIComponent(token)}`;
  if (!mailer) {
    console.log(`[auth] mock magic link for ${email}: ${link}`);
    return;
  }
  await mailer.sendMail({
    from: process.env.SMTP_FROM || "Wednesdays <no-reply@example.com>",
    to: email,
    subject: "Your Wednesday's login link",
    text: `Tap to sign in: ${link}\n\nToken: ${token}\n(This is a magic link; it expires in 15 minutes)`,
  });
}

app.listen(PORT, () => {
  console.log(`[wednesdays-api] listening on ${PORT}`);
});
