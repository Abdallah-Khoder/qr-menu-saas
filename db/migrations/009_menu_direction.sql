-- Which way the public menu reads: 'rtl' (right to left, Arabic) or 'ltr' (left to right, English). The owner chooses it in
-- the settings. Every restaurant that exists now keeps the page it has today ('rtl').
-- Safe to run before the new code is deployed: the code that is already running never reads this column.
ALTER TABLE restaurants
  ADD COLUMN menu_direction TEXT NOT NULL DEFAULT 'rtl' CHECK (menu_direction IN ('rtl', 'ltr'));
