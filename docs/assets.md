# Asset Folders

By default `VITE_ASSET_BASE_URL=/`, so Vite serves assets from `web/public`.

Copy your R2 asset export into these folders:

```text
web/public/
  avatars/
    body3.glb
    Body/
    Costumes/
    Feet/
    Head/
  animations/
    idle.glb
    walk.glb
    dance.glb
    wave.glb
    thumbs-up.glb
    thumbs-down.glb
  emotes/
    angry.glb
    angry.png
    cool.glb
    cool.png
    crying.glb
    crying.png
    evil.glb
    evil.png
    gross.glb
    gross.png
    laugh.glb
    laugh.png
    sad.glb
    sad.png
  rooms/
    lounge5.glb
    lounge6.glb
    theater2.glb
  furniture/
    Chair.glb
    Table.glb
    Couch.glb
    Lamp.glb
    arcade_machine.glb
    armchair.glb
    basic_bed.glb
    basic_shelf.glb
    black_armchair.glb
    black_corner_desk.glb
    black_sectional.glb
    bunk_bed.glb
    chick_plushy.glb
    desk_chair.glb
    dope_desk.glb
    floral_bed.glb
    goofy_ahh_chair.glb
    hipster_desk.glb
    large_bed.glb
    large_beige_bed.glb
    large_beige_sectional.glb
    lounge_chair.glb
    minimalist_corner_desk.glb
    openBookcase.glb
    pink_armchair.glb
    pink_sectionial.glb
    plank_table.glb
    purple_bean_bag_chair.glb
    purple_loveseat.glb
    rugRectangle.glb
    simle_chair.glb
    simple_desk.glb
    simple_table.glb
    white_coffee_table.glb
    wooden_cupboard.glb
  floor/
    wood_floor_worn_diff_4k.jpg
  wall/
  assets/
    gifts.riv
    gem_sprite_sheet.png
  sfx/
  mediapipe/
  call.glb
  cartoon_tv.glb
  hexagon.glb
```

Avatar texture filenames are generated from avatar config:

- `avatars/Head/head_<gender>_skinTone<tone>_hairColor<color>_hairstyle<style>.jpg`
- `avatars/Body/body_<gender>_outfit<outfit>_skinTone<tone>.jpg`
- `avatars/Feet/feet_<gender><feet>.jpg`
- `avatars/Feet/feet_female5_skinTone<tone>.jpg`
- `avatars/Feet/feet_female6_skinTone<tone>.jpg`
- `avatars/Costumes/<costume>_head.jpg`
- `avatars/Costumes/<costume>_body.jpg`
- `avatars/Costumes/<costume>_feet.jpg`

If you prefer CDN/R2 hosting, keep the same folder layout at the bucket root and set `VITE_ASSET_BASE_URL=https://your-cdn.example.com`.

## Local Overrides

Customer overrides should go in `web/public/roomie-local`, not directly over the starter bundle. The app scans this folder before dev/build/typecheck/lint and generates `web/src/generated/roomie-customization.generated.ts`.

Example:

```text
web/public/roomie-local/avatars/body3.glb
web/public/roomie-local/branding/logo.svg
web/public/roomie-local/rooms/lounge6.glb
```

Those files resolve as `/roomie-local/...`. Missing files fall back to `VITE_ASSET_BASE_URL` with the same canonical key. See [customization.md](customization.md) for the full naming contract.

## Public Release Packaging

The starter keeps required assets in `web/public` so a fresh clone can run without a CDN. Before publishing, choose one binary distribution path and document it in the release notes:

- Git LFS: keep the same folder layout and add the files only after `git lfs install` is active in the fresh public repository. `.gitattributes` already marks GLB, image, audio, Rive, and WASM files for LFS.
- Release bundle: remove large binaries from Git, publish a versioned asset archive, and tell users to extract it into `web/public`.
- Hosted assets: keep `web/public` to a minimal demo bundle and set `VITE_ASSET_BASE_URL` to an R2/CDN origin with the same object keys.

Do not commit `web/dist`, copied Capacitor web assets, Pods, package-manager stores, or temporary asset sync manifests. Complete `ASSET_LICENSES.md` before redistributing any bundled GLB, texture, audio, Rive, MediaPipe, or generated asset.

The current local bundle is about 335 MB. For GitHub, the recommended default is Git LFS for the bundled starter assets; use a release asset bundle only if you want the Git checkout itself to stay small.
