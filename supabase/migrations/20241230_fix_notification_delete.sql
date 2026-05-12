-- Create a secure function to delete notifications.
-- This helps avoid RLS issues where users might not have direct DELETE permission on the table.

CREATE OR REPLACE FUNCTION delete_notification(p_notification_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM notifications
  WHERE id = p_notification_id
  AND user_id = auth.uid();
END;
$$;
