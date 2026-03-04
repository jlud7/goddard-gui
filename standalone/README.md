# Goddard Dashboard (Standalone)

A lightweight, single-page dashboard for OpenClaw's Goddard agent. No build step required.

## Files
- `index.html` — Dashboard HTML (styles only, no inline JS)
- `goddard.js` — All JavaScript logic (CSP-compliant, external)  
- `deploy.sh` — Deploy script to copy files into OpenClaw's static directory

## Deploy

```bash
./deploy.sh
```

This copies files to OpenClaw's control-ui directory so they're served at `/ui/goddard.html`.

## Access

### Local
`http://127.0.0.1:18789/ui/goddard.html`

### Remote (Cloudflare Tunnel)
```bash
cloudflared tunnel --url http://127.0.0.1:18789 --no-autoupdate
```
Then access `https://<tunnel-url>/ui/goddard.html`

**Note:** Add the tunnel URL to `gateway.controlUi.allowedOrigins` in your OpenClaw config.

## Features
- Real-time gateway status with WebSocket connection
- Session list with topic names and context usage
- Cron job management (view, run, enable/disable)
- Channel status (Telegram, WhatsApp, BlueBubbles)
- Market hours bar with progress indicator
- Quick action buttons for report generation
- Mobile responsive with sidebar toggle
- Dark theme matching OpenClaw aesthetic
