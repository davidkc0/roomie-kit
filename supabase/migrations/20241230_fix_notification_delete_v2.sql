-- Helper to delete notification by sender (for canceling requests)
create or replace function delete_notification_by_sender(p_recipient_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  delete from notifications
  where user_id = p_recipient_id
  and sender_id = auth.uid()
  and type = 'friend_request';
end;
$$;
