CREATE TABLE pages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  lines TEXT NOT NULL,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE page_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id TEXT NOT NULL,
  title TEXT NOT NULL,
  lines TEXT NOT NULL,
  saved_at INTEGER NOT NULL
);

CREATE TABLE links (
  from_id TEXT NOT NULL,
  to_title TEXT NOT NULL
);

CREATE INDEX links_from_id ON links (from_id);
CREATE INDEX links_to_title ON links (to_title);

CREATE VIRTUAL TABLE pages_fts USING fts5(
  page_id UNINDEXED,
  title,
  body,
  tokenize = 'trigram'
);

CREATE TABLE schema_version (
  v INTEGER NOT NULL
);
