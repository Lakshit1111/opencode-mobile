# OpenCode Mobile

A mobile companion app for your local OpenCode AI agent. Monitor sessions, view real-time progress, send messages, and respond to permissions — all from your phone.

## Architecture

```
┌─────────────────┐      Wi-Fi / Network      ┌──────────────────┐     localhost      ┌────────────────┐
│   Mobile App    │  ◄──────────────────────► │  Mobile Bridge   │  ◄───────────────► │ OpenCode Server│
│  (Expo / RN)    │    REST + SSE (Auth)      │  Port 3456        │    REST + SSE      │ (opencode serve)│
└─────────────────┘                            │  + Toggle Panel   │                    │ Port 8765      │
                                                └──────────────────┘                    └────────────────┘
```

- **Mobile Bridge**: Node.js proxy that adds authentication, CORS, and SSE relay
- **OpenCode Server**: Your existing OpenCode agent running in headless mode
- **Mobile App**: Expo (React Native) app for iOS/Android

## Quick Start

### 1. Start OpenCode Server

On your laptop, start OpenCode in headless mode with a fixed port:

```bash
opencode serve --port 8765 --hostname 127.0.0.1
```

Or just run `opencode` normally — the bridge connects to `localhost:8765` by default. If you want to use a different port, update `mobile-bridge/config.json`.

> **Note**: The `server` block in `~/.config/opencode/opencode.jsonc` has been updated with `port: 8765` and CORS settings. Restart OpenCode for changes to take effect.

### 2. Start Mobile Bridge

```bash
cd mobile-bridge
npm start
```

On first run, it will generate an API key and print it:

```
============================================================
  GENERATED NEW API KEY
  Enter this key in your mobile app:

  oc-mobile-a1b2c3d4e5f6...
============================================================
```

Open `http://localhost:3456` in your browser to access the **Toggle Control Panel** — you can enable/disable the bridge and see connected devices.

### 3. Run Mobile App

```bash
cd mobile-app
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app on your phone.

### 4. Connect

In the mobile app:
1. Enter your laptop's **IP address** (shown in the bridge console, e.g. `http://192.168.1.100:3456`)
2. Enter the **API key** (from the bridge console or control panel)
3. Tap **Connect**

You should see your active OpenCode sessions appear in the dashboard.

## Features

### Mobile App
- **Dashboard**: View all active sessions with live status badges (Idle/Busy/Retry)
- **Live Session View**: Real-time streaming of:
  - AI reasoning/thinking steps
  - Tool calls (running, completed, errored)
  - Text responses
  - File edits
  - Todo list progress
- **Send Messages**: Type and send prompts to any session
- **Permission Responses**: Approve/deny permission requests from your phone
- **Question Responses**: Answer OpenCode's questions remotely
- **Auto-reconnect**: SSE events reconnect automatically on disconnect

### Mobile Bridge
- **Web Toggle Panel**: Browser-based ON/OFF switch at `http://<laptop-ip>:3456`
- **Authentication**: Bearer token required on all API endpoints
- **IP Allowlisting**: Restrict access by IP pattern (default: `*` = all)
- **Connection Limit**: Max simultaneous mobile clients (default: 5)
- **SSE Relay**: Fans out OpenCode events to all connected clients
- **Config Persistence**: API key and settings saved to `config.json`

## Configuration

### Bridge Config (`mobile-bridge/config.json`)

```json
{
  "apiKey": "oc-mobile-...",       // Auto-generated on first run
  "allowedIPs": ["*"],             // IP patterns (* = wildcard)
  "maxConnections": 5,             // Max simultaneous mobile clients
  "bridgePort": 3456,              // Port the bridge listens on
  "opencodeBaseUrl": "http://127.0.0.1:8765",  // OpenCode server URL
  "autoStartBridge": true          // Start with bridge enabled
}
```

### OpenCode Config (`~/.config/opencode/opencode.jsonc`)

```jsonc
{
  "server": {
    "port": 8765,
    "hostname": "127.0.0.1",
    "cors": ["http://localhost:3456"]
  }
}
```

## API Endpoints (Bridge)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/health` | GET | Yes | Bridge + OpenCode health check |
| `/api/bridge/status` | GET | Yes | Bridge status, connected clients |
| `/api/bridge/toggle` | POST | Yes | Toggle bridge ON/OFF |
| `/api/config` | GET/PUT | Yes | View/update bridge config |
| `/api/events` | GET (SSE) | Yes | Real-time event stream |
| `/api/sync-events` | GET (SSE) | Yes | Aggregated sync event stream |
| `/api/opencode/*` | ALL | Yes | Proxied to OpenCode server |
| `/` | GET | No | Web toggle control panel |

## Project Structure

```
opencode app/
├── mobile-bridge/              # Node.js proxy server
│   ├── index.js                # Express server + auth + SSE relay
│   ├── config.json             # Auto-generated config (api key, ports)
│   ├── package.json
│   └── public/
│       └── index.html          # Web toggle control panel
├── mobile-app/                 # Expo React Native app
│   ├── App.tsx                 # Navigation + root
│   ├── index.js                # Entry point
│   ├── package.json
│   ├── app.json
│   ├── tsconfig.json
│   └── src/
│       ├── api/
│       │   ├── client.ts       # REST API client
│       │   └── sse.ts          # SSE event manager
│       ├── store/
│       │   └── appStore.ts     # Zustand state management
│       ├── screens/
│       │   ├── ConnectScreen.tsx
│       │   ├── DashboardScreen.tsx
│       │   └── SessionScreen.tsx
│       ├── components/
│       │   ├── SessionCard.tsx
│       │   ├── MessagePart.tsx
│       │   ├── PermissionCard.tsx
│       │   ├── QuestionCard.tsx
│       │   └── TodoList.tsx
│       ├── types/
│       │   └── opencode.ts     # TypeScript types (mirrors SDK)
│       └── constants/
│           └── theme.ts        # Colors, spacing, etc.
```

## Troubleshooting

- **Can't connect from phone**: Make sure both devices are on the same Wi-Fi network. Check that Windows Firewall allows connections on port 3456.
- **"Unauthorized" error**: Double-check the API key matches between the bridge config and the mobile app.
- **"Bridge disabled" error**: Open `http://<laptop-ip>:3456` in your browser and toggle the bridge ON.
- **No sessions appearing**: Make sure OpenCode is running with `opencode serve` or `opencode` in TUI mode, and the bridge is connected to the correct port.
- **Events not streaming**: The bridge connects to OpenCode's SSE endpoint. If OpenCode isn't running, events won't flow.