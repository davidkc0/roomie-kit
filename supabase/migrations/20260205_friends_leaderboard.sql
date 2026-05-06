-- Friends Leaderboard Filter
-- Migration: 20260205_friends_leaderboard.sql
-- Adds RPC functions to filter leaderboards by friends

-- ============================================
-- 1. GET FRIENDS LEADERBOARD (Snake/Match3)
-- ============================================
-- Returns leaderboard scores filtered to only the current user's friends
CREATE OR REPLACE FUNCTION get_friends_leaderboard(p_game TEXT, p_period TEXT DEFAULT 'weekly')
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  profile_image_url TEXT,
  best_score INTEGER,
  rank INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_week_start TIMESTAMPTZ;
  v_week_end TIMESTAMPTZ;
BEGIN
  -- Calculate week boundaries for weekly mode
  v_week_start := date_trunc('week', NOW());
  v_week_end := v_week_start + INTERVAL '7 days';
  
  RETURN QUERY
  WITH friend_ids AS (
    -- Get all accepted friend IDs (bidirectional)
    SELECT 
      CASE 
        WHEN f.user_id_1 = auth.uid() THEN f.user_id_2 
        ELSE f.user_id_1 
      END as friend_id
    FROM friendships f
    WHERE (f.user_id_1 = auth.uid() OR f.user_id_2 = auth.uid()) 
      AND f.status = 'accepted'
  ),
  friend_scores AS (
    SELECT 
      s.user_id,
      MAX(p.username) as username,
      MAX(p.profile_image_url) as profile_image_url,
      MAX(s.score) as best_score
    FROM scores s
    JOIN profiles p ON s.user_id = p.id
    WHERE s.game = p_game
      AND s.user_id IN (SELECT friend_id FROM friend_ids)
      AND (
        p_period = 'alltime' 
        OR (s.created_at >= v_week_start AND s.created_at < v_week_end)
      )
    GROUP BY s.user_id
  )
  SELECT 
    fs.user_id,
    fs.username,
    fs.profile_image_url,
    fs.best_score::INTEGER,
    ROW_NUMBER() OVER (ORDER BY fs.best_score DESC)::INTEGER as rank
  FROM friend_scores fs
  ORDER BY fs.best_score DESC
  LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION get_friends_leaderboard TO authenticated;


-- ============================================
-- 2. GET FRIENDS CHESS LEADERBOARD
-- ============================================
-- Returns chess rankings filtered to only the current user's friends
CREATE OR REPLACE FUNCTION get_friends_chess_leaderboard()
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  profile_image_url TEXT,
  rating INTEGER,
  wins INTEGER,
  losses INTEGER,
  draws INTEGER,
  rank INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH friend_ids AS (
    -- Get all accepted friend IDs (bidirectional)
    SELECT 
      CASE 
        WHEN f.user_id_1 = auth.uid() THEN f.user_id_2 
        ELSE f.user_id_1 
      END as friend_id
    FROM friendships f
    WHERE (f.user_id_1 = auth.uid() OR f.user_id_2 = auth.uid()) 
      AND f.status = 'accepted'
  )
  SELECT 
    cr.user_id,
    p.username,
    p.profile_image_url,
    cr.rating::INTEGER,
    cr.wins::INTEGER,
    cr.losses::INTEGER,
    cr.draws::INTEGER,
    ROW_NUMBER() OVER (ORDER BY cr.rating DESC)::INTEGER as rank
  FROM chess_ratings cr
  JOIN profiles p ON cr.user_id = p.id
  WHERE cr.user_id IN (SELECT friend_id FROM friend_ids)
  ORDER BY cr.rating DESC
  LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION get_friends_chess_leaderboard TO authenticated;
