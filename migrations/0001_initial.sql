PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  telegram_chat_id TEXT UNIQUE,
  telegram_url TEXT NOT NULL,
  archive_url TEXT NOT NULL,
  description TEXT,
  avatar_key TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_synced_at TEXT,
  last_webhook_at TEXT,
  last_synced_message_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE RESTRICT,
  telegram_message_id INTEGER NOT NULL,
  source_url TEXT NOT NULL,
  date TEXT NOT NULL,
  datetime TEXT,
  published_at INTEGER NOT NULL,
  published_year TEXT NOT NULL,
  published_month TEXT NOT NULL,
  sender TEXT,
  html TEXT NOT NULL DEFAULT '',
  plain_text TEXT NOT NULL DEFAULT '',
  media TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(media)),
  reply_to TEXT,
  reactions TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(reactions)),
  raw_payload TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(raw_payload)),
  media_archive_status TEXT NOT NULL DEFAULT 'none'
    CHECK (media_archive_status IN ('none', 'archived', 'external', 'pending', 'failed')),
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel_id, telegram_message_id)
);

CREATE INDEX IF NOT EXISTS messages_status_published_idx
  ON messages(status, published_at DESC);
CREATE INDEX IF NOT EXISTS messages_channel_published_idx
  ON messages(channel_id, published_at DESC);
CREATE INDEX IF NOT EXISTS messages_reply_to_idx ON messages(reply_to);
CREATE INDEX IF NOT EXISTS messages_year_month_idx
  ON messages(published_year, published_month);

CREATE TABLE IF NOT EXISTS message_tags (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY(message_id, tag)
);
CREATE INDEX IF NOT EXISTS message_tags_tag_idx ON message_tags(tag, message_id);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  id UNINDEXED,
  plain_text,
  media_title,
  media_description,
  tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(id, plain_text, media_title, media_description)
  VALUES (
    new.id,
    new.plain_text,
    COALESCE(json_extract(new.media, '$[0].title'), ''),
    COALESCE(json_extract(new.media, '$[0].description'), '')
  );
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE OF id, plain_text, media ON messages BEGIN
  DELETE FROM messages_fts WHERE id = old.id;
  INSERT INTO messages_fts(id, plain_text, media_title, media_description)
  VALUES (
    new.id,
    new.plain_text,
    COALESCE(json_extract(new.media, '$[0].title'), ''),
    COALESCE(json_extract(new.media, '$[0].description'), '')
  );
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
  DELETE FROM messages_fts WHERE id = old.id;
END;

CREATE TABLE IF NOT EXISTS webhook_updates (
  update_id TEXT PRIMARY KEY,
  channel_id TEXT,
  telegram_message_id INTEGER,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'success', 'ignored', 'failed')),
  error TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT
);
CREATE INDEX IF NOT EXISTS webhook_updates_status_idx
  ON webhook_updates(status, received_at);

CREATE TABLE IF NOT EXISTS sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT,
  source TEXT NOT NULL DEFAULT 'webhook',
  status TEXT NOT NULL,
  message TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS sync_logs_created_idx ON sync_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
