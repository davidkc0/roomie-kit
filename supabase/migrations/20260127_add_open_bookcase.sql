-- Add Open Bookcase furniture item
-- Model and thumbnail are in the furniture folder in R2

INSERT INTO items (name, description, category, model_url, thumbnail_url, price_coins, dimensions, placement_type)
VALUES (
    'Open Bookcase', 
    'A stylish open bookcase', 
    'furniture', 
    'openBookcase.glb', 
    'https://example.com/roomie-assets/furniture/openBookcase_icon.png', 
    0, 
    '{"width": 1, "height": 2, "depth": 1}', 
    'floor'
)
ON CONFLICT DO NOTHING;
