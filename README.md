# ShipKit — from GitHub repo to installable mobile app

A webapp for non-technical founders: link a GitHub repository (e.g. a Lovable export),
follow a guided setup wizard for every account and credential (Apple, Google Play, Expo…),
and get downloadable Android builds and TestFlight-ready iOS builds — plus a chat that
edits the app for you ("Lovable for mobile").

## Run it

```bash
npm install
npx prisma db push     # creates prisma/dev.db (SQLite)
npm run dev            # http://localhost:3000
```

`.env` needs `ENCRYPTION_KEY` (32 bytes base64 — see `.env.example`) and `ENABLE_WORKER=1`.

Requirements on the machine: `git`, Node ≥ 20, the `claude` CLI (authenticated) for the Chat tab,
and network access for `npx eas-cli` (builds run in Expo's cloud under the **user's** Expo account).

## How it works

| Piece | Where | What it does |
|---|---|---|
| Projects | `/api/projects` | Link a GitHub repo; a background job clones it into `storage/workspaces/<id>` and detects whether it's an Expo app. |
| Setup wizard | `src/lib/wizard/` | Step-by-step, non-technical instructions (distilled from the store-launch playbooks) for Apple Developer, Play Console, Expo token, GitHub PAT, ASC API key, Play service account, app identity, TestFlight, OAuth. Pasted values are validated (format checks) and stored AES-256-GCM-encrypted. |
| Builds | `src/lib/builds/eas.ts` | Runs `npx eas-cli build --platform … --non-interactive --json` in the workspace with the user's `EXPO_TOKEN`; injects the chosen bundle id into `app.json`, creates a default `eas.json` (preview profile → APK). Android success yields a direct APK download link; iOS uses the pasted App Store Connect API key for signing. |
| Chat | `src/lib/chat/claude.ts` | Spawns the local `claude` CLI (`-p --output-format stream-json --permission-mode acceptEdits`) inside the project workspace, streams text/tool events to the browser via SSE, keeps session continuity per project (`--resume`), and instructs the agent to convert Lovable web apps into native Expo apps (never WebView wrappers). |
| Job runner | `src/lib/jobs.ts` | DB-backed queue polled in-process (started from `src/instrumentation.ts`), max 2 concurrent jobs, orphan recovery on restart. |

## Product constraints baked in

- **iOS has no "download & install" path** — the wizard routes users to TestFlight; Android gets a direct APK link.
- **Everything ships under the user's own accounts** (Apple 4.2.6 / Play policy): the wizard collects *their* tokens; nothing is published under a platform account.
- **Web wrappers get rejected by Apple** — the chat agent is instructed to regenerate Lovable apps as native Expo apps.

## MVP status / next steps

- [x] Repo linking (public; private via GitHub PAT), Expo detection
- [x] Wizard with field validation + encrypted credential vault
- [x] Android/iOS build pipeline via EAS (user's Expo account), logs, artifact links
- [x] Per-project Claude chat with streaming + session continuity
- [ ] OTA updates (`eas update`) after chat changes, so edits appear on the phone in seconds
- [ ] Automated `eas submit` to TestFlight / Play internal testing
- [ ] Live verification of pasted credentials (call ASC / Play APIs)
- [ ] Lovable→Expo conversion as a one-click action (today: ask the chat)
- [ ] Multi-user auth + hosted deployment (currently single-user local)
