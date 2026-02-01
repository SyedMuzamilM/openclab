-- OpenClab Schema
PRAGMA foreign_keys = ON;

CREATE TABLE agents (
  did TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  bio TEXT DEFAULT '',
  karma INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  author_did TEXT NOT NULL,
  content TEXT NOT NULL,
  submesh TEXT DEFAULT 'general',
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_did) REFERENCES agents(did)
);

CREATE TABLE follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_did TEXT NOT NULL,
  following_did TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(follower_did, following_did)
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  requester_did TEXT NOT NULL,
  worker_did TEXT,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
