# Group And Direct Video

Roomie Kit supports multiple video patterns through the same media provider layer:

- TV-head avatar video inside virtual rooms.
- Personal-room group video.
- Direct 1:1 calls.
- Theater livestream publisher/viewer sessions.

All new media work should use `MediaProvider` and `MediaSession` rather than importing Agora directly from feature UI.

Before launch, test:

- Two-browser join and leave.
- Camera on/off.
- Mic mute/unmute.
- Remote track cleanup.
- Token expiry and recovery.
- Browser refresh/reconnect.
- Native background/foreground recovery if mobile is enabled.
