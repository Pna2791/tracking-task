const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

require('./db'); // initialise schema + seed on startup

const tasksRouter = require('./routes/tasks');
const assigneesRouter = require('./routes/assignees');
const {
  isAuthenticated,
  requireAuth,
  passwordsMatch,
  setAuthCookie,
  clearAuthCookie,
  sendLoginPage,
} = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// --- Public auth + health -------------------------------------------------
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/auth/status', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

app.post('/api/auth/login', (req, res) => {
  const password = req.body && req.body.password;
  if (!passwordsMatch(password)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  setAuthCookie(res);
  return res.json({ authenticated: true });
});

app.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res);
  return res.json({ authenticated: false });
});

app.get('/login', (req, res) => {
  if (isAuthenticated(req)) {
    return res.redirect(302, '/');
  }
  return sendLoginPage(res);
});

// Everything below requires a valid access cookie.
app.use(requireAuth);

// --- API ------------------------------------------------------------------
app.use('/api/tasks', tasksRouter);
app.use('/api/assignees', assigneesRouter);

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
