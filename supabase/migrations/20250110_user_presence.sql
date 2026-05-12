-- Migration: User Presence System
-- Track user online status and current room location for friend status feature
-- Created: 2026-01-18

-- 1. CREATE USER PRESENCE TABLE
CREATE TABLE IF NOT EXISTS user_presence (
    user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'offline' CHECK (status IN ('offline', 'online', 'in_room')),
    room_slug text,                     -- Current room slug (e.g., 'lounge', 'davidkc')
    room_type text,                     -- 'public' or 'personal'
    room_owner_id uuid,                 -- Owner of personal room (null for public rooms)
    last_seen timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;

-- Everyone can read presence (needed for friends list)
CREATE POLICY "Public read presence" ON user_presence FOR SELECT USING (true);

-- Users can only update their own presence
CREATE POLICY "Users update own presence" ON user_presence FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own presence" ON user_presence FOR INSERT WITH CHECK (auth.uid() = user_id);


-- 2. TRIGGER: Auto-create presence row when profile is created
CREATE OR REPLACE FUNCTION handle_new_user_presence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO user_presence (user_id, status)
    VALUES (NEW.id, 'offline')
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_create_presence ON public.profiles;
CREATE TRIGGER on_profile_created_create_presence
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user_presence();


-- 3. RPC: Update user presence
-- Called when user enters/leaves rooms or app
CREATE OR REPLACE FUNCTION update_presence(
    p_status text,
    p_room_slug text DEFAULT NULL,
    p_room_type text DEFAULT NULL,
    p_room_owner_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO user_presence (user_id, status, room_slug, room_type, room_owner_id, last_seen)
    VALUES (auth.uid(), p_status, p_room_slug, p_room_type, p_room_owner_id, now())
    ON CONFLICT (user_id) DO UPDATE SET
        status = EXCLUDED.status,
        room_slug = EXCLUDED.room_slug,
        room_type = EXCLUDED.room_type,
        room_owner_id = EXCLUDED.room_owner_id,
        last_seen = now();
END;
$$;


-- 4. RPC: Get friends' presence
-- Returns presence data for all accepted friends of the current user
CREATE OR REPLACE FUNCTION get_friends_presence()
RETURNS TABLE (
    friend_id uuid,
    username text,
    profile_image_url text,
    status text,
    room_slug text,
    room_type text,
    room_owner_username text,
    last_seen timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.user_id,
        pr.username,
        pr.profile_image_url,
        p.status,
        p.room_slug,
        p.room_type,
        owner.username as room_owner_username,
        p.last_seen
    FROM user_presence p
    JOIN profiles pr ON p.user_id = pr.id
    LEFT JOIN profiles owner ON p.room_owner_id = owner.id
    WHERE p.user_id IN (
        SELECT 
            CASE 
                WHEN f.user_id_1 = auth.uid() THEN f.user_id_2 
                ELSE f.user_id_1 
            END
        FROM friendships f
        WHERE (f.user_id_1 = auth.uid() OR f.user_id_2 = auth.uid()) 
        AND f.status = 'accepted'
    );
END;
$$;


-- 5. FUNCTION: Cleanup stale presence (mark offline after inactivity)
-- Can be called by a cron job or scheduled function
CREATE OR REPLACE FUNCTION cleanup_stale_presence(minutes_threshold int DEFAULT 10)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    updated_count int;
BEGIN
    UPDATE user_presence 
    SET status = 'offline', room_slug = NULL, room_type = NULL, room_owner_id = NULL
    WHERE status != 'offline' 
    AND last_seen < now() - (minutes_threshold || ' minutes')::interval;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$;
