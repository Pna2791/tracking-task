const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/assignees — list everyone available for task assignment.
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM assignees ORDER BY name COLLATE NOCASE').all();
  res.json(rows);
});

// POST /api/assignees — add a new person to the shared list.
router.post('/', (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });

  const info = db.prepare('INSERT INTO assignees (name) VALUES (?)').run(name);
  const row = db.prepare('SELECT * FROM assignees WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

// PUT /api/assignees/:id — rename a person.
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });

  const existing = db.prepare('SELECT * FROM assignees WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Assignee not found' });

  db.prepare('UPDATE assignees SET name = ? WHERE id = ?').run(name, id);
  res.json(db.prepare('SELECT * FROM assignees WHERE id = ?').get(id));
});

// DELETE /api/assignees/:id — remove a person. Tasks that referenced them
// have assigneeId set to NULL automatically (ON DELETE SET NULL).
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM assignees WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Assignee not found' });

  db.prepare('DELETE FROM assignees WHERE id = ?').run(id);
  res.json({ deletedId: id });
});

module.exports = router;
