<p align="center">
  <img src="web/public/assets/roomie_kit_logo.png" alt="Roomie Kit" width="420" />
</p>

<!-- Keep these links. Translations will automatically update with the README. -->
<p align="center">
  <a href="https://zdoc.app/de/davidkc0/roomie-kit">Deutsch</a> |
  <a href="https://zdoc.app/en/davidkc0/roomie-kit">English</a> |
  <a href="https://zdoc.app/es/davidkc0/roomie-kit">Español</a> |
  <a href="https://zdoc.app/fr/davidkc0/roomie-kit">français</a> |
  <a href="https://zdoc.app/ja/davidkc0/roomie-kit">日本語</a> |
  <a href="https://zdoc.app/ko/davidkc0/roomie-kit">한국어</a> |
  <a href="https://zdoc.app/pt/davidkc0/roomie-kit">Português</a> |
  <a href="https://zdoc.app/ru/davidkc0/roomie-kit">Русский</a> |
  <a href="https://zdoc.app/zh/davidkc0/roomie-kit">中文</a>
</p>

# Roomie Kit

Roomie Kit is an MIT-licensed starter for building social virtual spaces, live rooms, avatar chat, and realtime video experiences. It ships a Vite/React app, Supabase backend, Agora media layer, Babylon.js virtual rooms, Capacitor mobile wrappers, and a local starter asset bundle.

Use it as a full virtual-room app, or lift out the media layer and use Roomie as a livestreaming/video-chat foundation without the 3D spaces.

## What You Can Build

- Avatar-based virtual rooms with realtime presence, movement, room furniture, profiles, and games.
- Voice rooms, TV-head avatar video, personal-room group video, direct 1:1 calls, and theater livestreams.
- A standalone livestreaming or video-chat app using the same `MediaProvider` layer, Supabase auth, and Agora token function.
- iOS and Android apps through Capacitor.
- Optional product systems such as waitlist, invites, economy, gifts, daily rewards, push, and payments.

## Tech Stack

- [React](https://react.dev/) + [Vite](https://vite.dev/guide/)
- [Supabase](https://supabase.com/docs) for auth, Postgres, realtime data, migrations, and Edge Functions
- [Agora RTC](https://docs.agora.io/en/video-calling/overview/product-overview) for voice, video, and livestream channels
- [Babylon.js](https://doc.babylonjs.com/) for the 3D rooms
- [Capacitor](https://capacitorjs.com/docs) for native iOS/Android wrappers
- [Git LFS](https://git-lfs.com/) for bundled GLB/image/audio/WASM assets

## Repository Layout

```text
.
  web/                         Vite React app
  web/src/media/               Provider-based voice/video/livestream layer
  web/src/components/streaming Theater and personal-room streaming UI
  web/src/world/               Babylon.js room and avatar rendering
  web/public/                  Local starter assets served by Vite
  supabase/                    Migrations, config, and Edge Functions
  docs/                        Setup, release, media, mobile, and module docs
```

## Quickstart

Clone with Git LFS enabled so the bundled starter assets download correctly:

```bash
git lfs install
git clone <your-roomie-kit-repo-url>
cd roomie-kit
git lfs pull
```

Install dependencies:

```bash
npm install
npm --prefix web install
```

Create environment files:

```bash
cp web/.env.example web/.env
cp .env.example .env
```

Start the app:

```bash
npm run dev
```

The web app runs at [http://localhost:5173](http://localhost:5173).

## Configure Supabase

Roomie can use either a hosted Supabase project or the local Supabase stack.

For hosted Supabase, create a project in the [Supabase dashboard](https://supabase.com/dashboard), apply the migrations, deploy the Edge Functions you need, and put the project URL and anon key in `web/.env`.

For local Supabase development:

```bash
npm run supabase:start
npm run supabase:reset
npm run functions:serve
```

Copy the local API URL and anon key from `supabase status` into `web/.env`.

Useful local URLs:

- Supabase API: `http://127.0.0.1:54321`
- Supabase Studio: `http://127.0.0.1:54323`
- App: `http://localhost:5173`

More detail: [docs/supabase.md](docs/supabase.md)

## Configure Media

Agora is the default media provider. Create an Agora project, enable App Certificate if you are using token auth, then set:

```bash
# web/.env
VITE_AGORA_APP_ID=

# .env, used by Supabase Edge Functions
AGORA_APP_ID=
AGORA_APP_CERTIFICATE=
AGORA_TOKEN_TTL_SECONDS=3600
```

Deploy the core token function when using a hosted Supabase project:

```bash
npx supabase functions deploy agora-token
```

Set Edge Function secrets:

```bash
npx supabase secrets set --env-file .env
```

Roomie uses deterministic channel names for room voice, direct calls, personal-room video, and theater livestreaming. See [docs/media.md](docs/media.md).

## Modular Architecture

Roomie Kit is intentionally modular. The virtual room is one consumer of the realtime/media stack, not a hard requirement.

| Module | Paths | Required For |
| --- | --- | --- |
| Core app/auth | `web/src/pages`, `web/src/state`, `web/src/lib`, `supabase/migrations` | Login, profiles, rooms, presence |
| Media provider | `web/src/media`, `supabase/functions/agora-token` | Voice, video chat, livestreaming |
| Streaming UI | `web/src/components/streaming`, `web/src/components/VideoChatOverlay.tsx` | Theater streams, group video, direct calls |
| Virtual spaces | `web/src/world`, `web/src/pages/Room.tsx`, `web/public/rooms` | 3D avatar rooms |
| Avatars/assets | `web/src/avatars`, `web/public/avatars`, `web/public/furniture` | Avatar rooms and local starter content |
| Mobile wrappers | `web/ios`, `web/android`, `web/capacitor.config.ts` | iOS and Android builds |
| Optional product systems | waitlist, invites, economy, gifts, push, payments, cron | Product/business features |
| Games | `web/src/games` | Chess, Snake, Match-3, Hex arena |

The optional product modules are disabled by default through `web/.env` flags:

```bash
VITE_ENABLE_WAITLIST=false
VITE_ENABLE_INVITES=false
VITE_ENABLE_ECONOMY=false
VITE_ENABLE_GIFTS=false
VITE_ENABLE_DAILY_REWARDS=false
VITE_ENABLE_PUSH=false
VITE_ENABLE_PAYMENTS=false
```

More detail: [docs/backend-modules.md](docs/backend-modules.md)

## Livestreaming Without Virtual Spaces

You can use Roomie Kit as a livestreaming/video-chat starter without Babylon.js rooms.

Keep:

- `web/src/media`
- `web/src/components/streaming`
- `web/src/components/VideoChatOverlay.tsx`
- `supabase/functions/agora-token`
- any Supabase auth/profile tables you want for identity

Then ignore or remove:

- `web/src/world`
- large room/furniture assets in `web/public`
- room movement and placement UI
- games and optional product systems

Minimal publisher flow:

```ts
import { defaultMediaProvider } from './media/agoraMediaProvider';

const session = await defaultMediaProvider.join({
  channelName: 'my-live-channel',
  uid: user.id,
  role: 'publisher',
});

await session.publishAudio(true);
await session.publishCamera(true);
```

Minimal viewer flow:

```ts
const session = await defaultMediaProvider.join({
  channelName: 'my-live-channel',
  uid: user.id,
  role: 'subscriber',
});

session.onRemotePublished(async (remoteUser, kind) => {
  await session.subscribeRemote(remoteUser, kind);
  if (kind === 'video') session.playRemoteVideo(remoteUser, 'remote-video');
  if (kind === 'audio') session.playRemoteAudio(remoteUser);
});
```

That means Roomie can power a Twitch-style theater, a drop-in video chat feature, a webinar room, a creator livestream, or a private group call product without requiring users to walk around a 3D space.

## Customize Roomie Kit

Roomie Kit includes a plug-in style customization layer for branding, theme colors, and asset overrides.

Edit the single config file:

```text
web/roomie.config.json
```

Then run:

```bash
npm --prefix web run assets:refresh
```

Put local overrides in `web/public/roomie-local`. Files in that folder win automatically, and everything else falls back to `VITE_ASSET_BASE_URL`:

```text
web/public/roomie-local/branding/logo.svg
web/public/roomie-local/branding/cards/lounge.png
web/public/roomie-local/avatars/body3.glb
web/public/roomie-local/avatars/thumbnails/thumb_outfit_male_1.png
web/public/roomie-local/rooms/lounge6.glb
web/public/roomie-local/sfx/pop.mp3
```

Built-in theme templates are `roomie-neon`, `stream-dark`, `startup-blue`, `creator-pink`, and `minimal-dark`. See [docs/customization.md](docs/customization.md) for the full folder map, naming rules, and Git LFS notes.

## Assets

Starter assets are bundled locally under `web/public` and served with:

```bash
VITE_ASSET_BASE_URL=/
```

For production, you can keep the Git LFS asset bundle, move assets to a CDN/R2 bucket with the same folder layout, or publish a release asset archive. See [docs/assets.md](docs/assets.md).

Roomie-owned code and bundled starter assets are released under the MIT License unless otherwise noted. See [ASSET_LICENSES.md](ASSET_LICENSES.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Mobile

Build and copy web assets into the native shells:

```bash
npm --prefix web run build
npm --prefix web run cap:copy
```

Open native projects:

```bash
npm --prefix web run cap:ios
npm --prefix web run cap:android
```

Before release, do a short device smoke test for camera/mic prompts, room voice, livestreaming, direct calls, and background/foreground recovery. See [docs/mobile-smoke.md](docs/mobile-smoke.md).

## Useful Commands

```bash
npm run dev                 # Start Vite dev server
npm run typecheck           # TypeScript check
npm run lint                # ESLint
npm run build               # Production web build
npm run release:verify      # Hygiene + secret scan + typecheck + lint + build
npm --prefix web run cap:copy
```

## Docs

Full documentation is available at [docs.roomiekit.io](https://docs.roomiekit.io).

- [Supabase setup](docs/supabase.md)
- [Backend modules](docs/backend-modules.md)
- [Media and streaming](docs/media.md)
- [Customization](docs/customization.md)
- [Asset folders and release strategy](docs/assets.md)
- [Managed Hosting](docs/managed-hosting/overview.md)
- [CLI onboarding](docs/managed-hosting/onboarding.md)
- [Mobile setup](docs/mobile.md)
- [Mobile smoke checks](docs/mobile-smoke.md)
- [Release checklist](docs/release.md)

External docs:

- [Supabase local development](https://supabase.com/docs/guides/local-development)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Agora video calling docs](https://docs.agora.io/en/video-calling/overview/product-overview)
- [Agora token authentication workflow](https://docs.agora.io/en/video-calling/get-started/authentication-workflow)
- [Capacitor docs](https://capacitorjs.com/docs)
- [Babylon.js docs](https://doc.babylonjs.com/)
- [Vite docs](https://vite.dev/guide/)

## Release Checklist

- Run `npm run release:verify`.
- Confirm `git lfs ls-files` includes bundled GLB, image, audio, Rive, MediaPipe, and WASM assets.
- Confirm there are no `.env`, `.temp`, `.pnpm-store`, `web/dist`, Pods, `.DS_Store`, or copied Capacitor web assets in Git.
- Rotate any credentials that ever existed in a private source history.
- Verify the local asset license manifest and third-party notices.
- Smoke test two-browser media and native camera/mic behavior before tagging.

## License

MIT. See [LICENSE](LICENSE).
