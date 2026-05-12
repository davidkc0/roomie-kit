# Repository Structure

```text
.
  web/                         Vite React app
  web/src/media/               Provider-based voice/video/livestream layer
  web/src/components/streaming Theater and personal-room streaming UI
  web/src/world/               Babylon.js room and avatar rendering
  web/public/                  Local starter assets served by Vite
  supabase/                    Migrations, config, and Edge Functions
  docs/                        Documentation
```

Important areas:

- `web/src/media`: default Agora provider and shared media session API.
- `web/src/pages/Room.tsx`: main virtual room experience.
- `web/src/avatars`: avatar texture and configuration helpers.
- `web/public/roomie-local`: empty local override folders for customer assets.
- `supabase/functions/agora-token`: core media token endpoint.
- `docs/SUMMARY.md`: documentation sidebar structure.

The virtual room is only one consumer of the realtime and media stack. Streaming-only apps can keep the media pieces and remove or ignore the room/world pieces.
