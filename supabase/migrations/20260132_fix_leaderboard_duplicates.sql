-- Fix Leaderboard Duplicate Entries
-- Migration: 20260132_fix_leaderboard_duplicates.sql
-- Ensures each player has only ONE entry per game (their highest score)

-- ============================================
-- 1. ADD UNIQUE CONSTRAINT (user_id, game)
-- ============================================
-- First, clean up existing duplicates by keeping only the highest score per user per game
DELETE FROM scores a
USING scores b
WHERE a.id < b.id 
  AND a.user_id = b.user_id 
  AND a.game = b.game;

-- Now add the unique constraint
ALTER TABLE scores 
ADD CONSTRAINT scores_user_game_unique UNIQUE (user_id, game);

-- ============================================
-- 2. CREATE UPSERT RPC FOR SCORE SUBMISSION
-- ============================================
CREATE OR REPLACE FUNCTION submit_high_score(
  p_user_id UUID,
  p_game TEXT,
  p_score INTEGER,
  p_username TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_score INTEGER;
  v_result_action TEXT;
BEGIN
  -- Get existing high score for this user/game
  SELECT score INTO v_existing_score
  FROM scores
  WHERE user_id = p_user_id AND game = p_game;
  
  IF v_existing_score IS NULL THEN
    -- First score for this user/game - insert
    INSERT INTO scores (user_id, game, score, username, created_at)
    VALUES (p_user_id, p_game, p_score, p_username, NOW());
    v_result_action := 'inserted';
  ELSIF p_score > v_existing_score THEN
    -- New high score - update
    UPDATE scores
    SET score = p_score, username = p_username, created_at = NOW()
    WHERE user_id = p_user_id AND game = p_game;
    v_result_action := 'updated';
  ELSE
    -- Score not higher than existing - no change
    v_result_action := 'no_change';
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'action', v_result_action,
    'previous_score', v_existing_score,
    'new_score', p_score
  );
END;
$$;

GRANT EXECUTE ON FUNCTION submit_high_score TO authenticated;

-- ============================================
-- 3. UPDATE get_weekly_leaderboard TO USE MAX
-- ============================================
-- (Already uses MAX aggregation - no change needed)

-- ============================================
-- 4. INDEX FOR FASTER LOOKUPS
-- ============================================
CREATE INDEX IF NOT EXISTS idx_scores_user_game 
  ON scores(user_id, game);
