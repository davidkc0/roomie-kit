-- Push Notification Schema for OneSignal Integration
-- This migration creates tables for managing push notifications

-- 1. Push tokens table - maps users to OneSignal player IDs
CREATE TABLE IF NOT EXISTS push_tokens (
    user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    onesignal_player_id text NOT NULL,
    platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Index for looking up by player ID (when receiving delivery reports)
CREATE INDEX IF NOT EXISTS idx_push_tokens_player_id ON push_tokens(onesignal_player_id);

-- 2. Notification preferences - user toggles for each notification type
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    friend_requests boolean DEFAULT true,
    room_visits boolean DEFAULT true,
    whiteboard_messages boolean DEFAULT true,
    tournament_wins boolean DEFAULT true,
    marketing boolean DEFAULT false, -- Off by default
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. Notification log - audit trail of sent notifications
CREATE TABLE IF NOT EXISTS notification_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
    notification_type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    data jsonb, -- Additional payload (deep link info, etc.)
    sent_at timestamptz DEFAULT now(),
    delivered boolean DEFAULT false,
    clicked boolean DEFAULT false
);

-- Index for querying user's notification history
CREATE INDEX IF NOT EXISTS idx_notification_log_user ON notification_log(user_id, sent_at DESC);

-- Enable RLS
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for push_tokens
CREATE POLICY "Users can view own push tokens"
    ON push_tokens FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push tokens"
    ON push_tokens FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own push tokens"
    ON push_tokens FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for notification_preferences
CREATE POLICY "Users can view own preferences"
    ON notification_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
    ON notification_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
    ON notification_preferences FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for notification_log
CREATE POLICY "Users can view own notifications"
    ON notification_log FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can insert logs (from Edge Functions)
-- No user insert policy - only backend can create logs

-- Trigger to auto-create notification preferences for new users
CREATE OR REPLACE FUNCTION create_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO notification_preferences (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to profiles table
DROP TRIGGER IF EXISTS on_profile_created_notifications ON profiles;
CREATE TRIGGER on_profile_created_notifications
    AFTER INSERT ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_notification_preferences();
