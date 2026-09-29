# Open Dot

Open-source personal AI agents that work on their own. Each agent (a "dot") has its own computer, browser, memory and rules. You hand it a task in chat or by voice, and it messages you when it's done or when it needs your OK.

Built on OpenAI models and [Composio](https://composio.dev) for app access.

## What a dot can do

- **Chat, with history.** Separate conversations per dot, like ChatGPT. Attach files and images.
- **Voice mode.** Talk to a dot live (OpenAI Realtime). Everything said is saved into the chat, so you can pick the conversation back up in text. Tasks you give by voice run in the background, and the dot tells you when they're done.
- **Use its own browser.** Each dot has a persistent Chrome profile, so logins stick. Watch it work live in the Computer tab, or **take over** and click and type right there to log in or solve a captcha, then hand it back.
- **Use your apps.** Sign in with Composio to give dots Gmail, Calendar, Slack, Notion, GitHub and 1500+ more. Reads happen on their own; sending, posting or changing anything asks first.
- **Run code.** A shell and a persistent `/workspace`: an E2B cloud computer, a local Docker container, or a sandbox folder.
- **Ask before acting.** Rules take the form *"When your dot wants to __, it should allow / ask first / never"*. A small model checks each risky action against your rules, and "ask first" wins when rules conflict. Approval cards offer Approve, Deny and Always allow.
- **Keep passwords safe.** Saved logins are AES-256-GCM encrypted with a key in the macOS Keychain. The password is typed straight into the page; the model never sees it.
- **Remember and repeat.** Memory about you, reusable skills, and routines on a cron schedule.
- **Work together.** Dots can consult or delegate to each other.

## Desktop app (macOS)

Open Dot runs as a Mac app: the window starts its own local server in the background, and closing the window keeps your dots working (quit with ⌘Q). Data lives in `~/Library/Application Support/Open Dot`, and you paste your OpenAI key in **Settings**.

```bash
pnpm install
pnpm desktop:build           # → dist/Open Dot-<version>-arm64.dmg
```

The build is ad-hoc signed, not notarized, so the first time macOS asks you to confirm: right-click the app → **Open**.

## Run it from source

Requires Node 22+, pnpm, and Google Chrome (Playwright's Chromium is the fallback).

```bash
cp .env.example .env.local   # add your OPENAI_API_KEY
pnpm install
npx playwright install chromium
pnpm dev                     # http://localhost:3100
pnpm desktop:dev             # optional: the desktop window, pointed at pnpm dev
```

Then open **Settings → Composio** and sign in to connect your apps.

| Env var | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | – | Required |
| `DOTS_MODEL` | best available, e.g. `gpt-5.5` | Main agent model (Responses API) |
| `DOTS_REVIEW_MODEL` | `gpt-5.4-mini` | Checks actions against your rules and names chats |
| `DOTS_VOICE_MODEL` | `gpt-realtime-2.1` | Voice mode |
| `DOTS_COMPUTER_TOOL` | `computer` | `computer` lets the model see and click the screen; `off` limits it to URL and read-page tools |
| `E2B_API_KEY` | – | Gives each dot a cloud computer that keeps working while your laptop sleeps |
| `DOTS_COMPUTER` | auto | Force `cloud`, `docker` or `local` |
| `DOTS_BOX_IMAGE` | `node:22-bookworm` | Container image when using Docker |
| `DOTS_PUBLIC_URL` | `http://localhost:3100` | Where the app is served (used for the Composio sign-in redirect) |

All data (chats, the encrypted vault, browser profiles, workspaces) stays in `.data/` on your machine.

## How it works

```
src/server/
  agent/runtime.ts     agent loop: streaming Responses API, per-conversation threads,
                       tool gating → approval cards → resume, per-dot queue, pause/stop
  agent/tools.ts       function tools and their risk metadata
  agent/review.ts      natural-language rule reviewer
  agent/prompt.ts      system prompt rebuilt each turn (rules, memory, skills, routines, other dots)
  computer/            one facade over cloud (E2B), docker and local computers
  computer/browser.ts  per-dot Chrome profile, computer-use actions, live screencast and input
  composio.ts          Composio MCP client (OAuth), app connections
  voice.ts             Realtime voice sessions
  vault.ts             encrypted password store
  scheduler.ts         cron routines
  repo.ts / db.ts      SQLite (node:sqlite) in .data/
src/app/api/events     SSE stream: one snapshot, then live events
src/lib/store.ts       client store read with useSyncExternalStore
```

OpenAI's built-in `web_search` and `computer` tools are used; everything else is a function tool, so every action can go through your rules.
