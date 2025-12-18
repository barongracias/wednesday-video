import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { nanoid } from "nanoid";
import nodemailer from "nodemailer";
import { Storage } from "@google-cloud/storage";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 8787;
const GCS_BUCKET = process.env.GCS_BUCKET || "your-bucket";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8000";

// In-memory demo store. Replace with a real DB before production.
const db = {
  users: {}, // id -> {email}
  circles: {}, // id -> {name, ownerId, members: [{id,email,name}], assignments: [{userId, atTs}]}
  loginTokens: {}, // token -> {userId, expires}
};

let storageClient = null;
let serviceAccountEmail = null;
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

const requireUser = (req, res, next) => {
  const userId = req.header("x-user-id") || req.query.userId;
  if (!userId || !db.users[userId]) {
    return res.status(401).json({ error: "unauthenticated; provide x-user-id (mock only)" });
  }
  req.userId = userId;
  next();
};

app.get("/health", (req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || "development" });
});

// Mock magic link flow: request link -> returns token (would be emailed), verify -> returns session userId
app.post("/auth/request-link", (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });
  let user = Object.values(db.users).find((u) => u.email === email);
  if (!user) {
    const id = nanoid(10);
    user = { id, email };
    db.users[id] = user;
  }
  const token = nanoid(24);
  db.loginTokens[token] = { userId: user.id, expires: Date.now() + 15 * 60 * 1000 };
  sendMagicLink(email, token).catch((err) =>
    console.warn("[email] sendMagicLink failed; continuing", err)
  );
  res.json({
    token,
    message: mailer ? "Link emailed (check inbox)" : "Mock token; would be emailed in production",
  });
});

app.post("/auth/verify", (req, res) => {
  const { token } = req.body || {};
  const entry = db.loginTokens[token];
  if (!entry || entry.expires < Date.now()) {
    return res.status(400).json({ error: "invalid or expired token" });
  }
  res.json({ userId: entry.userId });
});

// Circles
app.get("/circles", requireUser, (req, res) => {
  const userId = req.userId;
  const circles = Object.values(db.circles).filter(
    (c) => c.ownerId === userId || c.members.some((m) => m.id === userId)
  );
  res.json({ circles });
});

app.post("/circles", requireUser, (req, res) => {
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
  };
  db.circles[id] = circle;
  res.status(201).json({ circle });
});

app.post("/circles/:id/members", requireUser, (req, res) => {
  const circle = db.circles[req.params.id];
  if (!circle) return res.status(404).json({ error: "not found" });
  if (circle.ownerId !== req.userId) return res.status(403).json({ error: "only owner can add" });
  const { email, name } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });
  const id = nanoid(10);
  circle.members.push({ id, email, name: name || email.split("@")[0] });
  res.status(201).json({ members: circle.members });
});

app.post("/circles/:id/advance", requireUser, (req, res) => {
  const circle = db.circles[req.params.id];
  if (!circle) return res.status(404).json({ error: "not found" });
  if (!circle.members.length) return res.status(400).json({ error: "no members" });
  circle.hostIndex = (circle.hostIndex + 1) % circle.members.length;
  const host = circle.members[circle.hostIndex];
  circle.assignments.unshift({ userId: host.id, atTs: Date.now(), trigger: "manual" });
  circle.assignments = circle.assignments.slice(0, 100);
  circle.nextSwitch = nextWednesday(Date.now());
  res.json({ host, nextSwitch: circle.nextSwitch, assignments: circle.assignments });
});

app.get("/circles/:id/assignments", requireUser, (req, res) => {
  const circle = db.circles[req.params.id];
  if (!circle) return res.status(404).json({ error: "not found" });
  res.json({
    host: circle.members[circle.hostIndex],
    nextSwitch: circle.nextSwitch,
    assignments: circle.assignments,
  });
});

// Upload signing mock. Replace with real GCS signed URL generation using service account key.
app.post("/uploads/sign", requireUser, (req, res) => {
  const { circleId, filename, contentType, size } = req.body || {};
  if (!circleId || !filename) return res.status(400).json({ error: "circleId and filename required" });
  // In production: validate membership; create object path; sign PUT/GET URLs with expiry.
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
