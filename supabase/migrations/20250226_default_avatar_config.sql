-- Default starter avatar texture config so rooms render a complete avatar immediately.

ALTER TABLE profiles
  ALTER COLUMN avatar_config SET DEFAULT '{
    "gender": "male",
    "skinTone": "1",
    "outfit": "1",
    "feet": "1",
    "hairColor": "1",
    "hair": "1"
  }'::jsonb;

UPDATE profiles
SET avatar_config = '{
    "gender": "male",
    "skinTone": "1",
    "outfit": "1",
    "feet": "1",
    "hairColor": "1",
    "hair": "1"
  }'::jsonb,
    updated_at = NOW()
WHERE avatar_config IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url, profile_image_url, avatar_config)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      split_part(NEW.email, '@', 1) || '_' || substr(NEW.id::text, 1, 8)
    ),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''), 'avatars/body3.glb'),
    NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''),
    COALESCE((NEW.raw_user_meta_data->'avatar_config')::jsonb, '{
      "gender": "male",
      "skinTone": "1",
      "outfit": "1",
      "feet": "1",
      "hairColor": "1",
      "hair": "1"
    }'::jsonb)
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
