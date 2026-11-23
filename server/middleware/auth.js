const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { get, all } = require("../db");

function loadOrCreateJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const secretPath = path.join(__dirname, "..", ".jwt-secret");
  try {
    if (fs.existsSync(secretPath)) {
      const existing = fs.readFileSync(secretPath, "utf8").trim();
      if (existing) return existing;
    }
  } catch {
    // fall through to generate
  }
  const generated = crypto.randomBytes(48).toString("hex");
  try {
    fs.writeFileSync(secretPath, generated, { encoding: "utf8", mode: 0o600 });
  } catch {
    // best effort; still return generated secret for this process
  }
  return generated;
}

const JWT_SECRET = loadOrCreateJwtSecret();

function buildFreshUser(userId) {
  const user = get("SELECT id, email, display_name FROM users WHERE id = ?", [userId]);
  if (!user) return null;

  const roles = all("SELECT role FROM user_roles WHERE user_id = ?", [userId]);
  const isAdmin = roles.some((r) => r.role === "admin");
  const perms = all("SELECT page, level FROM page_permissions WHERE user_id = ?", [userId]);
  const permissions = { dashboard: "none", shipments: "none", costs: "none", settings: "none" };
  perms.forEach((p) => {
    if (p && p.page in permissions) permissions[p.page] = p.level || "none";
  });
  if (isAdmin) {
    Object.keys(permissions).forEach((k) => {
      permissions[k] = "edit";
    });
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name || user.email,
    isAdmin,
    permissions,
  };
}

function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.slice(7);

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  if (!decoded || !decoded.id) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  try {
    const fresh = buildFreshUser(decoded.id);
    if (!fresh) return res.status(401).json({ error: "Unauthorized" });
    req.user = fresh;
    next();
  } catch (err) {
    // Internal errors (e.g. DB failures) must not be reported as invalid tokens.
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

function hasPermission(user, page, level = "view") {
  if (!user) return false;
  if (user.isAdmin) return true;
  const perms = user.permissions || {};
  const lvl = perms[page] || "none";
  if (level === "view") return lvl === "view" || lvl === "edit";
  return lvl === "edit";
}

function requirePermission(page, level = "view") {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!hasPermission(req.user, page, level)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

module.exports = { verifyToken, requireAdmin, requirePermission, JWT_SECRET };
