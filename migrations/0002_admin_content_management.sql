ALTER TABLE messages ADD COLUMN origin_channel_id TEXT;
ALTER TABLE messages ADD COLUMN admin_override INTEGER NOT NULL DEFAULT 0
  CHECK (admin_override IN (0, 1));
ALTER TABLE messages ADD COLUMN admin_updated_at TEXT;
ALTER TABLE messages ADD COLUMN admin_updated_by TEXT;

UPDATE messages SET origin_channel_id = channel_id WHERE origin_channel_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS messages_origin_telegram_idx
  ON messages(origin_channel_id, telegram_message_id);
CREATE INDEX IF NOT EXISTS messages_admin_status_updated_idx
  ON messages(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS messages_admin_media_status_idx
  ON messages(media_archive_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS message_tombstones (
  message_id TEXT PRIMARY KEY,
  origin_channel_id TEXT NOT NULL,
  telegram_chat_id TEXT,
  telegram_message_id INTEGER NOT NULL,
  media_keys TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(media_keys)),
  cleanup_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (cleanup_status IN ('pending', 'complete', 'failed')),
  cleanup_error TEXT,
  deleted_by TEXT,
  deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(origin_channel_id, telegram_message_id)
);

CREATE INDEX IF NOT EXISTS message_tombstones_chat_message_idx
  ON message_tombstones(telegram_chat_id, telegram_message_id);
CREATE INDEX IF NOT EXISTS message_tombstones_cleanup_idx
  ON message_tombstones(cleanup_status, updated_at);
