-- Remove the unused timezone column from profiles
-- and reset all streaks to 0 (clean slate after timezone bug fix)

ALTER TABLE profiles DROP COLUMN IF EXISTS timezone;

UPDATE user_coins SET streak_days = 0, last_daily_claim = NULL;
