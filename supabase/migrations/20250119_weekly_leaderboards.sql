-- Weekly Leaderboard Prize Pools (Simplified)
-- Migration: 20260131_weekly_leaderboards.sql
-- Uses existing 'scores' table with date filtering, only adds prize pool tracking

-- ============================================
-- 1. WEEKLY PRIZE POOLS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS weekly_prize_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game TEXT NOT NULL,  -- 'snake', 'match3'
  week_start DATE NOT NULL,  -- Monday of the week
  week_end DATE NOT NULL,    -- Sunday of the week
  total_coins INTEGER DEFAULT 0,  -- Total coins collected this week
  winner_id UUID REFERENCES profiles(id),  -- Set when week closes
  gems_awarded INTEGER,  -- 85% of total_coins
  platform_fee INTEGER,  -- 15% of total_coins
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'paid')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  UNIQUE(game, week_start)
);

-- Enable RLS
ALTER TABLE weekly_prize_pools ENABLE ROW LEVEL SECURITY;

-- Anyone can view prize pools (public info)
CREATE POLICY "Prize pools are viewable by everyone"
  ON weekly_prize_pools FOR SELECT
  USING (true);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_weekly_prize_pools_game_week 
  ON weekly_prize_pools(game, week_start);

-- ============================================
-- 2. ADD INDEX ON SCORES FOR WEEK QUERIES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_scores_game_created 
  ON scores(game, created_at DESC);

-- ============================================
-- 3. GET WEEKLY LEADERBOARD (uses existing scores table)
-- ============================================
CREATE OR REPLACE FUNCTION get_weekly_leaderboard(p_game TEXT)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
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
  v_week_start := date_trunc('week', NOW());
  v_week_end := v_week_start + INTERVAL '7 days';
  
  RETURN QUERY
  SELECT 
    s.user_id,
    MAX(s.username) as username,
    MAX(s.score) as best_score,
    ROW_NUMBER() OVER (ORDER BY MAX(s.score) DESC)::INTEGER as rank
  FROM scores s
  WHERE s.game = p_game
    AND s.created_at >= v_week_start
    AND s.created_at < v_week_end
  GROUP BY s.user_id
  ORDER BY best_score DESC
  LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION get_weekly_leaderboard TO authenticated;
GRANT EXECUTE ON FUNCTION get_weekly_leaderboard TO anon;

-- ============================================
-- 4. CLOSE WEEKLY LEADERBOARD RPC
-- ============================================
CREATE OR REPLACE FUNCTION close_weekly_leaderboard(p_game TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_week_start TIMESTAMPTZ;
  v_last_week_end TIMESTAMPTZ;
  v_pool RECORD;
  v_winner RECORD;
  v_player_count INTEGER;
  v_gems_awarded INTEGER;
  v_platform_fee INTEGER;
BEGIN
  -- Get last week's boundaries
  v_last_week_start := date_trunc('week', NOW() - INTERVAL '1 day');
  v_last_week_end := v_last_week_start + INTERVAL '7 days';
  
  -- Get the pool for last week
  SELECT * INTO v_pool FROM weekly_prize_pools
  WHERE game = p_game 
    AND week_start = v_last_week_start::date 
    AND status = 'active';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_active_pool');
  END IF;
  
  -- Count unique players this week (from scores table)
  SELECT COUNT(DISTINCT user_id) INTO v_player_count 
  FROM scores
  WHERE game = p_game 
    AND created_at >= v_last_week_start 
    AND created_at < v_last_week_end;
  
  -- MINIMUM 3 PLAYERS REQUIRED
  IF v_player_count < 3 THEN
    -- Carry over pool to next week
    UPDATE weekly_prize_pools SET
      week_start = date_trunc('week', NOW())::date,
      week_end = (date_trunc('week', NOW()) + INTERVAL '6 days')::date
    WHERE id = v_pool.id;
    RETURN jsonb_build_object('success', true, 'carried_over', true, 'player_count', v_player_count, 'pool_total', v_pool.total_coins);
  END IF;
  
  -- Get winner (highest score from scores table)
  SELECT s.user_id, MAX(s.username) as username, MAX(s.score) as score 
  INTO v_winner 
  FROM scores s
  WHERE s.game = p_game 
    AND s.created_at >= v_last_week_start 
    AND s.created_at < v_last_week_end
  GROUP BY s.user_id
  ORDER BY MAX(s.score) DESC
  LIMIT 1;
  
  -- Calculate payout (85% to winner, 15% to platform)
  v_gems_awarded := FLOOR(v_pool.total_coins * 0.85);
  v_platform_fee := v_pool.total_coins - v_gems_awarded;
  
  -- Award gems to winner
  PERFORM modify_gems(v_winner.user_id, v_gems_awarded, 'leaderboard_win', 
    jsonb_build_object('game', p_game, 'week_start', v_last_week_start::date, 'rank', 1));
  
  -- Update pool record
  UPDATE weekly_prize_pools SET
    status = 'paid',
    winner_id = v_winner.user_id,
    gems_awarded = v_gems_awarded,
    platform_fee = v_platform_fee,
    closed_at = NOW()
  WHERE id = v_pool.id;
  
  RETURN jsonb_build_object(
    'success', true,
    'winner_id', v_winner.user_id,
    'winner_username', v_winner.username,
    'winner_score', v_winner.score,
    'gems_awarded', v_gems_awarded,
    'player_count', v_player_count
  );
END;
$$;

-- ============================================
-- 5. MODIFY start_game_play TO ADD TO POOL
-- ============================================
CREATE OR REPLACE FUNCTION start_game_play(p_user_id uuid, p_game text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plays_today int;
  v_cost int := 5;
  v_balance int;
  v_new_balance int;
  v_week_start DATE;
  v_week_end DATE;
BEGIN
  -- Calculate current week boundaries
  v_week_start := date_trunc('week', NOW())::date;
  v_week_end := (v_week_start + INTERVAL '6 days')::date;

  -- Ensure user_coins row exists first (for all cases)
  INSERT INTO user_coins (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Get current balance (row now guaranteed to exist)
  SELECT balance INTO v_balance FROM user_coins WHERE user_id = p_user_id;
  
  -- Count today's plays for this game
  SELECT COUNT(*) INTO v_plays_today
  FROM transactions
  WHERE user_id = p_user_id
    AND transaction_type = 'game_play'
    AND metadata->>'game' = p_game
    AND created_at::date = CURRENT_DATE;
  
  -- First play is free
  IF v_plays_today = 0 THEN
    -- Log free play (0 cost transaction)
    INSERT INTO transactions (user_id, currency_type, amount, balance_after, transaction_type, metadata)
    VALUES (p_user_id, 'coins', 0, v_balance, 'game_play', jsonb_build_object('game', p_game, 'free', true));
    
    RETURN jsonb_build_object('allowed', true, 'free', true, 'cost', 0, 'balance', v_balance);
  END IF;
  
  -- Subsequent plays cost 5 coins - check balance BEFORE deducting
  IF v_balance < v_cost THEN
    RETURN jsonb_build_object('allowed', false, 'free', false, 'cost', v_cost, 'balance', v_balance, 'reason', 'insufficient_coins');
  END IF;
  
  -- Deduct coins directly (avoid modify_coins INSERT issue)
  UPDATE user_coins 
  SET balance = balance - v_cost, updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;
  
  -- Log paid play transaction
  INSERT INTO transactions (user_id, currency_type, amount, balance_after, transaction_type, metadata)
  VALUES (p_user_id, 'coins', -v_cost, v_new_balance, 'game_play', jsonb_build_object('game', p_game, 'free', false));
  
  -- ADD TO WEEKLY PRIZE POOL
  INSERT INTO weekly_prize_pools (game, week_start, week_end, total_coins)
  VALUES (p_game, v_week_start, v_week_end, v_cost)
  ON CONFLICT (game, week_start) DO UPDATE
  SET total_coins = weekly_prize_pools.total_coins + v_cost;
  
  RETURN jsonb_build_object('allowed', true, 'free', false, 'cost', v_cost, 'balance', v_new_balance);
END;
$$;

-- ============================================
-- 6. GET CURRENT WEEK PRIZE POOL
-- ============================================
CREATE OR REPLACE FUNCTION get_weekly_prize_pool(p_game TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_week_start DATE;
  v_week_end DATE;
  v_pool RECORD;
  v_player_count INTEGER;
BEGIN
  v_week_start := date_trunc('week', NOW())::date;
  v_week_end := (v_week_start + INTERVAL '6 days')::date;
  
  -- Get pool for current week
  SELECT * INTO v_pool FROM weekly_prize_pools
  WHERE game = p_game AND week_start = v_week_start;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'total_coins', 0,
      'gems_payout', 0,
      'player_count', 0,
      'week_start', v_week_start,
      'week_end', v_week_end,
      'active', true
    );
  END IF;
  
  -- Count unique players from scores table
  SELECT COUNT(DISTINCT user_id) INTO v_player_count 
  FROM scores
  WHERE game = p_game 
    AND created_at >= v_week_start::timestamptz 
    AND created_at < (v_week_end + INTERVAL '1 day')::timestamptz;
  
  RETURN jsonb_build_object(
    'total_coins', v_pool.total_coins,
    'gems_payout', FLOOR(v_pool.total_coins * 0.85),
    'player_count', v_player_count,
    'week_start', v_pool.week_start,
    'week_end', v_pool.week_end,
    'active', v_pool.status = 'active'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_weekly_prize_pool TO authenticated;
GRANT EXECUTE ON FUNCTION get_weekly_prize_pool TO anon;
