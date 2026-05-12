-- Migration: Add RLS policies for rooms table to allow owners to update their rooms
-- This fixes wall and floor textures not saving

-- Enable RLS on rooms table if not already enabled
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- Allow anyone to SELECT rooms (public rooms should be viewable)
DROP POLICY IF EXISTS "Anyone can view rooms" ON rooms;
CREATE POLICY "Anyone can view rooms" ON rooms 
  FOR SELECT USING (true);

-- Allow room owners to UPDATE their own rooms (floor texture, wall texture, etc.)
DROP POLICY IF EXISTS "Owners can update their rooms" ON rooms;
CREATE POLICY "Owners can update their rooms" ON rooms 
  FOR UPDATE USING (auth.uid() = owner_id);
