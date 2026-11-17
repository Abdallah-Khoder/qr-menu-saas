-- "Not available today": the owner hides an item without deleting it.
ALTER TABLE items ADD COLUMN available BOOLEAN NOT NULL DEFAULT true;
