-- =====================================================================
-- Avatar Customization Expansion
-- Adds: hair styles, hair colors, costumes (bear + ninja),
--        purchase gating, streak-based unlocks
-- Uses existing user_inventory table for ownership tracking
-- =====================================================================

-- 1. Expand category CHECK on avatar_customization_options
ALTER TABLE avatar_customization_options
  DROP CONSTRAINT IF EXISTS avatar_customization_options_category_check;

ALTER TABLE avatar_customization_options
  ADD CONSTRAINT avatar_customization_options_category_check
  CHECK (category IN ('body', 'outfit', 'shoes', 'skin', 'hair', 'hair_color', 'costume'));

-- 2. Add new columns for costumes and unlock system
ALTER TABLE avatar_customization_options
  ADD COLUMN IF NOT EXISTS costume_head_url TEXT,
  ADD COLUMN IF NOT EXISTS costume_body_url TEXT,
  ADD COLUMN IF NOT EXISTS costume_feet_url TEXT,
  ADD COLUMN IF NOT EXISTS unlock_type TEXT NOT NULL DEFAULT 'free'
    CHECK (unlock_type IN ('free', 'purchase', 'streak', 'achievement')),
  ADD COLUMN IF NOT EXISTS unlock_value INT DEFAULT 0;

-- 3. Extend user_inventory to support avatar items
-- The existing item_id FK references "items" (furniture catalog).
-- Add avatar_item_id FK to reference avatar_customization_options.
-- Exactly one should be set per row.
ALTER TABLE user_inventory
  ALTER COLUMN item_id DROP NOT NULL;

ALTER TABLE user_inventory
  ADD COLUMN IF NOT EXISTS avatar_item_id UUID REFERENCES avatar_customization_options(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'purchase'
    CHECK (source IN ('purchase', 'streak', 'achievement', 'free', 'gift'));

-- Drop the old unique constraint (user_id + item_id) so we can add a broader one
ALTER TABLE user_inventory
  DROP CONSTRAINT IF EXISTS user_inventory_user_id_item_id_key;

-- Add unique constraints for each item type
CREATE UNIQUE INDEX IF NOT EXISTS user_inventory_furniture_unique
  ON user_inventory (user_id, item_id) WHERE item_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_inventory_avatar_unique
  ON user_inventory (user_id, avatar_item_id) WHERE avatar_item_id IS NOT NULL;

-- =====================================================================
-- 4. PURCHASE RPC
-- Atomically: check balance → deduct coins → add to inventory
-- =====================================================================
CREATE OR REPLACE FUNCTION purchase_avatar_item(
  p_user_id UUID,
  p_item_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_balance INT;
  v_already_owned BOOLEAN;
BEGIN
  -- Validate item exists and is purchasable
  SELECT * INTO v_item
  FROM avatar_customization_options
  WHERE id = p_item_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item not found');
  END IF;

  IF v_item.unlock_type != 'purchase' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item is not purchasable');
  END IF;

  -- Check if already owned
  SELECT EXISTS(
    SELECT 1 FROM user_inventory
    WHERE user_id = p_user_id AND avatar_item_id = p_item_id
  ) INTO v_already_owned;

  IF v_already_owned THEN
    RETURN jsonb_build_object('success', true, 'already_owned', true);
  END IF;

  -- Check balance
  SELECT COALESCE(balance, 0) INTO v_balance
  FROM user_coins WHERE user_id = p_user_id;

  IF v_balance < v_item.coin_price THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient coins',
      'balance', v_balance,
      'price', v_item.coin_price
    );
  END IF;

  -- Deduct coins
  UPDATE user_coins
  SET balance = balance - v_item.coin_price,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- Log transaction
  INSERT INTO transactions (user_id, currency_type, amount, balance_after, transaction_type, metadata)
  VALUES (p_user_id, 'coins', -v_item.coin_price, v_balance - v_item.coin_price, 'purchase',
    jsonb_build_object('avatar_item', v_item.display_name, 'item_id', p_item_id));

  -- Grant item via user_inventory
  INSERT INTO user_inventory (user_id, avatar_item_id, source)
  VALUES (p_user_id, p_item_id, 'purchase')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_balance - v_item.coin_price,
    'item_name', v_item.display_name
  );
END;
$$;

-- =====================================================================
-- 5. STREAK UNLOCK RPC
-- Auto-grants items when streak thresholds are met
-- =====================================================================
CREATE OR REPLACE FUNCTION check_and_grant_streak_unlocks(
  p_user_id UUID,
  p_streak INT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_newly_unlocked jsonb := '[]'::jsonb;
BEGIN
  FOR v_item IN
    SELECT aco.id, aco.display_name, aco.category, aco.option_key, aco.unlock_value
    FROM avatar_customization_options aco
    WHERE aco.unlock_type = 'streak'
      AND aco.unlock_value <= p_streak
      AND aco.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM user_inventory ui
        WHERE ui.user_id = p_user_id AND ui.avatar_item_id = aco.id
      )
  LOOP
    INSERT INTO user_inventory (user_id, avatar_item_id, source)
    VALUES (p_user_id, v_item.id, 'streak')
    ON CONFLICT DO NOTHING;

    v_newly_unlocked := v_newly_unlocked || jsonb_build_object(
      'id', v_item.id,
      'name', v_item.display_name,
      'category', v_item.category,
      'option_key', v_item.option_key
    );
  END LOOP;

  RETURN jsonb_build_object(
    'unlocked', v_newly_unlocked,
    'count', jsonb_array_length(v_newly_unlocked)
  );
END;
$$;

-- =====================================================================
-- 6. GET USER AVATAR ITEMS RPC
-- Returns all avatar_item_ids the user owns (for editor gating)
-- =====================================================================
CREATE OR REPLACE FUNCTION get_user_unlocked_items(p_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN COALESCE(
    (SELECT jsonb_agg(avatar_item_id)
     FROM user_inventory
     WHERE user_id = p_user_id AND avatar_item_id IS NOT NULL),
    '[]'::jsonb
  );
END;
$$;

-- =====================================================================
-- 7. SEED DATA — new outfits, shoes, hair, costumes
-- =====================================================================

-- R2 thumbnail base
-- https://example.com/roomie-assets/avatars/thumbnails/

-- ---- New outfit options (5-6 male free, 5-6+8 female free) ----
-- Note: outfit 7 is the streak reward t-shirt (see below)
INSERT INTO avatar_customization_options
  (category, gender, option_key, display_name, thumbnail_url, sort_order, unlock_type, unlock_value)
VALUES
  ('outfit', 'male', '5', 'Outfit 5', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_outfit_male_5.png', 5, 'free', 0),
  ('outfit', 'male', '6', 'Outfit 6', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_outfit_male_6.png', 6, 'free', 0),
  ('outfit', 'female', '5', 'Outfit 5', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_outfit_female_5.png', 5, 'free', 0),
  ('outfit', 'female', '6', 'Outfit 6', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_outfit_female_6.png', 6, 'free', 0),
  ('outfit', 'female', '8', 'Outfit 8', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_outfit_female_8.png', 8, 'free', 0)
ON CONFLICT (category, gender, option_key) DO NOTHING;

-- ---- New shoe options (5-6 for both genders) ----
INSERT INTO avatar_customization_options
  (category, gender, option_key, display_name, thumbnail_url, sort_order, unlock_type, unlock_value)
VALUES
  ('shoes', 'male', '5', 'Shoes 5', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_shoes_male_5.png', 5, 'free', 0),
  ('shoes', 'male', '6', 'Shoes 6', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_shoes_male_6.png', 6, 'free', 0),
  ('shoes', 'female', '5', 'Sandals 1', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_shoes_female_5.png', 5, 'free', 0),
  ('shoes', 'female', '6', 'Sandals 2', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_shoes_female_6.png', 6, 'free', 0)
ON CONFLICT (category, gender, option_key) DO NOTHING;

-- ---- Fix existing hair color names if they were inserted with old order ----
UPDATE avatar_customization_options SET display_name = 'Brown'  WHERE category = 'hair_color' AND option_key = '1';
UPDATE avatar_customization_options SET display_name = 'Blonde' WHERE category = 'hair_color' AND option_key = '2';
UPDATE avatar_customization_options SET display_name = 'Black'  WHERE category = 'hair_color' AND option_key = '3';

-- ---- Remove unused hairstyle 5 if it exists from a previous run ----
DELETE FROM avatar_customization_options WHERE category = 'hair' AND option_key = '5';

-- ---- Hair Color options (1=Brown, 2=Blonde, 3=Black) ----
INSERT INTO avatar_customization_options
  (category, gender, option_key, display_name, thumbnail_url, sort_order, unlock_type, unlock_value)
VALUES
  ('hair_color', 'neutral', '1', 'Brown',  'https://example.com/roomie-assets/avatars/thumbnails/thumb_hairColor_1.png', 1, 'free', 0),
  ('hair_color', 'neutral', '2', 'Blonde', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_hairColor_2.png', 2, 'free', 0),
  ('hair_color', 'neutral', '3', 'Black',  'https://example.com/roomie-assets/avatars/thumbnails/thumb_hairColor_3.png', 3, 'free', 0)
ON CONFLICT (category, gender, option_key) DO NOTHING;

-- ---- Hairstyle options (4 per gender) ----
INSERT INTO avatar_customization_options
  (category, gender, option_key, display_name, thumbnail_url, sort_order, unlock_type, unlock_value)
VALUES
  ('hair', 'male', '1', 'Default',   'https://example.com/roomie-assets/avatars/thumbnails/thumb_hair_male_1.png', 1, 'free', 0),
  ('hair', 'male', '2', 'Fade',      'https://example.com/roomie-assets/avatars/thumbnails/thumb_hair_male_2.png', 2, 'free', 0),
  ('hair', 'male', '3', 'Curly',     'https://example.com/roomie-assets/avatars/thumbnails/thumb_hair_male_3.png', 3, 'free', 0),
  ('hair', 'male', '4', 'Long',      'https://example.com/roomie-assets/avatars/thumbnails/thumb_hair_male_4.png', 4, 'free', 0),
  ('hair', 'female', '1', 'Default',  'https://example.com/roomie-assets/avatars/thumbnails/thumb_hair_female_1.png', 1, 'free', 0),
  ('hair', 'female', '2', 'Braids',   'https://example.com/roomie-assets/avatars/thumbnails/thumb_hair_female_2.png', 2, 'free', 0),
  ('hair', 'female', '3', 'Ponytail', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_hair_female_3.png', 3, 'free', 0),
  ('hair', 'female', '4', 'Short',    'https://example.com/roomie-assets/avatars/thumbnails/thumb_hair_female_4.png', 4, 'free', 0)
ON CONFLICT (category, gender, option_key) DO NOTHING;

-- ---- Costumes ----
INSERT INTO avatar_customization_options
  (category, gender, option_key, display_name, thumbnail_url,
   costume_head_url, costume_body_url, costume_feet_url,
   is_premium, coin_price, sort_order, unlock_type, unlock_value)
VALUES
  ('costume', 'neutral', 'ninja', 'Ninja', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_costume_ninja.png',
   'https://example.com/roomie-assets/avatars/Costumes/ninja_head.jpg',
   'https://example.com/roomie-assets/avatars/Costumes/ninja_body.jpg',
   'https://example.com/roomie-assets/avatars/Costumes/ninja_feet.jpg',
   true, 250, 1, 'purchase', 0),
  ('costume', 'neutral', 'bear', 'Bear', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_costume_bear.png',
   'https://example.com/roomie-assets/avatars/Costumes/bear_head.jpg',
   'https://example.com/roomie-assets/avatars/Costumes/bear_body.jpg',
   'https://example.com/roomie-assets/avatars/Costumes/bear_feet.jpg',
   true, 500, 2, 'purchase', 0)
ON CONFLICT (category, gender, option_key) DO NOTHING;

-- ---- Streak-unlockable outfit 7 (logo tee, 7-day streak) ----
-- option_key '7' maps to body_{gender}_outfit7_skinTone{t}.jpg on R2
-- Clean up old keys from previous runs
DELETE FROM avatar_customization_options WHERE category = 'outfit' AND option_key = 'logo';
DELETE FROM avatar_customization_options WHERE category = 'outfit' AND option_key = '7' AND gender IN ('male', 'female');

INSERT INTO avatar_customization_options
  (category, gender, option_key, display_name, thumbnail_url,
   is_premium, coin_price, sort_order, unlock_type, unlock_value)
VALUES
  ('outfit', 'neutral', '7', 'Logo Tee', 'https://example.com/roomie-assets/avatars/thumbnails/thumb_outfit_male_7.png',
   true, 0, 7, 'streak', 7)
ON CONFLICT (category, gender, option_key) DO UPDATE
  SET display_name = 'Logo Tee', unlock_type = 'streak', unlock_value = 7, is_premium = true;

