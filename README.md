# Wednesday's – rotating weekly video drops

A browser-first PWA where one person from your circle records a 60–90 second video recap every Wednesday. The rotation advances automatically each week. No installs required.

## Quick start

Open `index.html` in any modern browser. Everything runs locally — no backend needed for basic use.

```
# Optional: serve with a local static server
python -m http.server 8000
# then open http://localhost:8000
```

Grant camera/mic access when prompted. Tap **Load demo circle** to try the flow without adding friends.

## Backend setup (optional)

The Express server enables real signed uploads to GCS, circle sync, and mock magic-link auth.

```bash
cd server
npm install
cp .env.example .env   # edit PORT, GCS_BUCKET, etc.
npm start              # defaults to http://localhost:8787
```

Key env vars:

| Var | Purpose |
|-----|---------|
| `SERVICE_ACCOUNT_KEY_B64` | Base64 GCS service account JSON — enables real signed URLs |
| `GCS_BUCKET` | GCS bucket name |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Real email delivery for magic links |
| `USE_SQLITE=true` | Mirror in-memory store to SQLite for restarts |
| `MAX_UPLOAD_BYTES` | Upload size cap (default 200 MB) |

Without `SERVICE_ACCOUNT_KEY_B64`, the server returns **mock signed URLs** — the client detects the `mock` flag and skips the actual PUT, exercising the UI flow without touching storage.

In the UI: set API base → ping → log in via mock magic link → request signed upload / sync circle.

## Known limitations

- **Local-only by default.** Videos and state live in `localStorage`; nothing syncs across devices without the backend.
- **Recording support.** `MediaRecorder` requires Safari 14.3+ / Chrome. Use "Upload existing video" as fallback.
- **Auth is mock.** Magic-link tokens are returned in API responses (dev only). Wire up real email delivery before sharing with others.
- **Uploads cap at ~150 MB / 120 s** client-side; server enforces 200 MB / 180 s.
- **Push notifications** are browser-local (tab must be open). No APNs/FCM yet.
