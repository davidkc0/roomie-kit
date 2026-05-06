-- Chess ELO Rating System
-- Creates a table to track chess ratings for each user

-- Create chess_ratings table
CREATE TABLE IF NOT EXISTS chess_ratings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL DEFAULT 1200,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER GENERATED ALWAYS AS (wins + losses + draws) STORED,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for leaderboard queries (descending by rating)
CREATE INDEX IF NOT EXISTS idx_chess_ratings_rating ON chess_ratings(rating DESC);

-- Enable Row Level Security
ALTER TABLE chess_ratings ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view ratings (public leaderboard)
CREATE POLICY "Anyone can view chess ratings"
  ON chess_ratings
  FOR SELECT
  USING (true);

-- Policy: Users can insert their own rating row
CREATE POLICY "Users can insert their own rating"
  ON chess_ratings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own rating
CREATE POLICY "Users can update their own rating"
  ON chess_ratings
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Function to upsert a chess rating (used after games)
CREATE OR REPLACE FUNCTION upsert_chess_rating(
  p_user_id UUID,
  p_rating_delta INTEGER,
  p_is_win BOOLEAN,
  p_is_draw BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_rating INTEGER;
BEGIN
  -- Insert or update the rating
  INSERT INTO chess_ratings (user_id, rating, wins, losses, draws, updated_at)
  VALUES (
    p_user_id,
    1200 + p_rating_delta,
    CASE WHEN p_is_win THEN 1 ELSE 0 END,
    CASE WHEN NOT p_is_win AND NOT p_is_draw THEN 1 ELSE 0 END,
    CASE WHEN p_is_draw THEN 1 ELSE 0 END,
    NOW()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    rating = chess_ratings.rating + p_rating_delta,
    wins = chess_ratings.wins + CASE WHEN p_is_win THEN 1 ELSE 0 END,
    losses = chess_ratings.losses + CASE WHEN NOT p_is_win AND NOT p_is_draw THEN 1 ELSE 0 END,
    draws = chess_ratings.draws + CASE WHEN p_is_draw THEN 1 ELSE 0 END,
    updated_at = NOW()
  RETURNING rating INTO new_rating;
  
  RETURN new_rating;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION upsert_chess_rating TO authenticated;
