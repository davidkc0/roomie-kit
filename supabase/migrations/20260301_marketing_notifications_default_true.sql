-- Fix: marketing notifications should default to true (opt-out, not opt-in)
-- 1. Change column default for new users
ALTER TABLE notification_preferences ALTER COLUMN marketing SET DEFAULT true;

-- 2. Flip existing users who got the wrong default (no one explicitly opted out)
UPDATE notification_preferences SET marketing = true WHERE marketing = false;
