-- A restaurant can have several branches. Each one has a name and a map link (https only). The owner adds and removes them
-- in the settings; the public menu shows one map icon (a single branch opens the map directly, several open a short list).
--  * restaurant_id + ON DELETE CASCADE: deleting a restaurant (or its account) deletes its branches.
--  * the index is the one the public menu uses (all the branches of one restaurant, in order).
-- The single map link every restaurant had until now (restaurants.map_url) is copied here as its first branch, so nothing
-- is lost. The old column stays for now and is no longer read or written; a later migration will drop it.
CREATE TABLE restaurant_locations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  map_url       TEXT        NOT NULL CHECK (map_url ~ '^https://' AND char_length(map_url) <= 500),
  sort_order    INTEGER     NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX restaurant_locations_menu_idx ON restaurant_locations (restaurant_id, sort_order);

INSERT INTO restaurant_locations (restaurant_id, name, map_url, sort_order)
SELECT id, 'الفرع الرئيسي', map_url, 0 FROM restaurants WHERE map_url IS NOT NULL AND char_length(map_url) <= 500;
