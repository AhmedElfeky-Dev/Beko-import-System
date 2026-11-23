const express = require("express");
const { all, get, run } = require("../db");
const { verifyToken, requirePermission } = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();
router.use(verifyToken);

const MASTER_CATEGORIES = new Set([
  "supplier_name",
  "country_of_origin",
  "carrier",
  "shipping_line",
  "pol",
  "pod",
  "broker",
  "payment_term",
  "incoterm",
  "bank_name",
  "owner",
  "cost_item",
]);

function isValidCategory(category) {
  return typeof category === "string" && MASTER_CATEGORIES.has(category);
}

// GET /api/master-data  (?category=xxx)
router.get("/", (req, res) => {
  const { category } = req.query;
  const rows = category
    ? all("SELECT id, category, value, code FROM master_data WHERE category = ? ORDER BY value ASC", [category])
    : all("SELECT id, category, value, code FROM master_data ORDER BY value ASC", []);
  res.json(rows);
});

// POST /api/master-data
router.post("/", requirePermission("settings", "edit"), (req, res) => {
  const { category, value, code } = req.body || {};
  if (!isValidCategory(category) || !String(value || "").trim()) {
    return res.status(400).json({ error: "valid category and value required" });
  }
  const v = String(value).trim();
  const c = (code ?? "").toString().trim() || null;
  const dup = get("SELECT id FROM master_data WHERE category = ? AND lower(value) = lower(?)", [category, v]);
  if (dup) return res.json({ id: dup.id, category, value: v, code: c });
  const id = uuidv4();
  run("INSERT INTO master_data (id, category, value, code) VALUES (?, ?, ?, ?)", [id, category, v, c]);
  res.status(201).json({ id, category, value: v, code: c });
});

// POST /api/master-data/bulk
router.post("/bulk", requirePermission("settings", "edit"), (req, res) => {
  const { category, values } = req.body || {};
  if (!isValidCategory(category) || !Array.isArray(values)) {
    return res.status(400).json({ error: "valid category and values[] required" });
  }
  const existing = all("SELECT lower(value) as lv FROM master_data WHERE category = ?", [category]).map((r) => r.lv);
  const existingSet = new Set(existing);
  let added = 0;
  for (const raw of values) {
    const obj = typeof raw === "string" ? { value: raw, code: null } : raw;
    if (!obj || typeof obj !== "object") continue;
    const v = String(obj.value ?? "").trim();
    if (!v || existingSet.has(v.toLowerCase())) continue;
    run("INSERT OR IGNORE INTO master_data (id, category, value, code) VALUES (?, ?, ?, ?)", [uuidv4(), category, v, (obj.code ?? "").toString().trim() || null]);
    existingSet.add(v.toLowerCase());
    added++;
  }
  res.json({ added, skipped: values.length - added });
});

// PUT /api/master-data/:id
router.put("/:id", requirePermission("settings", "edit"), (req, res) => {
  const { value, code } = req.body || {};
  const existing = get("SELECT id, category, value, code FROM master_data WHERE id = ?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Not found" });

  if (value !== undefined) {
    const v = String(value).trim();
    if (!v) return res.status(400).json({ error: "value cannot be empty" });
    const dup = get(
      "SELECT id FROM master_data WHERE category = ? AND lower(value) = lower(?) AND id != ?",
      [existing.category, v, req.params.id]
    );
    if (dup) return res.status(409).json({ error: "Value already exists in this category" });
    run("UPDATE master_data SET value = ?, updated_at = datetime('now') WHERE id = ?", [v, req.params.id]);
  }

  if (code !== undefined) {
    run(
      "UPDATE master_data SET code = ?, updated_at = datetime('now') WHERE id = ?",
      [(code ?? "").toString().trim() || null, req.params.id]
    );
  }

  const updated = get("SELECT id, category, value, code FROM master_data WHERE id = ?", [req.params.id]);
  res.json(updated);
});

// DELETE /api/master-data/:id
router.delete("/:id", requirePermission("settings", "edit"), (req, res) => {
  const existing = get("SELECT id FROM master_data WHERE id = ?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Not found" });
  run("DELETE FROM master_data WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
