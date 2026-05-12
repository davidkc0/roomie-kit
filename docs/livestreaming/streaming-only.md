# Streaming Without Virtual Spaces

You can use Roomie Kit as a livestreaming or video-chat starter without Babylon.js rooms.

Keep:

- `web/src/media`
- `web/src/components/streaming`
- `web/src/components/VideoChatOverlay.tsx`
- `supabase/functions/agora-token`
- Supabase auth/profile tables for identity

Ignore or remove:

- `web/src/world`
- large room/furniture assets in `web/public`
- room movement and placement UI
- games and optional product systems

## Publisher Flow

```ts
import { defaultMediaProvider } from "./media/agoraMediaProvider";

const session = await defaultMediaProvider.join({
  channelName: "my-live-channel",
  uid: user.id,
  role: "publisher",
});

await session.publishAudio(true);
await session.publishCamera(true);
```

## Viewer Flow

```ts
const session = await defaultMediaProvider.join({
  channelName: "my-live-channel",
  uid: user.id,
  role: "subscriber",
});

session.onRemotePublished(async (remoteUser, kind) => {
  await session.subscribeRemote(remoteUser, kind);
  if (kind === "video") session.playRemoteVideo(remoteUser, "remote-video");
  if (kind === "audio") session.playRemoteAudio(remoteUser);
});
```

For provider details, see [Media and streaming](../media.md).
