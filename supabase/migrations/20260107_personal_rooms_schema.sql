-- Migration: Personal Rooms feature
-- Features: Room customization, item catalog, inventory system
-- Created: 2026-01-07

-- 1. EXTEND ROOMS TABLE
-- Add metadata for personal vs public rooms
ALTER TABLE "rooms" 
ADD COLUMN IF NOT EXISTS "room_type" text DEFAULT 'public' CHECK (room_type IN ('public', 'personal')),
ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS "visitor_limit" integer DEFAULT 5,
ADD COLUMN IF NOT EXISTS "floor_texture_url" text DEFAULT 'wood_floor_worn_diff_4k.jpg', -- Default texture
ADD COLUMN IF NOT EXISTS "wall_color" text DEFAULT '#FFFFFF',
ADD COLUMN IF NOT EXISTS "description" text DEFAULT 'Welcome to my room!';

-- 2. CREATE ITEM CATALOG
-- Global list of available furniture, decorations, materials
CREATE TABLE IF NOT EXISTS "items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "description" text,
  "category" text NOT NULL CHECK (category IN ('furniture', 'decoration', 'floor', 'wall')),
  "model_url" text NOT NULL, -- Path in storage or external URL
  "thumbnail_url" text NOT NULL,
  "price_coins" integer DEFAULT 0,
  "is_premium" boolean DEFAULT false,
  "dimensions" jsonb DEFAULT '{"width": 1, "height": 1, "depth": 1}', -- x, y, z size in grid units
  "placement_type" text DEFAULT 'floor' CHECK (placement_type IN ('floor', 'wall', 'tabletop')),
  "created_at" timestamp with time zone DEFAULT now()
);

-- Enable RLS for items (Public Read, Admin Write)
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public items access" ON "items" FOR SELECT USING (true);


-- 3. CREATE USER INVENTORY
-- Tracks which items a user has purchased/unlocked
CREATE TABLE IF NOT EXISTS "user_inventory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid REFERENCES auth.users NOT NULL,
  "item_id" uuid REFERENCES items NOT NULL,
  "quantity" integer DEFAULT 1,
  "acquired_at" timestamp with time zone DEFAULT now(),
  UNIQUE("user_id", "item_id")
);

-- Enable RLS for inventory
ALTER TABLE "user_inventory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own inventory" ON "user_inventory" FOR SELECT USING (auth.uid() = user_id);
-- Note: Insertions handled by server-side RPCs (purchasing)


-- 4. CREATE ROOM ITEMS
-- Tracks placed instances of items within a room
CREATE TABLE IF NOT EXISTS "room_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_id" bigint REFERENCES rooms NOT NULL,
  "item_id" uuid REFERENCES items NOT NULL,
  "instance_id" text NOT NULL, -- Unique ID used by the 3D engine (uuid)
  "position" jsonb DEFAULT '{"x": 0, "y": 0, "z": 0}',
  "rotation" jsonb DEFAULT '{"x": 0, "y": 0, "z": 0}',
  "scale" jsonb DEFAULT '{"x": 1, "y": 1, "z": 1}',
  "created_at" timestamp with time zone DEFAULT now()
);

-- Enable RLS for room_items
ALTER TABLE "room_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public view room items" ON "room_items" FOR SELECT USING (true); -- Everyone can see furniture
CREATE POLICY "Owner edit room items" ON "room_items" FOR ALL USING (
  EXISTS (
    SELECT 1 FROM rooms 
    WHERE rooms.id = room_items.room_id 
    AND rooms.owner_id = auth.uid()
  )
);


-- 5. FUNCTION: AUTO-CREATE PERSONAL ROOM
-- Triggered when a new user is created in public.profiles
CREATE OR REPLACE FUNCTION handle_new_user_room()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create a default personal room for the new user
  INSERT INTO public.rooms (owner_id, name, slug, room_type, is_public, visitor_limit)
  VALUES (
    NEW.id,
    COALESCE(NEW.username, 'User') || '''s Room',
    LOWER(NEW.username), -- Slug is username
    'personal',
    true,
    5
  );
  RETURN NEW;
END;
$$;

-- Trigger definition
-- Note: This depends on 'profiles' table inserts, which usually happen on auth.users signup via another trigger.
-- Safe to attach to profiles to ensure username exists.
DROP TRIGGER IF EXISTS on_profile_created_create_room ON public.profiles;
CREATE TRIGGER on_profile_created_create_room
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_room();


-- 6. RPC: GET ROOM BY OWNER USERNAME
-- Helper to resolve /@username URL to room data
CREATE OR REPLACE FUNCTION get_room_by_slug_rpc(slug_input text)
RETURNS TABLE (
  room_id bigint,
  name text,
  owner_id uuid,
  room_type text,
  floor_texture_url text,
  wall_color text,
  items jsonb
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.name,
    r.owner_id,
    r.room_type,
    r.floor_texture_url,
    r.wall_color,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'instance_id', ri.instance_id,
          'item_id', ri.item_id,
          'position', ri.position,
          'rotation', ri.rotation,
          'scale', ri.scale,
          'model_url', i.model_url
        )
      ) FILTER (WHERE ri.id IS NOT NULL),
      '[]'::jsonb
    ) as items
  FROM rooms r
  LEFT JOIN room_items ri ON r.id = ri.room_id
  LEFT JOIN items i ON ri.item_id = i.id
  WHERE r.slug = slug_input OR (r.room_type = 'personal' AND r.slug = slug_input)
  GROUP BY r.id;
END;
$$;

-- 7. SEED DATA (Starter Items) - model_url MUST match actual file names in /assets/
INSERT INTO "items" ("name", "description", "category", "model_url", "thumbnail_url", "price_coins", "dimensions", "placement_type") VALUES
  ('Simple Chair', 'A basic wooden chair', 'furniture', 'Chair.glb', 'chair_thumb.png', 0, '{"width": 1, "height": 1, "depth": 1}', 'floor'),
  ('Round Table', 'A simple round table', 'furniture', 'Table.glb', 'table_thumb.png', 0, '{"width": 2, "height": 1, "depth": 2}', 'floor'),
  ('Cozy Couch', 'A comfortable couch', 'furniture', 'Couch.glb', 'couch_thumb.png', 0, '{"width": 2, "height": 1, "depth": 3}', 'floor'),
  ('Floor Lamp', 'Adds some light to your room', 'decoration', 'Lamp.glb', 'lamp_thumb.png', 0, '{"width": 1, "height": 2, "depth": 1}', 'floor')
ON CONFLICT DO NOTHING;

