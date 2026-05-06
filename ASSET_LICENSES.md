# Asset License Manifest

Complete this manifest before publishing a public release. If an asset cannot be licensed for redistribution, remove it or replace it with a clearly licensed equivalent.

Current status: the starter includes a local asset bundle under `web/public` for plug-and-play development. The files were mirrored from the Roomie R2 asset bucket into the same local folder contract. This manifest is structured for public release, but the final legal step is owner sign-off: confirm that Roomie owns these assets or replace any asset that came from a third party without redistribution rights.

## Bundle Summary

- Local asset root: `web/public`
- File count: 376 files
- Total size: about 335 MB
- Largest areas: `avatars` about 128 MB, `rooms` about 106 MB, `mediapipe` about 22 MB, `furniture` about 15 MB
- Large files over 5 MB: `arcade_machine.glb`, `rooms/lounge4.glb`, `rooms/lounge5.glb`, `rooms/lounge6.glb`, `rooms/theater2.glb`, `floor/wood_floor_worn_diff_4k.jpg`, `wood_floor_worn_diff_4k.jpg`, and MediaPipe WASM files

## License Decision

Roomie-owned code is MIT licensed through `LICENSE`. Assets do not automatically have to use the same license as code. For a public starter, choose one of these before tagging:

- Include Roomie-owned starter assets under MIT with the code.
- Include Roomie-owned starter assets under a separate permissive asset license, such as CC BY 4.0, and state that clearly here.
- Keep only a minimal demo asset set in Git and publish the full bundle separately with its own terms.

| Asset Area | Path Or Host | Current Starter Status | Required Before Release |
| --- | --- | --- | --- |
| App logos and branding | `web/src/assets`, `web/public/logo_with_wordmark.svg` | Roomie-specific local files | Confirm Roomie ownership or replace with starter-neutral branding |
| Avatars and textures | `web/public/avatars` | Roomie R2 mirror, local GLB/texture bundle | Confirm Roomie ownership/generation rights and selected asset license |
| Rooms | `web/public/rooms` | Roomie R2 mirror, local GLB bundle | Confirm Roomie ownership/model licenses and selected asset license |
| Furniture | `web/public/furniture`, `web/public/arcade_machine.glb` | Roomie R2 mirror, local GLB/PNG bundle | Confirm Roomie ownership/model/icon licenses and selected asset license |
| Floors and walls | `web/public/floor`, `web/public/wall`, root floor textures | Roomie R2 mirror, local JPG/PNG bundle | Confirm texture source and redistribution rights |
| Emotes and animations | `web/public/emotes`, `web/public/animations`, `web/public/idle.glb` | Roomie R2 mirror, local GLB/PNG bundle | Confirm model/animation ownership and selected asset license |
| Game and UI images | root `*.png`, `web/public/assets/*.png` | Roomie R2 mirror and app art | Confirm ownership or replace with permissive equivalents |
| Audio | `web/public/sfx` | Bundled MP3 | Confirm source and redistribution rights |
| Rive files | `web/public/assets/*.riv` | Bundled | Confirm source and redistribution rights |
| MediaPipe | `web/public/mediapipe` | Google MediaPipe task/WASM runtime assets | Preserve upstream notices, license, and version details |
| Fonts | app/system fonts plus bundled `BowlbyOne-Regular` in build output | Dependency/build asset | Add notices if font is intentionally bundled for release |

## Release Sign-Off

Before publishing the public repo:

- Remove any asset you cannot affirm as Roomie-owned or redistribution-safe.
- Keep `THIRD_PARTY_NOTICES.md` updated for MediaPipe, fonts, SDKs, and package licenses.
- Use Git LFS or a release asset bundle for the current 335 MB `web/public` tree.
