const express = require('express');
const router = express.Router();

// In-memory store for quick restore; replace with DB as needed
let seq = 3;
let lists = [
  { id: 'watchlist', name: 'Watchlist', position: 0 },
  { id: 'favorites', name: 'Favorites', position: 1 },
  { id: 'docs',      name: 'Documentaries', position: 2 },
];

// Utilities
function sortByPos(a, b) { return (a.position ?? 0) - (b.position ?? 0); }

// GET all lists
router.get('/lists', async (_req, res) => {
  res.json(lists.slice().sort(sortByPos).map(l => ({ id: l.id, name: l.name })));
});

// POST create a new list
router.post('/lists', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = `list_${Date.now()}_${seq++}`;
  const position = lists.length;
  const rec = { id, name, position };
  lists.push(rec);
  res.status(201).json({ id, name });
});

// PATCH rename a list
router.patch('/lists/:id', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  const i = lists.findIndex(l => l.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'not found' });
  lists[i] = { ...lists[i], name };
  res.json({ id: lists[i].id, name: lists[i].name });
});

// DELETE a list
router.delete('/lists/:id', async (req, res) => {
  const i = lists.findIndex(l => l.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'not found' });
  lists.splice(i, 1);
  // re-sequence positions
  lists = lists.map((l, idx) => ({ ...l, position: idx }));
  res.status(204).end();
});

module.exports = { router };
