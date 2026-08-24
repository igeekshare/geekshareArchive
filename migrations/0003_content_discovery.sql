ALTER TABLE messages ADD COLUMN display_title TEXT;
ALTER TABLE messages ADD COLUMN display_summary TEXT;
ALTER TABLE messages ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0
  CHECK (is_featured IN (0, 1));
ALTER TABLE messages ADD COLUMN featured_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN engagement_score INTEGER NOT NULL DEFAULT 0;

UPDATE messages
SET engagement_score = COALESCE((
  SELECT SUM(CAST(json_extract(value, '$.count') AS INTEGER))
  FROM json_each(messages.reactions)
), 0);

CREATE INDEX IF NOT EXISTS messages_featured_idx
  ON messages(status, is_featured DESC, featured_order ASC, published_at DESC);
CREATE INDEX IF NOT EXISTS messages_hot_idx
  ON messages(status, engagement_score DESC, published_at DESC);
