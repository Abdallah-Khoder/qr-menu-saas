-- Optional TikTok link, shown as an icon on the public menu (like instagram_url and facebook_url).
-- A new empty column: the code that is already running keeps working before and after this migration.
ALTER TABLE restaurants
  ADD COLUMN tiktok_url TEXT CHECK (tiktok_url ~ '^https://' AND char_length(tiktok_url) <= 300);
