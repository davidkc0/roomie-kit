-- Add Rectangle Rug decorative item
-- Model and thumbnail are in the furniture folder in R2

INSERT INTO items (name, description, category, model_url, thumbnail_url, price_coins, dimensions, placement_type)
VALUES (
    'Rectangle Rug', 
    'A decorative rectangle rug', 
    'decoration', 
    'rugRectangle.glb', 
    'https://example.com/roomie-assets/furniture/rugRectangle_icon.png', 
    0, 
    '{"width": 2, "height": 0, "depth": 3}', 
    'floor'
)
ON CONFLICT DO NOTHING;
