const express = require("express");
const { all, get, run } = require("../db");
const { verifyToken, requirePermission } = require("../middleware/auth");

const router = express.Router();
router.use(verifyToken);

// GET /api/shipments
router.get("/", requirePermission("shipments", "view"), (_req, res) => {
  const rows = all("SELECT id, data FROM shipments ORDER BY created_at DESC", []);
  const shipments = [];
  for (const r of rows) {
    try {
      shipments.push(JSON.parse(r.data));
    } catch (err) {
      console.warn(`Skipping corrupt shipment row ${r.id}:`, err?.message || err);
    }
  }
  res.json(shipments);
});

// GET /api/shipments/:id
router.get("/:id", requirePermission("shipments", "view"), (req, res) => {
  const row = get("SELECT data FROM shipments WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Shipment not found" });
  try {
    res.json(JSON.parse(row.data));
  } catch (err) {
    console.error(`Corrupt shipment data for ${req.params.id}:`, err?.message || err);
    res.status(500).json({ error: "Corrupted shipment data" });
  }
});

// POST /api/shipments
router.post("/", requirePermission("shipments", "edit"), (req, res) => {
  const shipment = req.body;
  if (!shipment || typeof shipment !== "object" || Array.isArray(shipment)) {
    return res.status(400).json({ error: "Shipment data required" });
  }
  if (typeof shipment.id !== "string" || !shipment.id.trim()) {
    return res.status(400).json({ error: "Shipment data with id required" });
  }
  const existing = get("SELECT id FROM shipments WHERE id = ?", [shipment.id]);
  if (existing) return res.status(409).json({ error: "Shipment with this id already exists" });
  run("INSERT INTO shipments (id, data) VALUES (?, ?)", [shipment.id, JSON.stringify(shipment)]);
  res.status(201).json(shipment);
});

// POST /api/shipments/bulk
router.post("/bulk", requirePermission("shipments", "edit"), (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { shipments } = body;
  if (!Array.isArray(shipments)) return res.status(400).json({ error: "shipments array required" });
  let added = 0;
  let skipped = 0;
  for (const s of shipments) {
    if (!s || typeof s !== "object" || Array.isArray(s) || typeof s.id !== "string" || !s.id.trim()) {
      skipped++;
      continue;
    }
    const existing = get("SELECT id FROM shipments WHERE id = ?", [s.id]);
    if (existing) {
      skipped++;
      continue;
    }
    run("INSERT INTO shipments (id, data, updated_at) VALUES (?, ?, datetime('now'))", [s.id, JSON.stringify(s)]);
    added++;
  }
  res.json({ added, skipped });
});

// PUT /api/shipments/:id
router.put("/:id", requirePermission("shipments", "edit"), (req, res) => {
  const shipment = req.body;
  if (!shipment || typeof shipment !== "object" || Array.isArray(shipment)) {
    return res.status(400).json({ error: "Shipment data required" });
  }
  const existing = get("SELECT id FROM shipments WHERE id = ?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Shipment not found" });
  shipment.id = req.params.id;
  run("UPDATE shipments SET data = ?, updated_at = datetime('now') WHERE id = ?", [JSON.stringify(shipment), req.params.id]);
  res.json(shipment);
});

// PATCH /api/shipments/:id  — partial update (quick-update drawer)
router.patch("/:id", requirePermission("shipments", "edit"), (req, res) => {
  const patch = req.body;
  if (!patch || typeof patch !== "object") return res.status(400).json({ error: "Patch body required" });
  const row = get("SELECT data FROM shipments WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Shipment not found" });
  let existing;
  try {
    existing = JSON.parse(row.data);
  } catch (err) {
    console.error(`Corrupt shipment data for ${req.params.id}:`, err?.message || err);
    return res.status(500).json({ error: "Corrupted shipment data" });
  }
  const merged = { ...existing, ...patch, id: req.params.id };
  run("UPDATE shipments SET data = ?, updated_at = datetime('now') WHERE id = ?", [JSON.stringify(merged), req.params.id]);
  res.json(merged);
});

// DELETE /api/shipments/:id
router.delete("/:id", requirePermission("shipments", "edit"), (req, res) => {
  const existing = get("SELECT id FROM shipments WHERE id = ?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Shipment not found" });
  run("DELETE FROM shipments WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
