# Asset License Manifest

Complete this manifest before publishing a public release. If an asset cannot be licensed for redistribution, remove it or replace it with a clearly licensed equivalent.

Current status: the starter includes a local asset bundle under `web/public` for plug-and-play development. The files were mirrored from the Roomie R2 asset bucket into the same local folder contract. Roomie owns these bundled starter assets and they are redistribution-safe. Unless otherwise noted below, bundled Roomie starter assets are released under the MIT License with the source code.

## Bundle Summary

- Local asset root: `web/public`
- File count: 376 files
- Total size: about 335 MB
- Largest areas: `avatars` about 128 MB, `rooms` about 106 MB, `mediapipe` about 22 MB, `furniture` about 15 MB
- Large files over 5 MB: `arcade_machine.glb`, `rooms/lounge4.glb`, `rooms/lounge5.glb`, `rooms/lounge6.glb`, `rooms/theater2.glb`, `floor/wood_floor_worn_diff_4k.jpg`, `wood_floor_worn_diff_4k.jpg`, and MediaPipe WASM files

| Asset Area | Path Or Host | Current Starter Status | Required Before Release |
| --- | --- | --- | --- |
| App logos and branding | `web/src/assets`, `web/public/logo_with_wordmark.svg` | Roomie-owned local files | Covered by MIT unless otherwise noted |
| Avatars and textures | `web/public/avatars` | Roomie-owned R2 mirror, local GLB/texture bundle | Covered by MIT unless otherwise noted |
| Rooms | `web/public/rooms` | Roomie-owned R2 mirror, local GLB bundle | Covered by MIT unless otherwise noted |
| Furniture | `web/public/furniture`, `web/public/arcade_machine.glb` | Roomie-owned R2 mirror, local GLB/PNG bundle | Covered by MIT unless otherwise noted |
| Floors and walls | `web/public/floor`, `web/public/wall`, root floor textures | Roomie-owned R2 mirror, local JPG/PNG bundle | Covered by MIT unless otherwise noted |
| Emotes and animations | `web/public/emotes`, `web/public/animations`, `web/public/idle.glb` | Roomie-owned R2 mirror, local GLB/PNG bundle | Covered by MIT unless otherwise noted |
| Game and UI images | root `*.png`, `web/public/assets/*.png` | Roomie-owned R2 mirror and app art | Covered by MIT unless otherwise noted |
| Audio | `web/public/sfx` | Roomie-owned bundled MP3 | Covered by MIT unless otherwise noted |
| Rive files | `web/public/assets/*.riv` | Roomie-owned bundled Rive file | Covered by MIT unless otherwise noted |
| MediaPipe | `web/public/mediapipe` | Google MediaPipe task/WASM runtime assets | Preserve upstream notices, license, and version details |
| Fonts | app/system fonts plus bundled `BowlbyOne-Regular` in build output | Dependency/build asset | Add notices if font is intentionally bundled for release |

## Release Sign-Off

Before publishing the public repo:

- Keep `THIRD_PARTY_NOTICES.md` updated for MediaPipe, fonts, SDKs, and package licenses.
- Use Git LFS or a release asset bundle for the current 335 MB `web/public` tree.
