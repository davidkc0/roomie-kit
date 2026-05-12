-- Update gift gem values to be 80% of the cost (Streamer gets 80%, Platform keeps 20%)
UPDATE gifts SET gem_value = CAST(cost * 0.8 AS INTEGER) WHERE name = 'Heart';
UPDATE gifts SET gem_value = CAST(cost * 0.8 AS INTEGER) WHERE name = 'Star';
UPDATE gifts SET gem_value = CAST(cost * 0.8 AS INTEGER) WHERE name = 'Crown';
UPDATE gifts SET gem_value = CAST(cost * 0.8 AS INTEGER) WHERE name = 'Rocket';
UPDATE gifts SET gem_value = CAST(cost * 0.8 AS INTEGER) WHERE name = 'Diamond';
