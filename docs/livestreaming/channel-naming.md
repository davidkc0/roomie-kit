# Channel Naming

Roomie uses deterministic Agora channel names so clients and Edge Functions agree on the room/session scope.

Current patterns:

- Room voice and avatar TV-head video: `roomie-room-<room-code>-voice`
- Direct 1:1 calls: `roomie-call-<call-id>`
- Personal-room group calls: `roomie-personal-<room-slug>-video`
- Theater streams: `roomie-theater-<room-slug>-stream`

Keep names stable across clients, token requests, and presence records. If you change a channel pattern, update both frontend joins and token validation assumptions together.
