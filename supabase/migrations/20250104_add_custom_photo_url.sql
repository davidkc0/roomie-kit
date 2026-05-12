-- Add custom_photo_url to profiles to store the uploaded photo separately from the active display URL
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS custom_photo_url TEXT;

-- Migration: For existing users with a profile_image_url, assume it's their custom photo
UPDATE public.profiles
SET custom_photo_url = profile_image_url
WHERE profile_image_url IS NOT NULL;
