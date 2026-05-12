-- Avatar Customization Options Catalog
-- Similar to item_catalog for furniture, this allows managing avatar options via Supabase

-- Create the table
CREATE TABLE IF NOT EXISTS avatar_customization_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL CHECK (category IN ('body', 'outfit', 'shoes', 'skin')),
    gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'neutral')),
    option_key TEXT NOT NULL,
    display_name TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    texture_url TEXT, -- Optional: direct texture URL if different from computed path
    is_premium BOOLEAN DEFAULT FALSE,
    coin_price INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(category, gender, option_key)
);

-- Enable RLS
ALTER TABLE avatar_customization_options ENABLE ROW LEVEL SECURITY;

-- Everyone can read options (needed for editor)
CREATE POLICY "Anyone can view avatar options"
    ON avatar_customization_options
    FOR SELECT
    USING (is_active = true);

-- Only authenticated users with admin role can modify (future admin panel)
-- For now, manage via Supabase dashboard

-- Create index for fast lookups
CREATE INDEX idx_avatar_options_category_gender 
    ON avatar_customization_options(category, gender) 
    WHERE is_active = true;

-- ===========================================
-- SEED DATA: Current options
-- ===========================================

-- Body/Gender options
INSERT INTO avatar_customization_options (category, gender, option_key, display_name, thumbnail_url, sort_order) VALUES
    ('body', 'male', 'male', 'Male', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_body_male.png', 1),
    ('body', 'female', 'female', 'Female', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_body_female.png', 2);

-- Outfit options (male)
INSERT INTO avatar_customization_options (category, gender, option_key, display_name, thumbnail_url, sort_order) VALUES
    ('outfit', 'male', '1', 'Outfit 1', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_outfit_male_1.png', 1),
    ('outfit', 'male', '2', 'Outfit 2', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_outfit_male_2.png', 2),
    ('outfit', 'male', '3', 'Outfit 3', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_outfit_male_3.png', 3),
    ('outfit', 'male', '4', 'Outfit 4', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_outfit_male_4.png', 4);

-- Outfit options (female)
INSERT INTO avatar_customization_options (category, gender, option_key, display_name, thumbnail_url, sort_order) VALUES
    ('outfit', 'female', '1', 'Outfit 1', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_outfit_female_1.png', 1),
    ('outfit', 'female', '2', 'Outfit 2', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_outfit_female_2.png', 2),
    ('outfit', 'female', '3', 'Outfit 3', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_outfit_female_3.png', 3),
    ('outfit', 'female', '4', 'Outfit 4', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_outfit_female_4.png', 4);

-- Shoes options (male)
INSERT INTO avatar_customization_options (category, gender, option_key, display_name, thumbnail_url, sort_order) VALUES
    ('shoes', 'male', '1', 'Shoes 1', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_shoes_male_1.png', 1),
    ('shoes', 'male', '2', 'Shoes 2', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_shoes_male_2.png', 2),
    ('shoes', 'male', '3', 'Shoes 3', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_shoes_male_3.png', 3),
    ('shoes', 'male', '4', 'Shoes 4', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_shoes_male_4.png', 4);

-- Shoes options (female)
INSERT INTO avatar_customization_options (category, gender, option_key, display_name, thumbnail_url, sort_order) VALUES
    ('shoes', 'female', '1', 'Shoes 1', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_shoes_female_1.png', 1),
    ('shoes', 'female', '2', 'Shoes 2', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_shoes_female_2.png', 2),
    ('shoes', 'female', '3', 'Shoes 3', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_shoes_female_3.png', 3),
    ('shoes', 'female', '4', 'Shoes 4', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_shoes_female_4.png', 4);

-- Skin tone options (male)
INSERT INTO avatar_customization_options (category, gender, option_key, display_name, thumbnail_url, sort_order) VALUES
    ('skin', 'male', '1', 'Light', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_skin_male_1.png', 1),
    ('skin', 'male', '2', 'Medium', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_skin_male_2.png', 2),
    ('skin', 'male', '3', 'Dark', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_skin_male_3.png', 3);

-- Skin tone options (female)
INSERT INTO avatar_customization_options (category, gender, option_key, display_name, thumbnail_url, sort_order) VALUES
    ('skin', 'female', '1', 'Light', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_skin_female_1.png', 1),
    ('skin', 'female', '2', 'Medium', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_skin_female_2.png', 2),
    ('skin', 'female', '3', 'Dark', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_skin_female_3.png', 3);
