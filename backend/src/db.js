const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// The SQLite file lives in a directory that is mounted as a Docker volume so
// data survives container restarts. Override with DB_PATH if desired.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');

// Make sure the parent directory exists (first run / fresh volume).
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema ---------------------------------------------------------------
// Note: node COLOR is intentionally NOT stored. It is always derived from
// isDone + deadline + the state of descendants, to avoid stale data.
db.exec(`
  CREATE TABLE IF NOT EXISTS assignees (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    createdAt  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    description TEXT,
    parentId    INTEGER,
    isDone      INTEGER NOT NULL DEFAULT 0,
    deadline    TEXT,
    assigneeId  INTEGER,
    positionX   REAL NOT NULL DEFAULT 0,
    positionY   REAL NOT NULL DEFAULT 0,
    isCollapsed INTEGER NOT NULL DEFAULT 0,
    createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt   TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (parentId)   REFERENCES tasks(id)     ON DELETE CASCADE,
    FOREIGN KEY (assigneeId) REFERENCES assignees(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_parentId ON tasks(parentId);
`);

// --- Migrations -----------------------------------------------------------
// Existing databases (created before isCollapsed existed) are upgraded in
// place so old Docker volumes keep working after a rebuild.
const taskColumns = db.prepare("PRAGMA table_info(tasks)").all().map((c) => c.name);
if (!taskColumns.includes('isCollapsed')) {
  db.exec('ALTER TABLE tasks ADD COLUMN isCollapsed INTEGER NOT NULL DEFAULT 0');
}

// Seed a single root node the first time the app runs so the canvas is never
// empty (a mind map needs at least one root topic to branch from).
const taskCount = db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n;
if (taskCount === 0) {
  db.prepare(
    'INSERT INTO tasks (title, description, parentId, positionX, positionY) VALUES (?, ?, NULL, ?, ?)'
  ).run('My Project', 'Root topic — add child tasks to branch out.', 0, 0);
}

module.exports = db;
