# Mobile Smoke Checks

Run a native smoke test before publishing a release or shipping a customer app with mobile support.

## iOS

```bash
npm --prefix web run build
npm --prefix web run cap:copy
cd web
npx cap open ios
```

In Xcode, run `App` on a real iPhone if possible. Simulator can validate routing and layout, but camera/mic behavior is more trustworthy on device.

Check:

- Camera and microphone permission prompts appear with the Roomie usage strings.
- Login/auth callback returns to the app.
- Room voice joins and mic mute/unmute changes remote audio.
- TV-head video publishes, camera off/on updates the remote avatar, and remote video cleans up when leaving.
- Theater go-live/watch works.
- Personal-room group video works.
- Direct 1:1 call request, accept, mute/camera toggle, and end work.
- Background then foreground the app during a room session; audio/video either recover or fail visibly without trapping the user.

## Android

```bash
npm --prefix web run build
npm --prefix web run cap:copy
cd web
npx cap open android
```

In Android Studio, run on a physical Android device if possible.

Check:

- Android prompts for microphone and camera permission.
- Login/auth callback returns to the app.
- Room voice, TV-head video, theater stream, personal-room group video, and direct calls behave like web.
- App background/foreground recovery does not leave stale audio/video tracks.
- Orientation and safe-area behavior are acceptable in the main room and call overlays.

## Cleanup After Native Copy

`cap:copy` creates generated web assets inside native projects. Before committing, remove:

```bash
rm -rf web/dist web/ios/App/App/public web/android/app/src/main/assets/public
rm -f web/ios/App/App/capacitor.config.json web/android/app/src/main/assets/capacitor.config.json
```
