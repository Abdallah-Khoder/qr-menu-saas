-- Password reset by email link.
--  * password_changed_at: when it was changed by a reset. A login cookie made BEFORE that moment stops
--    working (the cookie knows when it was made), so whoever had the old password is logged out.
--  * the reset links live in email_codes (purpose 'reset_password', only the hash of the link's token),
--    looked up by that hash: this index keeps the lookup fast.
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMPTZ;
CREATE INDEX email_codes_hash_idx ON email_codes (code_hash);
