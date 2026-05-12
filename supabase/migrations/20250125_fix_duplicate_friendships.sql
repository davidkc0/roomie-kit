-- Fix duplicate friendships and add constraint to prevent them
-- This migration:
-- 1. Removes duplicate friendship rows (keeping the older one)
-- 2. Adds a unique constraint to prevent duplicates (checking both directions)
-- 3. Updates friend counts after cleanup

-- Step 1: Delete duplicate friendships (keep the one with smaller id)
-- A friendship is a duplicate if user_id_1/user_id_2 matches user_id_2/user_id_1 of another row
DELETE FROM friendships f1
WHERE EXISTS (
    SELECT 1 FROM friendships f2
    WHERE f1.user_id_1 = f2.user_id_2
    AND f1.user_id_2 = f2.user_id_1
    AND f1.id > f2.id  -- Keep the older record
);

-- Step 2: Create a function to normalize user IDs for unique constraint
-- This ensures (A,B) and (B,A) are treated as the same pair
CREATE OR REPLACE FUNCTION friendship_pair(u1 uuid, u2 uuid) 
RETURNS uuid[] AS $$
BEGIN
    IF u1 < u2 THEN
        RETURN ARRAY[u1, u2];
    ELSE
        RETURN ARRAY[u2, u1];
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 3: Add unique constraint using the normalized pair
-- First check if constraint exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_friendship_pair'
    ) THEN
        ALTER TABLE friendships 
        ADD CONSTRAINT unique_friendship_pair 
        UNIQUE (user_id_1, user_id_2);
    END IF;
END $$;

-- Step 4: Create a trigger to check for reverse duplicates before insert
CREATE OR REPLACE FUNCTION check_duplicate_friendship()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM friendships 
        WHERE user_id_1 = NEW.user_id_2 AND user_id_2 = NEW.user_id_1
    ) THEN
        RAISE EXCEPTION 'Friendship already exists between these users';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_duplicate_friendship ON friendships;
CREATE TRIGGER prevent_duplicate_friendship
BEFORE INSERT ON friendships
FOR EACH ROW
EXECUTE FUNCTION check_duplicate_friendship();

-- Step 5: Update all friend counts after cleanup
UPDATE profiles p
SET friends_count = (
    SELECT COUNT(*)::integer
    FROM friendships f
    WHERE (f.user_id_1 = p.id OR f.user_id_2 = p.id)
    AND f.status = 'accepted'
);
