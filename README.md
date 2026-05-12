# Wednesday's

A browser-first PWA where one person from your circle records a short video recap every Wednesday. The rotation advances automatically each week. No installs required — works entirely in the browser.

## What it is

- **Weekly rotation**: auto-advances to the next host every Wednesday at midnight (local time). Manually advance or shuffle the order any time.
- **In-browser recording**: uses `MediaRecorder` + `getUserMedia` — no app install needed. Falls back to file upload when unsupported.
- **PWA**: installable from the browser, works offline after first load.
- **Optional backend**: Express server for real signed GCS uploads, circle sync, and mock magic-link auth.

## Running locally

### Frontend only (no backend needed)

Serve the root directory with any static server:

```bash
# Python
python3 -m http.server 8000

# Node (npx)
npx serve .

# Then open http://localhost:8000
```

Grant camera/mic access when prompted. Tap **Load demo circle** to try the flow without adding friends. All data stays in `localStorage`.

### Backend server (optional)

The Express server enables signed GCS uploads, circle/member sync, and email magic links.

```bash
cd server
npm install
# Copy and edit the env file:
cp .env.example .env   # (create if it doesn't exist — see env vars below)
npm start              # listens on http://localhost:8787 by default
```

In the UI: enter `http://localhost:8787` as the API base, ping it, then use the mock magic link to log in.

## Environment variables (server)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8787` | Server listen port |
| `SERVICE_ACCOUNT_KEY_B64` | — | Base64-encoded GCS service account JSON. **Required for real uploads.** Without it, mock signed URLs are returned and no data reaches GCS. |
| `GCS_BUCKET` | `your-bucket` | GCS bucket name for video storage |
| `GCP_PROJECT_ID` | _(from SA key)_ | GCP project ID |
| `SMTP_HOST` | — | SMTP server hostname. Without it, magic-link tokens are logged to console. |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` / `SMTP_PASS` | — | SMTP credentials |
| `SMTP_FROM` | `Wednesdays <no-reply@example.com>` | From address for magic-link emails |
| `FRONTEND_URL` | `http://localhost:8000` | Base URL used in invite/magic-link URLs |
| `USE_SQLITE` | `false` | Set `true` to mirror the JSON store to SQLite (survives restarts) |
| `SQLITE_DB` | `server/data/wednesdays.db` | SQLite file path |
| `MAX_UPLOAD_BYTES` | `200000000` | Server-side upload size cap (200 MB) |
| `MAX_UPLOAD_SECONDS` | `180` | Server-side duration cap (3 min) |
| `RATE_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `RATE_MAX` | `120` | Max requests per window per IP |

## PWA installation

Open the site in Chrome or Safari, then use the browser's "Add to Home Screen" / "Install app" option. The service worker caches all JS modules for offline use after the first visit.

## Running tests

```bash
cd tests
npx playwright install --with-deps
BASE_URL=http://localhost:8000 npx playwright test
```

## Known limitations

- **Local-only by default.** State lives in `localStorage`; nothing syncs across devices without the backend.
- **Recording support.** `MediaRecorder` requires Safari 14.3+ / Chrome. Use "Upload existing video" as fallback on older devices.
- **Auth is mock.** Magic-link tokens are returned directly in API responses (dev mode). Wire up real SMTP before sharing with others.
- **Client caps**: ~150 MB / 120 s. Server enforces 200 MB / 180 s.
- **Push notifications** are browser-local (tab must be open). No APNs/FCM integration yet.
