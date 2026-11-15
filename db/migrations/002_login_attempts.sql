-- Failed login attempts, used to slow down people who guess passwords.
-- `key` is "ip:<address>" or "email:<address>", so one table limits both.
CREATE TABLE login_attempts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_key_idx ON login_attempts (key, created_at DESC);
