# Goddard GUI — Spec

## Overview
A Next.js 14+ (App Router) dashboard for managing an OpenClaw AI agent called "Goddard."
Deployed on Vercel. Connects client-side to the OpenClaw Gateway HTTP API.

## Tech Stack
- Next.js 14+ with App Router
- TypeScript
- Tailwind CSS v4
- shadcn/ui components
- No database — all data comes from the Gateway API at runtime

## Design
- Dark mode by default (dark navy/charcoal theme)
- Clean, modern, minimal
- Accent color: blue (#0052 9B) — same as the market report accent
- Mobile-first responsive
- Think: a sleek mission control for a robot dog

## Gateway Connection
The app talks to the OpenClaw Gateway via HTTP API:
- Base URL: configurable (stored in localStorage)
- Auth: Bearer token (stored in localStorage)
- Primary endpoint: `POST {gatewayUrl}/tools/invoke`
  - Body: `{ "tool": "<toolName>", "args": { ... } }`
  - Header: `Authorization: Bearer <token>`
- Chat endpoint: `POST {gatewayUrl}/v1/chat/completions`
  - OpenAI-compatible, supports streaming (SSE)
  - Use `model: "openclaw:main"` and `stream: true`

### Settings Page
- Gateway URL input (e.g., `https://goddard.example.com` or `http://192.168.1.100:18789`)
- Auth token input (password-masked)
- Connection test button
- Store in localStorage

## Pages / Features

### 1. Dashboard (/)
Overview page with cards/widgets:
- **Status card**: Gateway connection status (green/red dot), model name, uptime
- **Active Sessions**: count + list of recent sessions
- **Cron Jobs**: count + next upcoming job
- **Quick Stats**: any other useful at-a-glance info

### 2. Chat (/chat)
Full chat interface to talk to Goddard:
- Uses `/v1/chat/completions` with streaming
- Message input at bottom, messages scroll up
- Support markdown rendering in responses
- Show "thinking..." indicator while streaming
- Clean message bubbles (user on right, assistant on left)
- Session selector dropdown (different sessions/topics)

### 3. Sessions (/sessions)
- List all sessions from `sessions_list` tool
- Show: session key, last activity, message count
- Click into a session to see its history via `sessions_history` tool
- Each session shows its messages in a chat-like view (read-only)

### 4. Cron Jobs (/cron)
- List all jobs from `cron` tool (action: list, includeDisabled: true)
- Show: name, schedule (human-readable), enabled status, last run, next run
- Toggle enable/disable (cron action: update)
- "Run Now" button (cron action: run)
- Expandable details showing full payload
- Create new job form (stretch goal)

### 5. Memory (/memory)
- Read and display MEMORY.md via `exec` tool: `cat /Users/goddard/clawd/MEMORY.md`
- List daily memory files: `ls /Users/goddard/clawd/memory/`
- Click to view any memory file
- Rendered as markdown

### 6. Settings (/settings)
- Gateway URL + token config
- Connection test
- Gateway config viewer (from gateway config.get)
- About section

## API Helper
Create a clean API client module:

```typescript
// lib/api.ts
class GatewayClient {
  constructor(baseUrl: string, token: string)

  // Invoke a tool
  async invoke(tool: string, args?: Record<string, any>): Promise<any>

  // Chat completions (streaming)
  async chat(messages: Message[], onChunk: (text: string) => void): Promise<void>

  // Convenience methods
  async listSessions(): Promise<Session[]>
  async getSessionHistory(sessionKey: string): Promise<Message[]>
  async listCronJobs(): Promise<CronJob[]>
  async updateCronJob(jobId: string, patch: any): Promise<void>
  async runCronJob(jobId: string): Promise<void>
  async readFile(path: string): Promise<string>
  async exec(command: string): Promise<string>
}
```

## Important Notes
- ALL API calls happen client-side (in the browser). No server-side API routes needed for Gateway communication.
- The app is essentially a static SPA with Next.js routing.
- Handle CORS: the Gateway may need CORS headers. If not available, we'll deal with it via proxy later.
- Handle connection errors gracefully — show clear "not connected" states.
- Use `next/font` for Inter or similar clean font.

## File Structure
```
src/
  app/
    layout.tsx          # Root layout with sidebar nav
    page.tsx            # Dashboard
    chat/page.tsx       # Chat interface
    sessions/page.tsx   # Sessions list
    sessions/[key]/page.tsx  # Session detail
    cron/page.tsx       # Cron jobs
    memory/page.tsx     # Memory viewer
    settings/page.tsx   # Settings
  components/
    sidebar.tsx         # Navigation sidebar
    header.tsx          # Page headers
    status-badge.tsx    # Online/offline indicator
    chat-message.tsx    # Chat bubble component
    cron-job-card.tsx   # Cron job display
    markdown.tsx        # Markdown renderer
  lib/
    api.ts              # Gateway API client
    store.ts            # localStorage helpers
    types.ts            # TypeScript types
    utils.ts            # Utilities
```

## Deployment
- Push to GitHub repo: goddard007x/goddard-gui
- Deploy via Vercel (connect GitHub repo)
- No env vars needed on Vercel (everything is client-side localStorage)
