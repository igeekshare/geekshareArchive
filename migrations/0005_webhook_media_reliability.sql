ALTER TABLE webhook_updates ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 1
  CHECK (attempt_count >= 1);
ALTER TABLE webhook_updates ADD COLUMN last_attempt_at TEXT;

UPDATE webhook_updates
SET last_attempt_at = COALESCE(processed_at, received_at)
WHERE last_attempt_at IS NULL;

CREATE INDEX IF NOT EXISTS webhook_updates_claim_idx
  ON webhook_updates(status, last_attempt_at);

ALTER TABLE messages ADD COLUMN media_retry_count INTEGER NOT NULL DEFAULT 0
  CHECK (media_retry_count >= 0);
ALTER TABLE messages ADD COLUMN media_last_error TEXT;
ALTER TABLE messages ADD COLUMN media_next_retry_at TEXT;
ALTER TABLE messages ADD COLUMN media_retry_exhausted INTEGER NOT NULL DEFAULT 0
  CHECK (media_retry_exhausted IN (0, 1));

CREATE INDEX IF NOT EXISTS messages_media_retry_queue_idx
  ON messages(
    status,
    media_retry_exhausted,
    media_archive_status,
    media_next_retry_at,
    updated_at
  );
