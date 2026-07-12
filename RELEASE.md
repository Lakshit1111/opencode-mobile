# Release Guide

This document describes the process for releasing updates to the OpenCode Mobile app and bridge.

## Prerequisites

- EAS CLI installed and logged in (`eas login`)
- Inno Setup installed (`winget install JRSoftware.InnoSetup`)
- GitHub CLI installed (`gh auth login`)
- Node.js installed
- Both `mobile-app` and `mobile-bridge` dependencies installed (`npm ci`)

## Version numbers

All three version numbers should stay in sync for each release:

| File | Field |
|---|---|
| `mobile-app/app.json` | `expo.version` |
| `mobile-app/package.json` | `version` |
| `mobile-bridge/package.json` | `version` |

Example: for a `1.0.1` release, set all three to `"1.0.1"`.

## Release steps

### 1. Bump versions

```bash
# mobile-app/app.json -> "version": "1.0.1"
# mobile-app/package.json -> "version": "1.0.1"
# mobile-bridge/package.json -> "version": "1.0.1"
```

### 2. Commit and push

```bash
git add -A
git commit -m "Release v1.0.1"
git push origin master
```

### 3. Build the production APK

```bash
cd mobile-app
eas build -p android --profile production --non-interactive
```

Wait for the build to finish (~10 min). EAS prints a download URL.

Download the APK:
```bash
# Replace <BUILD_ID> with the actual build ID from the output
eas build:view <BUILD_ID> --json
# Copy the artifacts.buildUrl and download it
```

Save the APK to the repo root:
```
opencode-mobile-<version>.apk
```

### 4. Build the bridge installer (if bridge changed)

```bash
# Sync bridge files into installer payload
Copy-Item mobile-bridge/index.js mobile-bridge/installer/payload/bridge/index.js -Force
Copy-Item mobile-bridge/public/index.html mobile-bridge/installer/payload/bridge/public/index.html -Force
Copy-Item mobile-bridge/package.json mobile-bridge/installer/payload/bridge/package.json -Force

# Sync production node_modules
cd mobile-bridge
npm ci --omit=dev
robocopy node_modules installer/payload/bridge/node_modules /E /NFL /NDL /NJH /NJS
cd ..

# Copy the new APK into the payload
Copy-Item opencode-mobile-<version>.apk mobile-bridge/installer/payload/apk/opencode-mobile.apk -Force

# Compile the installer
& "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe" mobile-bridge/installer/opencode-bridge.iss
```

Output: `mobile-bridge/installer/Output/opencode-bridge-setup-<version>.exe`

### 5. Tag the release

```bash
git tag -a v<version> -m "Release v<version>: <short description>"
git push origin v<version>
```

Example:
```bash
git tag -a v1.0.1 -m "Release v1.0.1: fix bridge auth, add API key management"
git push origin v1.0.1
```

### 6. Create a GitHub Release

```bash
gh release create v<version> \
  opencode-mobile-<version>.apk \
  mobile-bridge/installer/Output/opencode-bridge-setup-<version>.exe \
  --title "v<version>" \
  --notes "Release notes here"
```

This creates a public release page at:
`https://github.com/Lakshit1111/opencode-mobile/releases`

### 7. Verify

- Check the GitHub Release page has both assets attached
- Download the APK and install on a phone to verify
- Run the installer on a clean machine to verify the bridge service

## What gets released

| Asset | Description | Size |
|---|---|---|
| `opencode-mobile-<version>.apk` | Android app (React Native/Expo) | ~60 MB |
| `opencode-bridge-setup-<version>.exe` | Windows installer (bridge + Node + NSSM + APK) | ~43 MB |

## How users update

### App update
Users download the new APK from the GitHub Release page and install it over the old one. Android preserves app data (saved connections, settings).

### Bridge update
Users run the new `opencode-bridge-setup-<version>.exe`. Inno Setup upgrades in place:
- Stops the `OpenCodeBridge` service
- Replaces all files
- Restarts the service
- Preserves `config.json` (API key, server profiles)

## Release types

| Change type | New APK needed? | New installer needed? | OTA possible? |
|---|---|---|---|
| JS/TS code only (app) | Yes (current setup) | No | Yes (with expo-updates) |
| Native dependency added/removed | Yes | No | No |
| Permission change | Yes | No | No |
| Icon/splash change | Yes | No | No |
| Bridge code change | No | Yes | N/A |
| Bridge config schema change | No | Yes | N/A |

## Setting up OTA updates (optional, future)

To push JS-only changes without requiring users to download a new APK:

1. Install expo-updates:
```bash
cd mobile-app
npx expo install expo-updates
```

2. Add to `app.json`:
```json
"updates": {
  "url": "https://u.expo.dev/<projectId>"
},
"runtimeVersion": {
  "policy": "appVersion"
}
```

3. Configure `eas.json`:
```json
"build": {
  "production": {
    "android": { "buildType": "apk" }
  }
},
"update": {
  "production": {
    "channel": "production"
  }
}
```

4. Rebuild the APK (one-time, to include the native module).

5. Push JS updates:
```bash
eas update --branch production --message "Fix: description"
```

Users' apps auto-download the update on next launch.

## Troubleshooting

### EAS build fails
- Check `eas whoami` — must be logged in
- Check `eas.json` profile is correct
- View build logs: `eas build:view <BUILD_ID>`

### Installer compilation fails
- Check Inno Setup is installed: `Test-Path "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"`
- Check all payload files exist in `mobile-bridge/installer/payload/`
- Check `opencode-bridge.iss` paths are correct

### Bridge service won't start after install
- Check `sc.exe query OpenCodeBridge`
- Check logs: `C:\Program Files\OpenCode Bridge\logs\bridge.err.log`
- Common fix: registry `AppParameters` must be quoted (see `install-service.ps1`)

### Phone can't reach bridge
- Check Windows Firewall has an allow rule for the bridge's `node.exe` on port 3456
- Check both devices are on the same Wi-Fi
- Check router AP/client isolation is OFF
- Check `Get-NetTCPConnection -LocalPort 3456` shows the bridge listening on `0.0.0.0`

### OpenCode server returns 401
- Restart the OpenCode server: `Stop-Process -Id <PID> -Force; opencode serve --port 8765`
- Update the bridge config with the current `OPENCODE_SERVER_PASSWORD` env var
- Check `http://localhost:3456/api/health` returns `healthy: true`