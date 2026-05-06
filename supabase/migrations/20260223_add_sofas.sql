-- Add new sofa furniture items
-- Models and thumbnails are in the furniture folder in R2

INSERT INTO items (name, description, category, model_url, thumbnail_url, price_coins, dimensions, placement_type)
VALUES
    ('3 Seat Blue Sofa',
     'A spacious blue three-seater sofa',
     'furniture',
     '3_seat_blue.glb',
     'https://example.com/roomie-assets/furniture/blue_3_seat_sofa_icon.png',
     0,
     '{"width": 3, "height": 1, "depth": 2}',
     'floor'),

    ('Pink Sectional',
     'A stylish pink sectional sofa',
     'furniture',
     'pink_sectionial.glb',
     'https://example.com/roomie-assets/furniture/pink_sectional_icon.png',
     0,
     '{"width": 3, "height": 1, "depth": 3}',
     'floor'),

    ('Large Beige Sectional',
     'A large beige sectional for open spaces',
     'furniture',
     'large_beige_sectional.glb',
     'https://example.com/roomie-assets/furniture/large_beige_sectional_icon.png',
     0,
     '{"width": 4, "height": 1, "depth": 3}',
     'floor'),

    ('Purple Loveseat',
     'A cozy purple loveseat',
     'furniture',
     'purple_loveseat.glb',
     'https://example.com/roomie-assets/furniture/purple_loveseat_icon.png',
     0,
     '{"width": 2, "height": 1, "depth": 2}',
     'floor'),

    ('Black Sectional',
     'A modern black sectional sofa',
     'furniture',
     'black_sectional.glb',
     'https://example.com/roomie-assets/furniture/black_sectional_icon.png',
     0,
     '{"width": 3, "height": 1, "depth": 3}',
     'floor')

ON CONFLICT DO NOTHING;
