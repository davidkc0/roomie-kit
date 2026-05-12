# Customization

Roomie Kit has a small customization layer for changing the starter without editing app code. Use it for app naming, color templates, logos, lobby card images, avatar skins, room models, furniture, sounds, and other canonical assets.

## Quick Start

Edit:

```text
web/roomie.config.json
```

Then refresh the generated manifest:

```bash
npm --prefix web run assets:refresh
```

The refresh runs automatically before `dev`, `build`, `typecheck`, and `lint`.

Local overrides live under:

```text
web/public/roomie-local/
```

Anything you put there wins over the managed/starter asset with the same canonical key. If no local file exists, Roomie falls back to `VITE_ASSET_BASE_URL`.

## Theme File

`web/roomie.config.json` is the single editable starter customization file.

```json
{
  "appName": "Roomie",
  "themeTemplate": "roomie-neon",
  "colors": {
    "primary": "#7B2FFF",
    "secondary": "#00C9FF",
    "accent": "#FF2E9F"
  },
  "assets": {
    "logo": "branding/logo.svg",
    "logoWordmark": "branding/logo-wordmark.svg",
    "favicon": "branding/favicon.svg",
    "coinIcon": "branding/icons/coin.png",
    "lobbyCards": {
      "lounge": "branding/cards/lounge.png",
      "theater": "branding/cards/theater.png",
      "hexArena": "branding/cards/hex-arena.jpg"
    }
  }
}
```

Use relative canonical asset keys for files that should be resolved through local overrides and `VITE_ASSET_BASE_URL`. Use `/absolute-public-path.png` or `https://...` only when you intentionally want to bypass the asset resolver.

## Templates

Built-in `themeTemplate` values:

- `roomie-neon`: default Roomie purple/cyan/pink look.
- `stream-dark`: high-contrast dark UI for livestream-first products.
- `startup-blue`: calmer SaaS-style blue/cyan palette.
- `creator-pink`: warmer creator/community palette.
- `minimal-dark`: neutral monochrome UI with a cyan accent.

Any color in `colors` overrides the selected template. Supported color keys are:

```text
primary, secondary, accent,
bgBase, bgSurface, bgElevated,
border, borderSubtle,
textPrimary, textSecondary, textTertiary, textDisabled,
success, warning, error, info
```

Colors must be six-digit hex values like `#2563EB`.

## Folder Map

These folders are intentionally empty in the starter except for `.gitkeep` files:

```text
web/public/roomie-local/
  branding/
    logo.svg
    logo-wordmark.svg
    favicon.svg
    app-icon.png
    cards/
      lounge.png
      theater.png
      hex-arena.jpg
    icons/
      coin.png
      chess-logo.png
      snake-logo.png
      hex-arena-logo.png
  avatars/
    body3.glb
    Head/
    Body/
    Feet/
    Costumes/
    thumbnails/
  rooms/
  furniture/
  floor/
  wall/
  animations/
  emotes/
  assets/
  sfx/
```

Local override examples:

```text
web/public/roomie-local/avatars/body3.glb
web/public/roomie-local/rooms/lounge6.glb
web/public/roomie-local/branding/cards/theater.png
web/public/roomie-local/branding/icons/coin.png
web/public/roomie-local/sfx/pop.mp3
```

With those files present, browser requests use `/roomie-local/...`. Without them, Roomie uses `VITE_ASSET_BASE_URL` with the same key.

## Naming Rules

Branding:

```text
branding/logo.svg
branding/logo-wordmark.svg
branding/favicon.svg
branding/app-icon.png
branding/cards/lounge.png
branding/cards/theater.png
branding/cards/hex-arena.jpg
branding/icons/coin.png
branding/icons/chess-logo.png
branding/icons/snake-logo.png
branding/icons/hex-arena-logo.png
```

Avatar:

```text
avatars/body3.glb
avatars/Head/head_<gender>_skinTone<tone>_hairColor<color>_hairstyle<style>.jpg
avatars/Body/body_<gender>_outfit<outfit>_skinTone<tone>.jpg
avatars/Feet/feet_<gender><feet>.jpg
avatars/Feet/feet_female5_skinTone<tone>.jpg
avatars/Feet/feet_female6_skinTone<tone>.jpg
avatars/Costumes/<costume>_head.jpg
avatars/Costumes/<costume>_body.jpg
avatars/Costumes/<costume>_feet.jpg
avatars/thumbnails/thumb_outfit_<gender>_<id>.png
avatars/thumbnails/thumb_hair_<gender>_<id>.png
avatars/thumbnails/thumb_shoes_<gender>_<id>.png
avatars/thumbnails/thumb_skin_<gender>_<id>.png
avatars/thumbnails/thumb_costume_<id>.png
```

Rooms and world assets:

```text
rooms/lounge6.glb
rooms/theater2.glb
rooms/lounge5.glb
cartoon_tv.glb
call.glb
hexagon.glb
furniture/<existing-model-name>.glb
floor/<existing-texture-name>.jpg
wall/<existing-texture-name>.jpg
animations/idle.glb
animations/walk.glb
emotes/<emote-name>.glb
emotes/<emote-name>.png
assets/gifts.riv
assets/gem_sprite_sheet.png
sfx/pop.mp3
```

## How Fallback Works

For a canonical key like `avatars/body3.glb`, Roomie resolves in this order:

1. `web/public/roomie-local/avatars/body3.glb`
2. `${VITE_ASSET_BASE_URL}/avatars/body3.glb`

The same rule applies to room models, branding aliases, avatar textures, thumbnails, animations, furniture, SFX, and supported app assets.

`VITE_ASSET_BASE_URL=/` serves the starter bundle from `web/public`. Managed hosting points this to the Roomie asset CDN by default. You can point it at your own CDN/R2 bucket as long as the object keys match the folder map.

## Large Files

Use Git LFS for customer GLB, PNG/JPG, audio, Rive, WASM, and other large binary files:

```bash
git lfs install
git lfs track "*.glb" "*.png" "*.jpg" "*.mp3" "*.riv" "*.wasm"
```

For a managed deployment, the easiest path is usually managed CDN plus local overrides for the handful of brand/avatar/room assets that actually change.
