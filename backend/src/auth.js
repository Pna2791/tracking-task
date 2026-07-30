const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || 'Derichs2026';
const COOKIE_NAME = 'tracking_task_auth';
const COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days

// Derive a stable session token from the password so restarts don't log everyone out
// unless ACCESS_PASSWORD (or SESSION_SECRET) changes.
function sessionSecret() {
  const salt = process.env.SESSION_SECRET || 'tracking-task-session-v1';
  return crypto.createHmac('sha256', salt).update(ACCESS_PASSWORD).digest();
}

function authToken() {
  return crypto.createHmac('sha256', sessionSecret()).update('authenticated').digest('hex');
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

function isAuthenticated(req) {
  const token = parseCookies(req)[COOKIE_NAME] || '';
  if (!token) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(authToken()));
  } catch {
    return false;
  }
}

function setAuthCookie(res) {
  const secure = process.env.COOKIE_SECURE === 'true';
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(authToken())}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${COOKIE_MAX_AGE_SEC}`,
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearAuthCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
  );
}

function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const nextUrl = req.originalUrl && req.originalUrl !== '/' ? req.originalUrl : '/';
  return res.redirect(302, `/login?next=${encodeURIComponent(nextUrl)}`);
}

function passwordsMatch(provided) {
  const a = crypto.createHash('sha256').update(String(provided || ''), 'utf8').digest();
  const b = crypto.createHash('sha256').update(ACCESS_PASSWORD, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

const loginPagePath = path.join(__dirname, 'login.html');

function sendLoginPage(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(loginPagePath);
}

module.exports = {
  ACCESS_PASSWORD,
  isAuthenticated,
  requireAuth,
  passwordsMatch,
  setAuthCookie,
  clearAuthCookie,
  sendLoginPage,
  loginPagePath,
};
