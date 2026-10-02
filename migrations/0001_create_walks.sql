-- Migration 0001_create_walks
CREATE TABLE IF NOT EXISTS walks (
  id TEXT PRIMARY KEY,
  walked_on TEXT,
  note TEXT,
  walker TEXT DEFAULT 'Harshit',
  covered_edges TEXT NOT NULL DEFAULT '[]',
  polyline TEXT NOT NULL DEFAULT '[]',
  walked_km REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_walks_walked_on ON walks (walked_on DESC);
