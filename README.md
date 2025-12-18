# Wednesday's – rotating weekly video drops

Browser-first MVP for a cross-platform (iOS/Android/PWA) app where one person from a group is randomly assigned every Wednesday to record and share a 60–90 second recap video of their week.

## What works in this MVP
- Mobile-friendly web app; no installs required.
- Create and edit your friend list, shuffle the rotation order, and auto-advance to the next host each Wednesday (local time) or manually.
- Simple video capture with your phone/desktop camera using `MediaRecorder`, in-app preview, download, and system share when supported.
- Demo tools to test flows without people or cameras: load a sample circle, generate a mock video (Canvas-based), and log a “mock upload”.
- Local-first: everything is stored in `localStorage`; no backend required for testing.

## Product flow
- **Create a circle:** Add friends; the app keeps a rotation order you can shuffle anytime.
- **Who’s up:** The top of the home screen shows the current host and when the baton moves next (auto-advances on Wednesdays).
- **Record:** The chosen host records a short video right in the browser, previews it, then downloads or shares the file.
- **History:** Lightweight local history of who went when; not a public feed yet.

## Running it
Open `index.html` in your browser or serve the folder locally (e.g., `python -m http.server`). Best experienced on mobile Safari/Chrome; grant camera/mic access when prompted.

### Backend (Express) mock server
- `cd server && npm install`
- Copy `.env.example` to `.env`, set `PORT`, `GCS_BUCKET`, and later your GCS creds (currently returns mock-signed URLs).
- If you have a GCS service account, base64 the JSON and set `SERVICE_ACCOUNT_KEY_B64`; real signed URLs will be issued. Without it, the server falls back to mock URLs.
- Optional: set SMTP_* to send real magic links; otherwise tokens are returned in responses (dev only).
- `npm start` (defaults to `http://localhost:8787`).
- Use the **Backend bridge** card in the UI to set the API base, ping the server, request signed uploads, and sync a circle.

### Sign-up / login (mock magic link)
- In the UI, set API base, enter an email, click **Send link (mock)**. The backend returns a token in dev; paste into **token** and click **Verify**.
- On success, session is saved locally and used for upload signing. In production, the token would be emailed.

### Backend circle sync (optional)
- After logging in, click **Sync circle**. The client will fetch your circles; if none, it creates a demo circle and seeds members from your local list.
- Assignments/host are pulled from the backend and reflected in the UI; the circle ID is stored locally and used for signed uploads.
- Server storage now also persists to `server/data/db.json` locally so restarts keep mock data (still not production-grade).

### Using uploads before real storage
- You can upload a recorded or local video to a *mock* signed URL to exercise the flow. Real uploads will work once valid GCS signed URLs are returned by the API.
- Pick a clip (record or “Use existing video”), set API base, click **Request signed upload**. If the URL is mock, no network upload occurs.
- Upload UX now shows progress and keeps a local attempts log; you can retry after failures. Clips are capped at ~150MB and 120s; longer/larger uploads are blocked client-side.
- You can set target bitrate and max duration before recording; choose lower bitrate for smaller files.
- Uploads are queued; pause/resume/cancel controls manage the queue. Queue entries show in a queue list; history log shows outcomes.
- Per-item progress shows in the queue list. “Clear completed” trims finished/failed items.
- Consent reminder appears before recording; unsupported devices see a recording fallback message (use upload).

### Backup/restore
- Use **Download backup** to save local state (friends, history, mock uploads, settings). Import it on the same or another device via **Import backup**.
- Tokens/API base are not included for safety; log in again after import.

### GCS CORS quick config
If you enable real uploads, set a permissive CORS rule on your bucket (tighten later):
```json
[
  {
    "origin": ["http://localhost:8000", "https://your-domain.com"],
    "method": ["GET", "PUT", "HEAD"],
    "responseHeader": ["Content-Type", "x-goog-meta-*"],
    "maxAgeSeconds": 3600
  }
]
```
Apply with `gsutil cors set cors.json gs://$GCS_BUCKET`.

## Mock environment / dry-run flow
- Tap **Load demo circle** to prefill members + sample history.
- Tap **Generate mock recording** to create a short clip without using the camera. The clip is playable/downloadable and exercises the share/download path.
- Tap **Save to mock cloud** to log a fake upload (metadata only) so you can test UI around uploads without sending anything anywhere.
- Tap **Simulate Wednesday** to advance the host rotation and confirm countdown/hand-off logic.
- Clear `localStorage` or hit **Reset** to start over.

## PWA / offline basics
- Added `manifest.json`, SVG icon, and a service worker that caches core assets for offline viewing.
- Installable as a PWA from mobile browsers that support it; capture/upload still requires network.

## Reminders
- Browser notifications: enable in the Reminders card, then send a local reminder to the current host. Works only while the tab/site is open on that device.
- Calendar: download an `.ics` reminder for the next handoff; add it to your calendar client for a 15-minute prior alert.

## Safety/consent
- This is a local-first demo; remind participants to consent before sharing. Add moderation/reporting before wider use.
- A local “Report content” button lets you log issues; it does not notify anyone yet.

## Tests (Playwright scaffold)
- `cd tests && npm install`
- Serve the app (e.g., `python -m http.server 8000`), set `BASE_URL=http://localhost:8000`, then run `npm test`.
- Smoke test covers loading the home page and demo controls.

## Known limitations / improvements
- **Storage/sharing:** Browser storage is local-only; videos are not persisted across devices. Next step: S3/GCS-backed storage with signed upload URLs and short-lived download tokens.
- **Auth & privacy:** No authentication yet. Add magic-link sign-in, invite links, and private circles. Include consent copy + moderation/reporting.
- **Notifications:** No reminders today. Add push (APNs/FCM/Web Push) and calendar holds to nudge the weekly host.
- **Fairness:** Rotation is deterministic and local; add a server source of truth, time zone awareness, and auditability for “who’s next.”
- **Recording support:** `MediaRecorder` is required; iOS 14.3+ only. Use “upload existing video” fallback where unsupported; native apps would improve capture/background uploads.
- **Bandwidth:** Add client-side compression and upload progress; cap duration to ~90s.

## Mobile readiness
- Layout is responsive and touch-friendly; uses `playsinline` for video on iOS/Android.
- Recording works on modern Safari/Chrome (MediaRecorder). Older devices should use the “Use existing video” picker.
- For native feel, wrap this as a PWA or build an Expo/React Native client targeting the same API.

## Suggested next steps for native parity
1) Stand up a minimal backend (FastAPI/Next.js API) for circles, membership, and assignment schedule.  
2) Add signed upload endpoints; pin videos to object storage + CDN.  
3) Ship an Expo/React Native client reusing the same APIs; enable background uploads and push reminders.  
4) Layer in moderation (flagging, abuse limits) and retention rules.
