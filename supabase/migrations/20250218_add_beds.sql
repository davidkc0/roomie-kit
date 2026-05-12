-- Add bed furniture items
-- Models and thumbnails are in the furniture folder in R2

INSERT INTO items (name, description, category, model_url, thumbnail_url, price_coins, dimensions, placement_type)
VALUES
    ('Basic Bed',
     'A simple basic bed',
     'furniture',
     'basic_bed.glb',
     'https://example.com/roomie-assets/furniture/basic_bed_icon.png',
     0,
     '{"width": 2, "height": 1, "depth": 3}',
     'floor'),

    ('Bunk Bed',
     'A space-saving bunk bed',
     'furniture',
     'bunk_bed.glb',
     'https://example.com/roomie-assets/furniture/bunk_bed_icon.png',
     0,
     '{"width": 2, "height": 2, "depth": 3}',
     'floor'),

    ('Large Bed',
     'A spacious large bed',
     'furniture',
     'large_bed.glb',
     'https://example.com/roomie-assets/furniture/large_bed_icon.png',
     0,
     '{"width": 3, "height": 1, "depth": 3}',
     'floor'),

    ('Large Beige Bed',
     'A large beige bed with a warm tone',
     'furniture',
     'large_beige_bed.glb',
     'https://example.com/roomie-assets/furniture/large_beige_bed_icon.png',
     0,
     '{"width": 3, "height": 1, "depth": 3}',
     'floor'),

    ('Floral Bed',
     'A charming bed with floral design',
     'furniture',
     'floral_bed.glb',
     'https://example.com/roomie-assets/furniture/floral_bed_icon.png',
     0,
     '{"width": 2, "height": 1, "depth": 3}',
     'floor')

ON CONFLICT DO NOTHING;
