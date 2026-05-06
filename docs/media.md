# Media And Streaming

Roomie uses Agora by default through a small provider surface in `web/src/media`.

## Channel Names

- Room voice and avatar TV-head video: `roomie-room-<room-code>-voice`
- Direct 1:1 calls: `roomie-call-<call-id>`
- Personal-room group calls: `roomie-personal-<room-slug>-video`
- Theater streams: `roomie-theater-<room-slug>-stream`

## Token Flow

The app requests channel-scoped tokens from `supabase/functions/agora-token`.

1. Browser/native client sends authenticated request with `channelName`, `uid`, and `role`.
2. Edge Function validates the Supabase user.
3. Edge Function signs an Agora RTC token with `AGORA_APP_CERTIFICATE`.
4. Client joins Agora with the returned token.

If the token endpoint is not configured, the app falls back to tokenless joins for local Agora projects that allow them. Production should use App Certificate tokens.

## Provider Surface

New media work should target `MediaProvider`, `MediaSession`, `MediaTrackState`, and `RoomieMediaConfig`. The default implementation is `AgoraMediaProvider`.

`MediaSession` owns join/leave cleanup, audio/video publish controls, remote subscribe/play helpers, token renewal, and remote user/connection callbacks. Room voice, avatar TV-head video, direct calls, personal-room group video, and theater streaming should all enter Agora through the provider surface. `web/src/voice/agoraManager.ts` is now a compatibility adapter over `defaultMediaProvider`; keep new media code out of legacy Agora-specific service files.

The only frontend file that should import `agora-rtc-sdk-ng` is `web/src/media/agoraMediaProvider.ts`. Treat any new direct SDK import outside that layer as release-blocking unless it is part of a provider implementation.
