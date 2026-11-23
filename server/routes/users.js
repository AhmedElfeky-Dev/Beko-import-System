const express = require("express");
const bcrypt = require("bcryptjs");
const { all, get, run } = require("../db");
const { verifyToken, requireAdmin } = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();
router.use(verifyToken);

const PAGES = ["dashboard", "shipments", "costs", "settings"];
const LEVELS = ["none", "view", "edit"];
const ROLES = ["admin", "user"];

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function getFullUser(id) {
  const u = get("SELECT id, email, display_name, created_at FROM users WHERE id = ?", [id]);
  if (!u) return null;
  const roles = all("SELECT role FROM user_roles WHERE user_id = ?", [id]).map((r) => r.role);
  const perms = all("SELECT page, level FROM page_permissions WHERE user_id = ?", [id]);
  const permissions = { dashboard: "none", shipments: "none", costs: "none", settings: "none" };
  perms.forEach((p) => { permissions[p.page] = p.level; });
  return { ...u, roles, permissions };
}

// GET /api/users  (admin)
router.get("/", requireAdmin, (_req, res) => {
  const users = all("SELECT id FROM users ORDER BY created_at ASC", []);
  res.json(users.map((u) => getFullUser(u.id)).filter(Boolean));
});

// POST /api/users  (admin)
router.post("/", requireAdmin, (req, res) => {
  const body = req.body || {};
  const { email, password, display_name, role, permissions } = body;
  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    return res.status(400).json({ error: "email and password required" });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const roleValue = role === undefined || role === null || role === "" ? "user" : role;
  if (!ROLES.includes(roleValue)) return res.status(400).json({ error: "Invalid role" });
  if (permissions !== undefined && (typeof permissions !== "object" || permissions === null || Array.isArray(permissions))) {
    return res.status(400).json({ error: "permissions must be an object" });
  }

  const existing = get("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
  if (existing) return res.status(409).json({ error: "Email already exists" });
  const id = uuidv4();
  run("INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)", [
    id,
    normalizedEmail,
    bcrypt.hashSync(password, 10),
    isNonEmptyString(display_name) ? display_name.trim() : null,
  ]);
  run("INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)", [uuidv4(), id, roleValue]);
  const perms = permissions && typeof permissions === "object" ? permissions : {};
  for (const page of PAGES) {
    const level = LEVELS.includes(perms[page]) ? perms[page] : "none";
    run("INSERT INTO page_permissions (id, user_id, page, level) VALUES (?, ?, ?, ?)", [uuidv4(), id, page, level]);
  }
  res.status(201).json(getFullUser(id));
});

// PUT /api/users/:id  (self or admin)
router.put("/:id", (req, res) => {
  const { id } = req.params;
  if (!req.user.isAdmin && req.user.id !== id) return res.status(403).json({ error: "Forbidden" });
  const body = req.body || {};
  const { display_name, password, email } = body;

  if (email !== undefined) {
    if (!isNonEmptyString(email)) return res.status(400).json({ error: "Email cannot be empty" });
    const trimmedEmail = email.trim().toLowerCase();
    const existing = get("SELECT id FROM users WHERE email = ? AND id != ?", [trimmedEmail, id]);
    if (existing) return res.status(409).json({ error: "Email already in use by another account" });
    run("UPDATE users SET email = ? WHERE id = ?", [trimmedEmail, id]);
  }

  if (display_name !== undefined) {
    if (display_name !== null && typeof display_name !== "string") {
      return res.status(400).json({ error: "display_name must be a string" });
    }
    run("UPDATE users SET display_name = ? WHERE id = ?", [isNonEmptyString(display_name) ? display_name.trim() : null, id]);
  }

  if (password !== undefined) {
    if (!isNonEmptyString(password)) return res.status(400).json({ error: "password cannot be empty" });
    run("UPDATE users SET password_hash = ? WHERE id = ?", [bcrypt.hashSync(password, 10), id]);
  }

  const user = get("SELECT id, email, display_name FROM users WHERE id = ?", [id]);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

// DELETE /api/users/:id  (admin)
router.delete("/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  if (id === req.user.id) return res.status(400).json({ error: "You cannot delete your own account" });
  const existing = get("SELECT id FROM users WHERE id = ?", [id]);
  if (!existing) return res.status(404).json({ error: "User not found" });
  run("DELETE FROM user_roles WHERE user_id = ?", [id]);
  run("DELETE FROM page_permissions WHERE user_id = ?", [id]);
  run("DELETE FROM users WHERE id = ?", [id]);
  res.json({ ok: true });
});

// GET /api/users/:id/permissions  (admin)
router.get("/:id/permissions", requireAdmin, (req, res) => {
  const perms = all("SELECT page, level FROM page_permissions WHERE user_id = ?", [req.params.id]);
  const permissions = { dashboard: "none", shipments: "none", costs: "none", settings: "none" };
  perms.forEach((p) => { permissions[p.page] = p.level; });
  res.json(permissions);
});

// PUT /api/users/:id/permissions  (admin)
router.put("/:id/permissions", requireAdmin, (req, res) => {
  const { id } = req.params;
  const perms = req.body;
  if (!perms || typeof perms !== "object") return res.status(400).json({ error: "Permissions object required" });
  for (const page of PAGES) {
    const level = LEVELS.includes(perms[page]) ? perms[page] : "none";
    const existing = get("SELECT id FROM page_permissions WHERE user_id = ? AND page = ?", [id, page]);
    if (existing) {
      run("UPDATE page_permissions SET level = ?, updated_at = datetime('now') WHERE id = ?", [level, existing.id]);
    } else {
      run("INSERT INTO page_permissions (id, user_id, page, level) VALUES (?, ?, ?, ?)", [uuidv4(), id, page, level]);
    }
  }
  res.json({ ok: true });
});

// GET /api/users/:id/roles  (admin)
router.get("/:id/roles", requireAdmin, (req, res) => {
  res.json(all("SELECT role FROM user_roles WHERE user_id = ?", [req.params.id]).map((r) => r.role));
});

// PUT /api/users/:id/roles  (admin)
router.put("/:id/roles", requireAdmin, (req, res) => {
  const { id } = req.params;
  const { roles } = req.body || {};
  if (!Array.isArray(roles)) return res.status(400).json({ error: "roles[] required" });
  if (!roles.every((r) => ROLES.includes(r))) return res.status(400).json({ error: "Invalid role" });
  const uniqueRoles = [...new Set(roles)];
  if (uniqueRoles.length === 0) return res.status(400).json({ error: "At least one role is required" });
  const existing = get("SELECT id FROM users WHERE id = ?", [id]);
  if (!existing) return res.status(404).json({ error: "User not found" });
  run("DELETE FROM user_roles WHERE user_id = ?", [id]);
  for (const role of uniqueRoles) {
    run("INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)", [uuidv4(), id, role]);
  }
  res.json({ ok: true });
});

module.exports = router;
