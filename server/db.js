/**
 * db.js — SQLite via sql.js (pure JS, no native compilation needed)
 *
 * sql.js runs entirely in JS and keeps the DB in memory.
 * We persist it to disk (store.db) after every write by calling `saveDb()`.
 */

const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");

const DB_PATH = path.join(__dirname, "store.db");

let db; // sql.js Database instance

/** Persist current in-memory DB to disk */
function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  const tmpPath = `${DB_PATH}.tmp`;
  try {
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, DB_PATH);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup failure
    }
    const msg = err && err.message ? err.message : String(err);
    throw new Error(`Failed to persist database: ${msg}`);
  }
}

/** Run a statement that modifies data and auto-save */
function run(sql, params = []) {
  db.run(sql, params);
  // Persist immediately; surface persistence failures explicitly.
  // Note: sql.js in-memory state may already be mutated if persistence fails.
  saveDb();
}

/** Return all rows as array of plain objects */
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/** Return the first row or undefined */
function get(sql, params = []) {
  const rows = all(sql, params);
  return rows[0];
}

// ── Schema ──
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name  TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_roles (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    role       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS page_permissions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    page       TEXT NOT NULL,
    level      TEXT NOT NULL DEFAULT 'none',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS shipments (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS master_data (
    id         TEXT PRIMARY KEY,
    category   TEXT NOT NULL,
    value      TEXT NOT NULL,
    code       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

// ── Seed data ──
const SAMPLE_SHIPMENTS = [
  {
    id: "SHP-001", shipmentType: "SEA", poNumber: "PO-2024-0451", supplierName: "Bosch Home Appliances",
    countryOfOrigin: "Germany", factory: "Oven", acidNumber: "ACID-78901", masterBL: "MAEU123456789",
    houseBL: "HBL-001-2024", doDate: "2024-12-15", customsCertNumber: "CC-2024-1101",
    customsCertDate: "2024-12-18", invoiceNumber: "INV-2024-0451", invoiceValue: 125000,
    currency: "EUR", paymentTerm: "Open Account", incoterm: "CIF", bankName: "Deutsche Bank",
    etd: "2024-11-20", etaPort: "2024-12-10", etaFactory: "2024-12-18", ataFactory: "2024-12-18",
    status: "Released", containers: [{ id: "C001", containerType: "40HC", quantity: 2 }],
    carrier: "Maersk", pol: "Hamburg", pod: "Jeddah", preAlertDate: "2024-11-18",
    originalDocsDate: "2024-11-25", cargoxDate: "2024-11-22", form4ReceivingDate: "2024-12-01",
    broker: "DHL Global Forwarding", freeDays: 14,
    costs: [
      { id: "CST001", type: "Freight", amount: 4500, currency: "USD" },
      { id: "CST002", type: "THC USD", amount: 800, currency: "USD" },
      { id: "CST003", type: "Customs Clearance", amount: 2100, currency: "USD" },
      { id: "CST004", type: "Import Duty", amount: 6250, currency: "USD" },
      { id: "CST005", type: "Transportation", amount: 1200, currency: "USD" }
    ],
    documents: [
      { type: "Invoice", status: "Received", receivedDate: "2024-12-12" },
      { type: "Packing List", status: "Received", receivedDate: "2024-12-12" },
      { type: "Bill of Lading", status: "Received", receivedDate: "2024-12-12" },
      { type: "COO", status: "Received", receivedDate: "2024-12-12" },
      { type: "EUR1", status: "Received", receivedDate: "2024-12-12" }
    ],
    createdAt: "2024-11-15", exchangeRateUSD: 50.5, exchangeRateEUR: 55.0,
    baseCurrency: "EGP", f4CommissionRate: 1.2, seaMode: "FCL"
  },
  {
    id: "SHP-002", shipmentType: "SEA", poNumber: "PO-2024-0467", supplierName: "Whirlpool Corp",
    countryOfOrigin: "Italy", factory: "Dishwasher", acidNumber: "ACID-78920",
    masterBL: "MSCU987654321", houseBL: "HBL-002-2024", customsCertNumber: "",
    invoiceNumber: "INV-2024-0467", invoiceValue: 89000, currency: "EUR", paymentTerm: "CAD",
    incoterm: "FOB", bankName: "UniCredit", etd: "2024-12-01", etaPort: "2024-12-20",
    etaFactory: "2024-12-28", status: "In Transit",
    containers: [{ id: "C002", containerType: "40GP", quantity: 1 }],
    carrier: "MSC", pol: "Genoa", pod: "Jeddah", preAlertDate: "2024-11-29",
    cargoxDate: "2024-12-03", broker: "Agility Logistics", freeDays: 10,
    costs: [
      { id: "CST006", type: "Freight", amount: 3200, currency: "USD" },
      { id: "CST007", type: "THC USD", amount: 600, currency: "USD" }
    ],
    documents: [
      { type: "Invoice", status: "Pending" }, { type: "Packing List", status: "Pending" },
      { type: "Bill of Lading", status: "Pending" }, { type: "COO", status: "Pending" },
      { type: "EUR1", status: "Pending" }
    ],
    createdAt: "2024-11-28", exchangeRateUSD: 50.5, exchangeRateEUR: 55.0,
    baseCurrency: "EGP", f4CommissionRate: 1.2, seaMode: "FCL"
  },
  {
    id: "SHP-003", shipmentType: "AIR", poNumber: "PO-2024-0480", supplierName: "LG Electronics",
    countryOfOrigin: "South Korea", factory: "Ref", acidNumber: "ACID-79001",
    masterBL: "AWB-180-12345678", houseBL: "", customsCertNumber: "CC-2024-1205",
    customsCertDate: "2024-12-22", invoiceNumber: "INV-2024-0480", invoiceValue: 210000,
    currency: "USD", paymentTerm: "Advance", incoterm: "DDP", bankName: "KEB Hana Bank",
    etd: "2024-12-10", etaPort: "2024-12-12", etaFactory: "2024-12-15", status: "At Customs",
    containers: [], carrier: "Korean Air Cargo", pol: "Incheon", pod: "Jeddah",
    preAlertDate: "2024-12-08", originalDocsDate: "2024-12-09", broker: "Kuehne+Nagel",
    costs: [
      { id: "CST008", type: "Freight", amount: 12000, currency: "USD" },
      { id: "CST009", type: "Customs Clearance", amount: 4500, currency: "USD" },
      { id: "CST010", type: "Import Duty", amount: 10500, currency: "USD" }
    ],
    documents: [
      { type: "Invoice", status: "Received", receivedDate: "2024-12-11" },
      { type: "Packing List", status: "Received", receivedDate: "2024-12-11" },
      { type: "Bill of Lading", status: "Received", receivedDate: "2024-12-11" },
      { type: "COO", status: "Pending" }, { type: "EUR1", status: "Pending" }
    ],
    createdAt: "2024-12-05", exchangeRateUSD: 50.5, exchangeRateEUR: 55.0,
    baseCurrency: "EGP", f4CommissionRate: 1.2, weightKg: 1500, cbm: 8.5
  },
  {
    id: "SHP-004", shipmentType: "SEA", poNumber: "PO-2024-0495", supplierName: "Electrolux",
    countryOfOrigin: "Sweden", factory: "CAPEX", acidNumber: "ACID-79100",
    masterBL: "", houseBL: "", customsCertNumber: "", invoiceNumber: "INV-2024-0495",
    invoiceValue: 340000, currency: "EUR", paymentTerm: "FOC", incoterm: "EXW",
    bankName: "SEB", etd: "", etaPort: "", etaFactory: "", status: "Not Shipped",
    containers: [{ id: "C004", containerType: "40HC", quantity: 4 }],
    carrier: "", pol: "Gothenburg", pod: "Jeddah", broker: "DB Schenker", freeDays: 21,
    costs: [],
    documents: [
      { type: "Invoice", status: "Pending" }, { type: "Packing List", status: "Pending" },
      { type: "Bill of Lading", status: "Pending" }, { type: "COO", status: "Pending" },
      { type: "EUR1", status: "Pending" }
    ],
    createdAt: "2024-12-10", exchangeRateUSD: 50.5, exchangeRateEUR: 55.0,
    baseCurrency: "EGP", f4CommissionRate: 1.2, seaMode: "FCL"
  },
  {
    id: "SHP-005", shipmentType: "SEA", poNumber: "PO-2024-0410", supplierName: "Samsung Electronics",
    countryOfOrigin: "Vietnam", factory: "Ref", acidNumber: "ACID-78800",
    masterBL: "OOLU5566778899", houseBL: "HBL-005-2024", doDate: "2024-11-25",
    customsCertNumber: "CC-2024-0998", customsCertDate: "2024-11-28",
    invoiceNumber: "INV-2024-0410", invoiceValue: 175000, currency: "USD",
    paymentTerm: "Open Account", incoterm: "CFR", bankName: "Shinhan Bank",
    etd: "2024-10-15", etaPort: "2024-11-10", etaFactory: "2024-11-20", ataFactory: "2024-11-20",
    status: "Released",
    containers: [
      { id: "C005a", containerType: "40HC", quantity: 2 },
      { id: "C005b", containerType: "20GP", quantity: 1 }
    ],
    carrier: "OOCL", pol: "Ho Chi Minh", pod: "Jeddah", preAlertDate: "2024-10-13",
    originalDocsDate: "2024-10-20", cargoxDate: "2024-10-18", form4ReceivingDate: "2024-10-28",
    broker: "DHL Global Forwarding", freeDays: 14,
    costs: [
      { id: "CST011", type: "Freight", amount: 5800, currency: "USD" },
      { id: "CST012", type: "THC USD", amount: 1100, currency: "USD" },
      { id: "CST013", type: "Customs Clearance", amount: 3200, currency: "USD" },
      { id: "CST014", type: "Import Duty", amount: 8750, currency: "USD" },
      { id: "CST015", type: "Transportation", amount: 1500, currency: "USD" },
      { id: "CST016", type: "Demurrage USD", amount: 750, currency: "USD" }
    ],
    documents: [
      { type: "Invoice", status: "Received", receivedDate: "2024-11-12" },
      { type: "Packing List", status: "Received", receivedDate: "2024-11-12" },
      { type: "Bill of Lading", status: "Received", receivedDate: "2024-11-12" },
      { type: "COO", status: "Received", receivedDate: "2024-11-12" },
      { type: "EUR1", status: "Received", receivedDate: "2024-11-12" }
    ],
    createdAt: "2024-10-01", exchangeRateUSD: 50.5, exchangeRateEUR: 55.0,
    baseCurrency: "EGP", f4CommissionRate: 1.2, seaMode: "FCL"
  }
];

const DEFAULT_COST_ITEMS = [
  "Import Duty", "Nafeza Fees", "Transportation", "Customs Clearance",
  "Approvals", "ACID Fees", "THC EGP", "THC USD", "Storage EGP",
  "Storage USD", "Demurrage USD", "Freight", "F4 Commission", "Additional Cost",
];

const SEED_MASTER_DATA = [
  { category: "supplier_name", value: "Bosch Home Appliances" },
  { category: "supplier_name", value: "Whirlpool Corp" },
  { category: "supplier_name", value: "LG Electronics" },
  { category: "supplier_name", value: "Electrolux" },
  { category: "supplier_name", value: "Samsung Electronics" },
  { category: "country_of_origin", value: "Germany" },
  { category: "country_of_origin", value: "Italy" },
  { category: "country_of_origin", value: "South Korea" },
  { category: "country_of_origin", value: "Sweden" },
  { category: "country_of_origin", value: "Vietnam" },
  { category: "carrier", value: "Maersk" },
  { category: "carrier", value: "MSC" },
  { category: "carrier", value: "Korean Air Cargo" },
  { category: "carrier", value: "OOCL" },
  { category: "pol", value: "Hamburg" },
  { category: "pol", value: "Genoa" },
  { category: "pol", value: "Incheon" },
  { category: "pol", value: "Gothenburg" },
  { category: "pol", value: "Ho Chi Minh" },
  { category: "pod", value: "Jeddah" },
  { category: "pod", value: "Alexandria" },
  { category: "broker", value: "DHL Global Forwarding" },
  { category: "broker", value: "Agility Logistics" },
  { category: "broker", value: "Kuehne+Nagel" },
  { category: "broker", value: "DB Schenker" },
  { category: "payment_term", value: "Open Account" },
  { category: "payment_term", value: "CAD" },
  { category: "payment_term", value: "Advance" },
  { category: "payment_term", value: "FOC" },
  { category: "incoterm", value: "CIF" },
  { category: "incoterm", value: "FOB" },
  { category: "incoterm", value: "DDP" },
  { category: "incoterm", value: "EXW" },
  { category: "incoterm", value: "CFR" },
  { category: "bank_name", value: "Deutsche Bank" },
  { category: "bank_name", value: "UniCredit" },
  { category: "bank_name", value: "KEB Hana Bank" },
  { category: "bank_name", value: "SEB" },
  { category: "bank_name", value: "Shinhan Bank" },
  { category: "owner", value: "Ragab" },
  { category: "owner", value: "Atef" },
  { category: "owner", value: "Abdelaty" },
  { category: "owner", value: "Seleim" },
  { category: "owner", value: "Remonda" },
  { category: "owner", value: "Adham" },
  { category: "owner", value: "Mostafa" },
  ...DEFAULT_COST_ITEMS.map((value) => ({ category: "cost_item", value })),
];

/** Initialize the DB — must be awaited before the server starts */
async function initDb() {
  const SQL = await initSqlJs();

  // Load existing file or create fresh
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log("📂 Loaded existing store.db");
  } else {
    db = new SQL.Database();
    console.log("🆕 Created new store.db");
  }

  // Create tables
  db.run(SCHEMA);

  // Seed default admin only if no users exist
  const userCount = get("SELECT COUNT(*) as n FROM users", []);
  if (!userCount || Number(userCount.n) === 0) {
    const adminId = uuidv4();
    const hash = bcrypt.hashSync("admin123", 10);
    db.run("INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)", [adminId, "admin@swiftcargo.local", hash, "Admin"]);
    db.run("INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)", [uuidv4(), adminId, "admin"]);
    for (const page of ["dashboard", "shipments", "costs", "settings"]) {
      db.run("INSERT INTO page_permissions (id, user_id, page, level) VALUES (?, ?, ?, ?)", [uuidv4(), adminId, page, "edit"]);
    }
    saveDb();
    console.log("✅ Seeded default admin: admin@swiftcargo.local / admin123");
  }

  // Seed shipments
  const shipCount = get("SELECT COUNT(*) as n FROM shipments", []);
  if (!shipCount || Number(shipCount.n) === 0) {
    for (const s of SAMPLE_SHIPMENTS) {
      db.run("INSERT OR IGNORE INTO shipments (id, data) VALUES (?, ?)", [s.id, JSON.stringify(s)]);
    }
    saveDb();
    console.log(`✅ Seeded ${SAMPLE_SHIPMENTS.length} sample shipments`);
  }

  // Seed master data
  const masterCount = get("SELECT COUNT(*) as n FROM master_data", []);
  if (!masterCount || Number(masterCount.n) === 0) {
    for (const row of SEED_MASTER_DATA) {
      db.run("INSERT OR IGNORE INTO master_data (id, category, value, code) VALUES (?, ?, ?, ?)", [uuidv4(), row.category, row.value, null]);
    }
    saveDb();
    console.log(`✅ Seeded ${SEED_MASTER_DATA.length} master data entries`);
  }

  // Idempotent migration: ensure Cost Items master data exists and preserve existing shipment cost types.
  // Runs on every startup so existing databases get cost_item options without duplicates.
  {
    const existingCostRows = all("SELECT value FROM master_data WHERE category = 'cost_item'", []);
    const existingCostKeys = new Set(
      existingCostRows
        .map((r) => String(r.value || "").trim().toLowerCase())
        .filter(Boolean)
    );

    const toSeed = [];
    const addSeed = (raw) => {
      const value = String(raw || "").trim();
      const key = value.toLowerCase();
      if (!value || existingCostKeys.has(key)) return;
      existingCostKeys.add(key);
      toSeed.push(value);
    };

    for (const name of DEFAULT_COST_ITEMS) addSeed(name);

    const shipmentRows = all("SELECT data FROM shipments", []);
    for (const row of shipmentRows) {
      try {
        const shipment = JSON.parse(row.data);
        const costs = Array.isArray(shipment?.costs) ? shipment.costs : [];
        for (const cost of costs) addSeed(cost?.type);
      } catch {
        // Ignore malformed shipment rows; do not block startup/migration.
      }
    }

    for (const value of toSeed) {
      db.run(
        "INSERT INTO master_data (id, category, value, code) VALUES (?, 'cost_item', ?, NULL)",
        [uuidv4(), value]
      );
    }
    if (toSeed.length > 0) {
      console.log(`✅ Seeded ${toSeed.length} cost item master data entries`);
    }
  }
}

module.exports = { initDb, run, all, get, saveDb, uuidv4 };
