-- The item limit counts the items of one restaurant on every create: this index makes that count cheap.
CREATE INDEX items_restaurant_idx ON items (restaurant_id);
