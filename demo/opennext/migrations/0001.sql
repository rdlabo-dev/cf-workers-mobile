CREATE TABLE sessions (token TEXT PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE notes (owner TEXT PRIMARY KEY, value TEXT NOT NULL, writes INTEGER NOT NULL DEFAULT 0);
INSERT INTO notes (owner, value) VALUES ('alice', 'First note');
