const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { get, all } = require("../db");
const { verifyToken, JWT_SECRET } = require("../middleware/auth");

const router = express.Router();

// Lightweight in-memory login rate limiting (single-process/local server).
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILED = 10;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const loginFailures = new Map(); // key -> { count, firstFailedAt, blockedUntil }

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function getLoginKey(req, email) {
  return `${getClientIp(req)}|${String(email || "").trim().toLowerCase() || "unknown"}`;
}

function getLoginEntry(key, now) {
  const entry = loginFailures.get(key);
  if (!entry) return null;
  if (entry.blockedUntil && entry.blockedUntil <= now) {
    loginFailures.delete(key);
    return null;
  }
  if (!entry.blockedUntil && now - entry.firstFailedAt > LOGIN_WINDOW_MS) {
    loginFailures.delete(key);
    return null;
  }
  return entry;
}

function isLoginBlocked(key, now) {
  const entry = getLoginEntry(key, now);
  return !!(entry && entry.blockedUntil && entry.blockedUntil > now);
}

function recordLoginFailure(key, now) {
  let entry = getLoginEntry(key, now);
  if (!entry) {
    entry = { count: 0, firstFailedAt: now, blockedUntil: 0 };
  }
  entry.count += 1;
  if (entry.count >= LOGIN_MAX_FAILED) {
    entry.blockedUntil = now + LOGIN_BLOCK_MS;
  }
  loginFailures.set(key, entry);
  return entry;
}

function clearLoginFailures(key) {
  loginFailures.delete(key);
}

function buildUserPayload(user) {
  const roles = all("SELECT role FROM user_roles WHERE user_id = ?", [user.id]);
  const isAdmin = roles.some((r) => r.role === "admin");
  const perms = all("SELECT page, level FROM page_permissions WHERE user_id = ?", [user.id]);
  const permissions = { dashboard: "none", shipments: "none", costs: "none", settings: "none" };
  perms.forEach((p) => { permissions[p.page] = p.level; });
  if (isAdmin) Object.keys(permissions).forEach((k) => { permissions[k] = "edit"; });
  return { id: user.id, email: user.email, displayName: user.display_name || user.email, isAdmin, permissions };
}

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const normalizedEmail = String(email).trim().toLowerCase();
  const now = Date.now();
  const key = getLoginKey(req, normalizedEmail);

  if (isLoginBlocked(key, now)) {
    const entry = getLoginEntry(key, now);
    const retryAfterSec = entry?.blockedUntil ? Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000)) : Math.ceil(LOGIN_BLOCK_MS / 1000);
    res.set("Retry-After", String(retryAfterSec));
    return res.status(429).json({ error: "Too many failed login attempts. Please try again later.", retryAfterSec });
  }

  const user = get("SELECT * FROM users WHERE email = ?", [normalizedEmail]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    const entry = recordLoginFailure(key, now);
    if (entry.blockedUntil && entry.blockedUntil > now) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000));
      res.set("Retry-After", String(retryAfterSec));
      return res.status(429).json({ error: "Too many failed login attempts. Please try again later.", retryAfterSec });
    }
    return res.status(401).json({ error: "Invalid email or password" });
  }

  clearLoginFailures(key);
  const payload = buildUserPayload(user);
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: payload });
});

// POST /api/auth/logout
router.post("/logout", (_req, res) => res.json({ ok: true }));

// GET /api/auth/me
router.get("/me", verifyToken, (req, res) => {
  const user = get("SELECT id, email, display_name FROM users WHERE id = ?", [req.user.id]);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(buildUserPayload(user));
});

module.exports = router;
