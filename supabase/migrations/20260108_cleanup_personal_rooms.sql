-- Remove Arcade Machine from Personal Rooms
-- We define personal rooms as those that are NOT the strict static system rooms
DELETE FROM room_items 
WHERE item_id = 'arcade_machine.glb' 
AND room_slug NOT IN ('lounge', 'theater', 'default', 'theater2');

-- Optional: If the red/blue/green blocks were persisted in DB (unlikely given code finding, but safe to clear)
-- Assuming they might have been saved as 'box' or similar if debug code utilized persistence
-- For now, just the arcade machine is the confirmed issue.
