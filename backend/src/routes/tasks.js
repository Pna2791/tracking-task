const express = require('express');
const db = require('../db');

const router = express.Router();

// Convert a DB row (SQLite stores booleans as 0/1) into a clean JSON shape.
function serialize(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    parentId: row.parentId,
    isDone: !!row.isDone,
    deadline: row.deadline,
    assigneeId: row.assigneeId,
    positionX: row.positionX,
    positionY: row.positionY,
    isCollapsed: !!row.isCollapsed,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// GET /api/tasks — return the whole tree as a flat list.
// The frontend builds the parent/child structure (and derives colors) from
// parentId, which keeps the API simple and the color logic in one place.
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM tasks ORDER BY id').all();
  res.json(rows.map(serialize));
});

// POST /api/tasks — create a task (root if parentId is null/omitted).
router.post('/', (req, res) => {
  const {
    title = 'New task',
    description = null,
    parentId = null,
    deadline = null,
    assigneeId = null,
    positionX = 0,
    positionY = 0,
  } = req.body || {};

  if (parentId !== null) {
    const parent = db.prepare('SELECT id FROM tasks WHERE id = ?').get(parentId);
    if (!parent) return res.status(400).json({ error: 'parentId does not exist' });
  }

  const info = db
    .prepare(
      `INSERT INTO tasks (title, description, parentId, deadline, assigneeId, positionX, positionY)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(title, description, parentId, deadline, assigneeId, positionX, positionY);

  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(serialize(row));
});

// True if `candidateId` is `id` or any descendant of `id` (walk via parentId).
function isSelfOrDescendant(id, candidateId) {
  if (id === candidateId) return true;
  let current = db.prepare('SELECT parentId FROM tasks WHERE id = ?').get(candidateId);
  while (current && current.parentId != null) {
    if (current.parentId === id) return true;
    current = db.prepare('SELECT parentId FROM tasks WHERE id = ?').get(current.parentId);
  }
  return false;
}

// PUT /api/tasks/:id — partial update of any editable field (including parentId).
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  // Only overwrite fields that were actually provided in the request body.
  const fields = [
    'title',
    'description',
    'isDone',
    'deadline',
    'assigneeId',
    'positionX',
    'positionY',
    'isCollapsed',
    'parentId',
  ];
  const updates = {};
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(req.body, f)) updates[f] = req.body[f];
  }
  if ('isDone' in updates) updates.isDone = updates.isDone ? 1 : 0;
  if ('isCollapsed' in updates) updates.isCollapsed = updates.isCollapsed ? 1 : 0;

  if ('parentId' in updates) {
    const newParentId = updates.parentId == null ? null : Number(updates.parentId);
    if (newParentId === null) {
      updates.parentId = null;
    } else {
      if (Number.isNaN(newParentId)) {
        return res.status(400).json({ error: 'parentId must be a number or null' });
      }
      const parent = db.prepare('SELECT id FROM tasks WHERE id = ?').get(newParentId);
      if (!parent) return res.status(400).json({ error: 'parentId does not exist' });
      // Reject cycles: cannot move a node under itself or one of its descendants.
      if (isSelfOrDescendant(id, newParentId)) {
        return res.status(400).json({ error: 'Cannot reparent under self or a descendant' });
      }
      updates.parentId = newParentId;
    }
  }

  if (Object.keys(updates).length === 0) return res.json(serialize(existing));

  const setClause = Object.keys(updates)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  db.prepare(`UPDATE tasks SET ${setClause}, updatedAt = datetime('now') WHERE id = @id`).run({
    ...updates,
    id,
  });

  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  res.json(serialize(row));
});

// DELETE /api/tasks/:id — deletes the task and (via ON DELETE CASCADE) all
// of its descendants. Returns the list of deleted ids so the UI can prune.
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  // Gather descendant ids up front (cascade handles the actual deletion).
  const toDelete = [];
  const stack = [id];
  while (stack.length) {
    const current = stack.pop();
    toDelete.push(current);
    const children = db.prepare('SELECT id FROM tasks WHERE parentId = ?').all(current);
    for (const c of children) stack.push(c.id);
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  res.json({ deletedIds: toDelete });
});

module.exports = router;
