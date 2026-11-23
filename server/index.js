const express = require("express");
const cors = require("cors");
const { initDb } = require("./db");

const app = express();
const PORT = process.env.PORT || 3001;

const defaultCorsOrigins = ["http://localhost:8080", "http://localhost:5173", "http://localhost:3000"];
const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use(cors({ origin: corsOrigins.length ? corsOrigins : defaultCorsOrigins }));
app.use(express.json({ limit: "10mb" }));

// Basic security headers (no strict CSP in this batch)
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// Lightweight in-memory general API rate limiting (single-process/local server)
const API_RATE_WINDOW_MS = 15 * 60 * 1000;
const API_RATE_MAX = 300;
const apiRateHits = new Map();
app.use("/api", (req, res, next) => {
  const now = Date.now();
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  let entry = apiRateHits.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + API_RATE_WINDOW_MS };
  }
  entry.count += 1;
  apiRateHits.set(ip, entry);

  if (apiRateHits.size > 5000) {
    for (const [k, v] of apiRateHits) {
      if (now >= v.resetAt) apiRateHits.delete(k);
    }
  }

  if (entry.count > API_RATE_MAX) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.set("Retry-After", String(retryAfterSec));
    return res.status(429).json({ error: "Too many requests. Please try again later.", retryAfterSec });
  }
  next();
});

// ── Start only after DB is ready ──
initDb().then(() => {
  app.use("/api/auth", require("./routes/auth"));
  app.use("/api/shipments", require("./routes/shipments"));
  app.use("/api/master-data", require("./routes/masterData"));
  app.use("/api/users", require("./routes/users"));
  app.use("/api/settings", require("./routes/settings"));

  app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  // Centralized error handler (must be after routes/404)
  app.use((err, _req, res, next) => {
    if (err?.type === "entity.parse.failed" || (err instanceof SyntaxError && err.status === 400 && "body" in err)) {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
    console.error("Unhandled server error:", err);
    if (res.headersSent) return next(err);
    const status = typeof err?.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 500;
    const message = status >= 500 ? "Internal server error" : (err?.message || "Request error");
    res.status(status).json({ error: message });
  });

  app.listen(PORT, () => {
    console.log(`\n🚀 SwiftCargo local server running on http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health\n`);
  });
}).catch((err) => {
  console.error("❌ Failed to initialize database:", err);
  process.exit(1);
});
