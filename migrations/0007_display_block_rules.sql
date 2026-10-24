CREATE TABLE IF NOT EXISTS display_block_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('tag', 'keyword')),
  value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(type, normalized_value)
);

CREATE INDEX IF NOT EXISTS display_block_rules_created_idx
  ON display_block_rules(created_at DESC, id DESC);
