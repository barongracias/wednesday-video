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
- `npm start` (defaults to `http://localhost:8787`).
- Use the **Backend bridge** card in the UI to set the API base, ping the server, and request signed uploads with a mock user header (`x-user-id`).

### Using uploads before real storage
- You can upload a recorded or local video to a *mock* signed URL to exercise the flow. Real uploads will work once valid GCS signed URLs are returned by the API.
- Pick a clip (record or “Use existing video”), set API base, click **Request signed upload**. If the URL is mock, no network upload occurs.

## Mock environment / dry-run flow
- Tap **Load demo circle** to prefill members + sample history.
- Tap **Generate mock recording** to create a short clip without using the camera. The clip is playable/downloadable and exercises the share/download path.
- Tap **Save to mock cloud** to log a fake upload (metadata only) so you can test UI around uploads without sending anything anywhere.
- Tap **Simulate Wednesday** to advance the host rotation and confirm countdown/hand-off logic.
- Clear `localStorage` or hit **Reset** to start over.

## Known limitations / improvements
- **Storage/sharing:** Browser storage is local-only; videos are not persisted across devices. Next step: S3/GCS-backed storage with signed upload URLs and short-lived download tokens.
- **Auth & privacy:** No authentication yet. Add magic-link sign-in, invite links, and private circles. Include consent copy + moderation/reporting.
- **Notifications:** No reminders today. Add push (APNs/FCM/Web Push) and calendar holds to nudge the weekly host.
- **Fairness:** Rotation is deterministic and local; add a server source of truth, time zone awareness, and auditability for “who’s next.”
- **Recording support:** `MediaRecorder` is required; iOS 14.3+ only. Add native apps for lower latency and background uploads; fallback to “upload existing video” if recording isn’t supported.
- **Bandwidth:** Add client-side compression and upload progress; cap duration to ~90s.

## Suggested next steps for native parity
1) Stand up a minimal backend (FastAPI/Next.js API) for circles, membership, and assignment schedule.  
2) Add signed upload endpoints; pin videos to object storage + CDN.  
3) Ship an Expo/React Native client reusing the same APIs; enable background uploads and push reminders.  
4) Layer in moderation (flagging, abuse limits) and retention rules.
