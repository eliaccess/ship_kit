# ShipKit — turn your Lovable project into a real mobile app

**Open source, runs on your computer, everything under your own accounts.**

You vibe-coded an app in Lovable (or you have any GitHub repo). ShipKit takes it the rest of
the way: a coding agent reworks it into a native Expo app, a guided wizard walks you through
every account and credential (Apple, Google Play, Expo…), and you get installable Android
builds and TestFlight-ready iOS builds — from your own machine.

No hosted service, no markup, no platform account in the middle:

- **Your Anthropic account** powers the chat agent (Claude Code — a Claude subscription or API key).
- **Your Expo account** powers builds (cloud on their free tier, or unlimited local builds on your machine).
- **Your Apple / Google accounts** publish the app (required by the stores anyway).
- **Your machine** stores everything; pasted credentials are AES-256-GCM encrypted in a local SQLite db.

## Quick start

```bash
git clone <this repo> && cd shipkit
npm install
cp .env.example .env   # generate ENCRYPTION_KEY as shown inside
npx prisma db push
npm run dev            # http://localhost:3000
```

Then open **Settings** — the *Your machine* panel checks each tool and shows setup
instructions for whatever is missing:

| Needed for | Tool | Notes |
|---|---|---|
| Everything | Node ≥ 20, Git | |
| Chat tab (the coding agent) | `claude` CLI, logged in | `npm i -g @anthropic-ai/claude-code`, then run `claude` once |
| Builds (both modes) | Expo account + access token | free — pasted in the wizard |
| Local Android builds | Android SDK + JDK | cloud mode needs none of this |
| Local iOS builds | macOS + Xcode + CocoaPods | cloud mode builds iOS without a Mac |

**Cloud vs local builds** — toggle per platform in Settings. Cloud (default) runs on Expo's
servers under your Expo account (~30 free builds/month, zero setup). Local runs
`eas build --local` on your machine: unlimited, and artifacts are served straight from disk.

## The flow

1. **Link a repo** — public URL, or paste a read-only GitHub token for private repos.
2. **Rework it with the agent** — Lovable exports are web apps; Apple rejects thin web wrappers.
   Open Chat and say *"Convert this Lovable web app into an Expo mobile app"*. The agent
   (Claude Code, on your account, in the project's workspace) regenerates it natively, commits as it goes.
3. **Setup wizard** — step-by-step, non-technical instructions for the Apple Developer Program
   (start first: 24–48h activation), Play Console (incl. the 14-day closed-test rule),
   App Store Connect API key, Play service account, app identity. Values validated on paste.
4. **Build** — Android gives a direct APK download link (installable on any Android phone);
   iOS builds sign with your ASC key and install via TestFlight.
5. **Iterate** — keep chatting; rebuild when you're happy.

## Architecture (for contributors)

Next.js 15 (App Router) + Prisma/SQLite, no external services:

- `src/lib/jobs.ts` — DB-backed job queue polled in-process (`src/instrumentation.ts`), 2 concurrent, orphan recovery.
- `src/lib/builds/eas.ts` — build runner: cloud (`--json --wait`, artifact URL from EAS) or local (`--local --output`, artifact served from `storage/artifacts/`).
- `src/lib/chat/claude.ts` — spawns `claude -p --output-format stream-json --permission-mode acceptEdits` in the workspace, streams SSE to the browser, per-project session resume, conversion brief appended to the system prompt.
- `src/lib/wizard/` — step definitions + validation; instruction content in `content.json`.
- `src/lib/doctor.ts` — machine checks behind Settings → *Your machine* and the Chat setup card.
- `src/lib/crypto.ts` — AES-256-GCM for credentials at rest (`ENCRYPTION_KEY` in `.env`).

## Roadmap

- [ ] OTA updates (`eas update`) after chat changes — see edits on your phone in seconds without rebuilding
- [ ] One-click `eas submit` to TestFlight / Play internal testing
- [ ] Live verification of pasted credentials (ping ASC / Play APIs)
- [ ] Store-listing generator (screenshots, privacy questionnaire answers)
- [ ] Support other coding agents behind the chat interface

MIT licensed — see [LICENSE](./LICENSE).
