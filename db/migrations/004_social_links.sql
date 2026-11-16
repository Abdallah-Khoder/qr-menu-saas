-- Optional links shown as icons on the public menu. Each restaurant may have none, one or both.
ALTER TABLE restaurants
  ADD COLUMN instagram_url TEXT CHECK (instagram_url ~ '^https://' AND char_length(instagram_url) <= 300),
  ADD COLUMN facebook_url  TEXT CHECK (facebook_url  ~ '^https://' AND char_length(facebook_url)  <= 300);
