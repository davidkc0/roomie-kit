-- Automatic push notification when a user is activated (taken off waitlist)
-- Uses pg_net extension to call the send-notification Edge Function

-- 1. Enable pg_net extension (may already be enabled)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Trigger function: fires when profiles.account_status changes to 'active'
CREATE OR REPLACE FUNCTION notify_user_activated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url text;
  v_service_role_key text;
BEGIN
  -- Only fire when account_status changes FROM non-active TO 'active'
  IF (OLD.account_status IS DISTINCT FROM 'active')
     AND (NEW.account_status = 'active') THEN

    -- Read from the same vault secrets that Edge Functions use
    SELECT decrypted_secret INTO v_supabase_url
    FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

    -- Call the send-notification Edge Function via pg_net
    IF v_supabase_url IS NOT NULL AND v_service_role_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/send-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
        body := jsonb_build_object(
          'target_user_id', NEW.id::text,
          'notification_type', 'account_activation',
          'title', 'You''re In! 🎉',
          'message', 'Your account has been activated. Welcome to Roomie!',
          'data', jsonb_build_object('type', 'account_activation')
        )
      );

      RAISE LOG '[notify_user_activated] Sent activation notification for user %', NEW.id;
    ELSE
      RAISE WARNING '[notify_user_activated] Missing supabase_url or service_role_key - cannot send notification';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Attach trigger to profiles table (UPDATE only)
DROP TRIGGER IF EXISTS on_user_activated ON profiles;
CREATE TRIGGER on_user_activated
  AFTER UPDATE ON profiles
  FOR EACH ROW
  WHEN (OLD.account_status IS DISTINCT FROM NEW.account_status)
  EXECUTE FUNCTION notify_user_activated();
