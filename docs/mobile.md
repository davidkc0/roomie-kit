# Mobile Setup

Roomie ships Capacitor wrappers for iOS and Android.

## Identity

Set these in `web/.env` before syncing:

- `VITE_APP_NAME`
- `VITE_CAPACITOR_APP_ID`
- `VITE_DEEP_LINK_SCHEME`
- `VITE_APPLE_CLIENT_ID`
- `VITE_APPLE_REDIRECT_URI`

Then run:

```bash
npm --prefix web run build
npm --prefix web run cap:copy
```

## Permissions

The starter includes iOS camera and microphone usage descriptions plus Android camera, microphone, and internet permissions.

Verify camera, microphone, background/foreground recovery, and deep links on real devices before release.
