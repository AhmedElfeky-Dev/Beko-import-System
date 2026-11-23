const express = require("express");
const { get, run } = require("../db");
const { verifyToken, requireAdmin } = require("../middleware/auth");
const router = express.Router();

// ── GET /api/settings ── (public, no auth needed for branding to load on login page too)
router.get("/", (_req, res) => {
  const defaults = { companyName: "LogiTrack", logoUrl: "", logoWidth: 32, logoHeight: 32 };
  try {
    const row = get("SELECT data FROM settings WHERE id = ?", ["branding"]);
    if (!row) return res.json(defaults);
    try {
      return res.json(JSON.parse(row.data));
    } catch (parseErr) {
      console.error("GET /api/settings corrupt branding data, returning defaults:", parseErr?.message || parseErr);
      return res.json(defaults);
    }
  } catch (err) {
    console.error("GET /api/settings error:", err);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

// ── PUT /api/settings ── (admin only)
router.put("/", verifyToken, requireAdmin, (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { companyName, logoUrl, logoWidth, logoHeight } = body;

    if (companyName !== undefined && typeof companyName !== "string") {
      return res.status(400).json({ error: "companyName must be a string" });
    }
    if (logoUrl !== undefined && typeof logoUrl !== "string") {
      return res.status(400).json({ error: "logoUrl must be a string" });
    }

    // Validate logo size if base64 is provided (max 5MB)
    if (typeof logoUrl === "string" && logoUrl.length > 0) {
      const sizeInBytes = Math.ceil((logoUrl.length * 3) / 4);
      if (sizeInBytes > 5 * 1024 * 1024) {
        return res.status(400).json({ error: "Logo file exceeds 5 MB limit" });
      }
    }

    const parseDim = (value, fallback) => {
      if (value === undefined || value === null || value === "") return fallback;
      const n = Number(value);
      if (!Number.isFinite(n) || n < 1 || n > 2000) return null;
      return Math.round(n);
    };
    const w = parseDim(logoWidth, 32);
    const h = parseDim(logoHeight, 32);
    if (w === null || h === null) {
      return res.status(400).json({ error: "logoWidth and logoHeight must be numbers between 1 and 2000" });
    }

    const data = JSON.stringify({
      companyName: (typeof companyName === "string" ? companyName : "").trim() || "LogiTrack",
      logoUrl: typeof logoUrl === "string" ? logoUrl : "",
      logoWidth: w,
      logoHeight: h,
    });

    const existing = get("SELECT id FROM settings WHERE id = ?", ["branding"]);
    if (existing) {
      run("UPDATE settings SET data = ?, updated_at = datetime('now') WHERE id = ?", [data, "branding"]);
    } else {
      run("INSERT INTO settings (id, data) VALUES (?, ?)", ["branding", data]);
    }

    res.json(JSON.parse(data));
  } catch (err) {
    console.error("PUT /api/settings error:", err);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

// Excel Import/Export column configuration (authenticated users can read for export/import; admin manages)
router.get("/excel", verifyToken, (_req, res) => {
  try {
    const row = get("SELECT data FROM settings WHERE id = ?", ["excel_import_export"]);
    if (!row) return res.json({});
    try {
      const parsed = JSON.parse(row.data);
      return res.json(parsed && typeof parsed === "object" ? parsed : {});
    } catch (parseErr) {
      console.error("GET /api/settings/excel corrupt data, returning empty:", parseErr?.message || parseErr);
      return res.json({});
    }
  } catch (err) {
    console.error("GET /api/settings/excel error:", err);
    res.status(500).json({ error: "Failed to load Excel settings" });
  }
});

router.put("/excel", verifyToken, requireAdmin, (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : null;
    if (!body) return res.status(400).json({ error: "Invalid Excel settings payload" });
    const data = JSON.stringify(body);
    const existing = get("SELECT id FROM settings WHERE id = ?", ["excel_import_export"]);
    if (existing) {
      run("UPDATE settings SET data = ?, updated_at = datetime('now') WHERE id = ?", [data, "excel_import_export"]);
    } else {
      run("INSERT INTO settings (id, data) VALUES (?, ?)", ["excel_import_export", data]);
    }
    res.json(body);
  } catch (err) {
    console.error("PUT /api/settings/excel error:", err);
    res.status(500).json({ error: "Failed to save Excel settings" });
  }
});

module.exports = router;
