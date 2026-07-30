const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

require('./db'); // initialise schema + seed on startup

const tasksRouter = require('./routes/tasks');
const assigneesRouter = require('./routes/assignees');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- API ------------------------------------------------------------------
app.use('/api/tasks', tasksRouter);
app.use('/api/assignees', assigneesRouter);
app.get('/api/health', (req, res) => res.json({ ok: true }));

// --- Static frontend ------------------------------------------------------
// In the Docker image the built React app is copied to ./public and served
// by Express so the whole app runs as a single container.
const publicDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  // SPA fallback: send index.html for any non-API route.
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
