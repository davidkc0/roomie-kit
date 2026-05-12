-- Fix friends_count to only count ACCEPTED friendships (not pending)
-- This migration:
-- 1. Creates a function to calculate correct friend count
-- 2. Updates all existing profiles with correct counts
-- 3. Creates triggers to maintain correct counts

-- Function to calculate correct friend count for a user
CREATE OR REPLACE FUNCTION calculate_friend_count(p_user_id uuid)
RETURNS integer AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::integer
        FROM friendships
        WHERE (user_id_1 = p_user_id OR user_id_2 = p_user_id)
        AND status = 'accepted'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update friend counts when friendship changes
CREATE OR REPLACE FUNCTION update_friend_counts()
RETURNS TRIGGER AS $$
DECLARE
    v_user1 uuid;
    v_user2 uuid;
BEGIN
    -- Get both user IDs involved
    IF TG_OP = 'DELETE' THEN
        v_user1 := OLD.user_id_1;
        v_user2 := OLD.user_id_2;
    ELSE
        v_user1 := NEW.user_id_1;
        v_user2 := NEW.user_id_2;
    END IF;
    
    -- Update friend count for user 1
    UPDATE profiles
    SET friends_count = calculate_friend_count(v_user1)
    WHERE id = v_user1;
    
    -- Update friend count for user 2
    UPDATE profiles
    SET friends_count = calculate_friend_count(v_user2)
    WHERE id = v_user2;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS friendship_count_trigger ON friendships;

-- Create trigger to update counts on any friendship change
CREATE TRIGGER friendship_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON friendships
FOR EACH ROW
EXECUTE FUNCTION update_friend_counts();

-- Fix all existing profiles with correct friend counts
UPDATE profiles p
SET friends_count = (
    SELECT COUNT(*)::integer
    FROM friendships f
    WHERE (f.user_id_1 = p.id OR f.user_id_2 = p.id)
    AND f.status = 'accepted'
);
