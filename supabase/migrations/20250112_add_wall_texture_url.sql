-- Add wall_texture_url column for wall texture support
ALTER TABLE rooms 
ADD COLUMN IF NOT EXISTS wall_texture_url text;

-- Comment explaining the column
COMMENT ON COLUMN rooms.wall_texture_url IS 'Filename of wall texture stored in R2 /wall folder';
