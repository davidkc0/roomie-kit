-- Keep starter profiles usable even when users enter a room before completing avatar setup.

ALTER TABLE profiles
  ALTER COLUMN avatar_url SET DEFAULT 'avatars/body3.glb';

UPDATE profiles
SET avatar_url = 'avatars/body3.glb',
    updated_at = NOW()
WHERE avatar_url IS NULL OR btrim(avatar_url) = '';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url, profile_image_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      split_part(NEW.email, '@', 1) || '_' || substr(NEW.id::text, 1, 8)
    ),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''), 'avatars/body3.glb'),
    NULLIF(NEW.raw_user_meta_data->>'avatar_url', '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
