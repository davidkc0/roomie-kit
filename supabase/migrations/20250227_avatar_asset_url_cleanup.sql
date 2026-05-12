-- Normalize avatar UI asset URLs so deployed starters do not request stale
-- root-level or placeholder thumbnail paths.

UPDATE public.avatar_customization_options
SET thumbnail_url = 'avatars/thumbnails/' || substring(thumbnail_url from '([^/]+)$')
WHERE thumbnail_url ~ 'thumb_.*\.png(\?.*)?$'
  AND thumbnail_url NOT LIKE 'avatars/thumbnails/%';

UPDATE public.profiles
SET profile_image_url = NULL
WHERE profile_image_url IN ('default_avatar.png', '/default_avatar.png');

UPDATE public.profiles
SET avatar_headshot_url = NULL
WHERE avatar_headshot_url IN ('default_avatar.png', '/default_avatar.png');
