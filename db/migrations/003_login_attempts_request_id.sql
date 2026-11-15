-- One login request writes TWO rows (one per key: ip and email). To rank simultaneous requests
-- the same way for both keys, every row of the same request carries the same request_id.
-- (Before this, ties in time were broken by each row's own random id, so the two counters could
-- disagree and a request could be refused although it was among the first five.)
-- Old rows get a random value from the default; they are short-lived anyway.
ALTER TABLE login_attempts ADD COLUMN request_id UUID NOT NULL DEFAULT gen_random_uuid();
