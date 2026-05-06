-- Create a new private bucket for profile photos (or public if we want easy access)
-- The user plan said "public".
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile_photos', 'profile_photos', true);

-- Policy: Public can view
CREATE POLICY "Public Profiles are viewable by everyone"
ON storage.objects FOR SELECT
USING ( bucket_id = 'profile_photos' );

-- Policy: Users can upload their own photos
-- Path convention: profile_photos/{user_id}/{filename}
CREATE POLICY "Users can upload their own profile photos"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'profile_photos' AND
    auth.uid() = (storage.foldername(name))[1]::uuid
);

-- Policy: Users can update their own photos
CREATE POLICY "Users can update their own profile photos"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'profile_photos' AND
    auth.uid() = (storage.foldername(name))[1]::uuid
);

-- Policy: Users can delete their own photos
CREATE POLICY "Users can delete their own profile photos"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'profile_photos' AND
    auth.uid() = (storage.foldername(name))[1]::uuid
);
