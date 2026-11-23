import * as XLSX from "xlsx";
import type { Shipment, ContainerEntry, ShipmentStatus, Factory, Currency, PaymentTerm } from "@/types/shipment";
import {
  calcClearanceLeadTime,
  calcForm4LeadTime,
  getNextShipmentSequenceStart,
  formatShipmentId,
  DOCUMENT_TYPES,
} from "@/types/shipment";
import {
  SHIPMENT_EXCEL_COLUMNS,
  type ShipmentExcelSettings,
  type ShipmentExcelColumnDef,
  DEFAULT_SHIPMENT_EXCEL_SETTINGS,
  normalizeShipmentExcelSettings,
  getEnabledExportColumns,
  getImportableColumns,
  isColumnRequiredForImport,
  isColumnImportEnabled,
  getContainer20Qty,
  getContainer40Qty,
  getShipmentModeLabel,
  calcTotalLeadTimeExportValue,
} from "@/lib/shipmentExcelConfig";
import { apiGetExcelSettings } from "@/lib/api";

const DATE_FORMAT = "yyyy-mm-dd";
const EXPORT_FILENAME = "shipments_export.xlsx";

export async function loadShipmentExcelSettings(): Promise<ShipmentExcelSettings> {
  try {
    const raw = await apiGetExcelSettings();
    return normalizeShipmentExcelSettings(raw);
  } catch {
    return DEFAULT_SHIPMENT_EXCEL_SETTINGS;
  }
}

function isBlank(v: any): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

function toTrimmedString(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function parseDateOnlyString(s: string): { y: number; m: number; d: number } | null {
  // Accept YYYY-MM-DD (and YYYY/MM/DD) as unambiguous date-only input
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return { y, m: mo, d };
}

function datePartsToYmd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function jsDateToYmdLocal(date: Date): string | null {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  return datePartsToYmd(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function excelSerialToYmd(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  // XLSX.SSF.parse_date_code handles Excel serials (including 1900 leap year bug behavior in xlsx)
  const parsed = (XLSX as any).SSF?.parse_date_code?.(serial);
  if (!parsed || !parsed.y || !parsed.m || !parsed.d) return null;
  const y = Number(parsed.y);
  const m = Number(parsed.m);
  const d = Number(parsed.d);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  return datePartsToYmd(y, m, d);
}

function ymdToLocalDate(ymd: string): Date | null {
  const p = parseDateOnlyString(ymd);
  if (!p) return null;
  return new Date(p.y, p.m - 1, p.d);
}

function normalizeDateCellValue(cell: XLSX.CellObject | undefined): { ok: true; value: string | undefined } | { ok: false; reason: string } {
  if (!cell || cell.v === null || cell.v === undefined || cell.v === "") return { ok: true, value: undefined };
  const v: any = cell.v;
  // Actual Excel date cell
  if (cell.t === "d" && v instanceof Date) {
    const ymd = jsDateToYmdLocal(v);
    if (!ymd) return { ok: false, reason: "Invalid date value" };
    return { ok: true, value: ymd };
  }
  // Date stored as number (serial) or numeric cell
  if ((cell.t === "n" || typeof v === "number") && typeof v === "number" && Number.isFinite(v)) {
    // Treat as Excel serial date if plausible; also allow 0? no.
    const ymd = excelSerialToYmd(v);
    if (!ymd) return { ok: false, reason: "Invalid Excel date serial value" };
    // Basic sanity range to avoid misinterpreting arbitrary numbers as dates
    if (v < 1 || v > 2958465) return { ok: false, reason: "Date value out of supported range" };
    return { ok: true, value: ymd };
  }
  // String (backward compatibility)
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return { ok: true, value: undefined };
    const p = parseDateOnlyString(s);
    if (p) return { ok: true, value: datePartsToYmd(p.y, p.m, p.d) };
    // Try Date parse only for clearly unambiguous ISO datetime-like strings? avoid ambiguous locale strings.
    // Accept full ISO like 2026-11-20T00:00:00Z by extracting date part if it starts with YYYY-MM-DD.
    const isoPrefix = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s]|$)/);
    if (isoPrefix) {
      const p2 = parseDateOnlyString(isoPrefix[1]);
      if (p2) return { ok: true, value: datePartsToYmd(p2.y, p2.m, p2.d) };
    }
    return { ok: false, reason: "Invalid date format (expected yyyy-mm-dd or Excel date)" };
  }
  // If xlsx gave a Date object but type not marked 'd'
  if (v instanceof Date) {
    const ymd = jsDateToYmdLocal(v);
    if (!ymd) return { ok: false, reason: "Invalid date value" };
    return { ok: true, value: ymd };
  }
  return { ok: false, reason: "Invalid date value" };
}

function setDateCell(ws: XLSX.WorkSheet, r: number, c: number, ymd: string | undefined | null) {
  const addr = XLSX.utils.encode_cell({ r, c });
  if (!ymd) {
    // genuinely empty cell
    delete (ws as any)[addr];
    return;
  }
  const d = ymdToLocalDate(ymd);
  if (!d) {
    delete (ws as any)[addr];
    return;
  }
  (ws as any)[addr] = { t: "d", v: d, z: DATE_FORMAT } as XLSX.CellObject;
}

function setTextCell(ws: XLSX.WorkSheet, r: number, c: number, value: string | number | boolean | undefined | null) {
  const addr = XLSX.utils.encode_cell({ r, c });
  if (value === null || value === undefined || value === "") {
    delete (ws as any)[addr];
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) { delete (ws as any)[addr]; return; }
    (ws as any)[addr] = { t: "n", v: value } as XLSX.CellObject;
    return;
  }
  if (typeof value === "boolean") {
    (ws as any)[addr] = { t: "b", v: value } as XLSX.CellObject;
    return;
  }
  (ws as any)[addr] = { t: "s", v: String(value) } as XLSX.CellObject;
}

function getCellDisplayString(cell: XLSX.CellObject | undefined): string {
  if (!cell) return "";
  if (cell.w != null) return String(cell.w);
  if (cell.v == null) return "";
  if (cell.v instanceof Date) return jsDateToYmdLocal(cell.v) || "";
  return String(cell.v);
}

export function exportShipmentsWorkbook(shipments: Shipment[], settings: ShipmentExcelSettings): XLSX.WorkBook {
  const cols = getEnabledExportColumns(settings);
  const headers = cols.map((c) => c.header);
  const ws = XLSX.utils.aoa_to_sheet([headers]);

  shipments.forEach((s, rowIdx) => {
    const r = rowIdx + 1; // 0-based, header at 0
    cols.forEach((col, cIdx) => {
      switch (col.id) {
        case "shipment_mode":
          setTextCell(ws, r, cIdx, getShipmentModeLabel(s));
          break;
        case "owner":
          setTextCell(ws, r, cIdx, s.owner || "");
          break;
        case "po_number":
          setTextCell(ws, r, cIdx, s.poNumber || "");
          break;
        case "supplier_name":
          setTextCell(ws, r, cIdx, s.supplierName || "");
          break;
        case "country_of_origin":
          setTextCell(ws, r, cIdx, s.countryOfOrigin || "");
          break;
        case "factory":
          setTextCell(ws, r, cIdx, s.factory || "");
          break;
        case "acid_number":
          setTextCell(ws, r, cIdx, s.acidNumber || "");
          break;
        case "customs_cert_number":
          setTextCell(ws, r, cIdx, s.customsCertNumber || "");
          break;
        case "master_bl":
          setTextCell(ws, r, cIdx, s.masterBL || "");
          break;
        case "house_bl":
          setTextCell(ws, r, cIdx, s.houseBL || "");
          break;
        case "status":
          setTextCell(ws, r, cIdx, s.status || "");
          break;
        case "pol":
          setTextCell(ws, r, cIdx, s.pol || "");
          break;
        case "pod":
          setTextCell(ws, r, cIdx, s.pod || "");
          break;
        case "invoice_value":
          setTextCell(ws, r, cIdx, Number.isFinite(Number(s.invoiceValue)) ? Number(s.invoiceValue) : 0);
          break;
        case "invoice_number":
          setTextCell(ws, r, cIdx, s.invoiceNumber || "");
          break;
        case "currency":
          setTextCell(ws, r, cIdx, s.currency || "");
          break;
        case "payment_term":
          setTextCell(ws, r, cIdx, s.paymentTerm || "");
          break;
        case "incoterm":
          setTextCell(ws, r, cIdx, s.incoterm || "");
          break;
        case "bank_name":
          setTextCell(ws, r, cIdx, s.bankName || "");
          break;
        case "free_days":
          if (s.freeDays == null || !Number.isFinite(Number(s.freeDays))) {
            // empty
          } else {
            setTextCell(ws, r, cIdx, Number(s.freeDays));
          }
          break;
        case "do_date":
          setDateCell(ws, r, cIdx, s.doDate);
          break;
        case "customs_cert_date":
          setDateCell(ws, r, cIdx, s.customsCertDate);
          break;
        case "etd":
          setDateCell(ws, r, cIdx, s.etd);
          break;
        case "eta_port":
          setDateCell(ws, r, cIdx, s.etaPort);
          break;
        case "eta_factory":
          setDateCell(ws, r, cIdx, s.etaFactory);
          break;
        case "ata_factory":
          setDateCell(ws, r, cIdx, s.ataFactory);
          break;
        case "pre_alert_date":
          setDateCell(ws, r, cIdx, s.preAlertDate);
          break;
        case "original_docs_date":
          setDateCell(ws, r, cIdx, s.originalDocsDate);
          break;
        case "cargox_date":
          setDateCell(ws, r, cIdx, s.cargoxDate);
          break;
        case "form4_receiving_date":
          setDateCell(ws, r, cIdx, s.form4ReceivingDate);
          break;
        case "carrier":
          setTextCell(ws, r, cIdx, s.carrier || "");
          break;
        case "shipping_line":
          setTextCell(ws, r, cIdx, s.shippingLine || "");
          break;
        case "broker":
          setTextCell(ws, r, cIdx, s.broker || "");
          break;
        case "container_20ft": {
          const isFclSea = s.shipmentType === "SEA" && (s.seaMode || "FCL") === "FCL";
          const qty = isFclSea ? getContainer20Qty(s) : 0;
          setTextCell(ws, r, cIdx, qty);
          break;
        }
        case "container_40ft": {
          const isFclSea = s.shipmentType === "SEA" && (s.seaMode || "FCL") === "FCL";
          const qty = isFclSea ? getContainer40Qty(s) : 0;
          setTextCell(ws, r, cIdx, qty);
          break;
        }
        case "container_count": {
          const isFclSea = s.shipmentType === "SEA" && (s.seaMode || "FCL") === "FCL";
          const count20 = isFclSea ? getContainer20Qty(s) : 0;
          const count40 = isFclSea ? getContainer40Qty(s) : 0;
          setTextCell(ws, r, cIdx, count20 + count40); // always equals sum of the two size columns
          break;
        }
        case "clearance_lead_time": {
          const v = calcClearanceLeadTime(s);
          if (v != null && Number.isFinite(v)) setTextCell(ws, r, cIdx, v);
          break;
        }
        case "form4_lead_time": {
          const v = calcForm4LeadTime(s);
          if (v != null && Number.isFinite(v)) setTextCell(ws, r, cIdx, v);
          break;
        }
        case "total_lead_time": {
          const v = calcTotalLeadTimeExportValue(s);
          if (v != null && Number.isFinite(v)) setTextCell(ws, r, cIdx, v);
          break;
        }
        default:
          break;
      }
    });
  });

  // Ensure !ref covers header row even when no data rows
  const lastRow = Math.max(0, shipments.length); // header row index 0
  const lastCol = Math.max(0, headers.length - 1);
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: lastCol } });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Shipments Template");
  return wb;
}

export function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

export function exportShipmentsToExcel(shipments: Shipment[], settings: ShipmentExcelSettings) {
  const wb = exportShipmentsWorkbook(shipments, settings);
  downloadWorkbook(wb, EXPORT_FILENAME);
}

// ---------------- Import ----------------

export interface ImportRowError {
  rowNumber: number; // Excel row number (1-based, header is 1)
  column: string;
  invalidValue?: string;
  reason: string;
}

export interface ImportSummary {
  totalRowsProcessed: number;
  successfullyImportedRows: number;
  skippedRows: number;
  failedRows: number;
}

export interface PreparedImport {
  shipments: Shipment[];
  errors: ImportRowError[];
  summary: ImportSummary;
  masterData: {
    suppliers: string[];
    origins: string[];
    owners: string[];
    shippingLines: string[];
  };
  rowToShipmentIndex: Map<number, number>; // excel row -> index in shipments array (valid rows)
}

function buildHeaderIndex(ws: XLSX.WorkSheet): { headerRow: number; map: Map<string, number> } | null {
  const ref = ws["!ref"];
  if (!ref) return null;
  const range = XLSX.utils.decode_range(ref);
  const headerRow = range.s.r;
  const map = new Map<string, number>();
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
    const name = toTrimmedString(getCellDisplayString(cell));
    if (!name) continue;
    // Keep first occurrence
    if (!map.has(name)) map.set(name, c);
    if (!map.has(name.toLowerCase())) map.set(name.toLowerCase(), c);
  }
  return { headerRow, map };
}

function resolveColumnIndex(headerMap: Map<string, number>, def: ShipmentExcelColumnDef): number | undefined {
  const candidates = [def.header, ...(def.legacyHeaders || [])];
  for (const h of candidates) {
    if (headerMap.has(h)) return headerMap.get(h);
    const lower = h.toLowerCase();
    if (headerMap.has(lower)) return headerMap.get(lower);
  }
  return undefined;
}

function getCellByCol(ws: XLSX.WorkSheet, r: number, c: number | undefined): XLSX.CellObject | undefined {
  if (c == null) return undefined;
  return ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
}

function isRowCompletelyEmpty(ws: XLSX.WorkSheet, r: number, range: XLSX.Range): boolean {
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c })];
    if (!cell) continue;
    const v = cell.v;
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    return false;
  }
  return true;
}

function normalizeMode(modeRaw: string): { shipmentType: "SEA" | "AIR"; seaMode?: "FCL" | "LCL" } | null {
  const v = modeRaw.trim().toUpperCase();
  if (v === "AIR") return { shipmentType: "AIR" };
  if (v === "FCL") return { shipmentType: "SEA", seaMode: "FCL" };
  if (v === "LCL") return { shipmentType: "SEA", seaMode: "LCL" };
  if (v === "SEA") return { shipmentType: "SEA", seaMode: "FCL" }; // legacy fallback
  return null;
}

function parseNumberCell(cell: XLSX.CellObject | undefined): { present: boolean; value?: number; invalid?: boolean; raw?: string } {
  if (!cell || cell.v === null || cell.v === undefined || (typeof cell.v === "string" && cell.v.trim() === "")) {
    return { present: false };
  }
  const raw = getCellDisplayString(cell).trim();
  const v = cell.v as any;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return { present: true, invalid: true, raw };
    return { present: true, value: v, raw };
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "") return { present: false };
    const n = Number(s.replace(/,/g, ""));
    if (!Number.isFinite(n)) return { present: true, invalid: true, raw: s };
    return { present: true, value: n, raw: s };
  }
  if (typeof v === "boolean") {
    return { present: true, invalid: true, raw: String(v) };
  }
  return { present: true, invalid: true, raw };
}

export function parseAndValidateImportFile(
  fileData: ArrayBuffer | Uint8Array | string,
  settings: ShipmentExcelSettings,
  existingShipments: Pick<Shipment, "id" | "acidNumber">[] = [],
): PreparedImport {
  const wb = XLSX.read(fileData, { type: typeof fileData === "string" ? "binary" : "array", cellDates: true });
  const errors: ImportRowError[] = [];
  const shipments: Shipment[] = [];
  const rowToShipmentIndex = new Map<number, number>();

  const suppliers = new Set<string>();
  const origins = new Set<string>();
  const owners = new Set<string>();
  const shippingLines = new Set<string>();

  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    return {
      shipments: [],
      errors: [{ rowNumber: 1, column: "File", reason: "No worksheet found in Excel file" }],
      summary: { totalRowsProcessed: 0, successfullyImportedRows: 0, skippedRows: 0, failedRows: 0 },
      masterData: { suppliers: [], origins: [], owners: [], shippingLines: [] },
      rowToShipmentIndex,
    };
  }
  const ws = wb.Sheets[firstSheetName];
  const headerInfo = buildHeaderIndex(ws);
  if (!headerInfo || !ws["!ref"]) {
    return {
      shipments: [],
      errors: [{ rowNumber: 1, column: "File", reason: "Could not read header row" }],
      summary: { totalRowsProcessed: 0, successfullyImportedRows: 0, skippedRows: 0, failedRows: 0 },
      masterData: { suppliers: [], origins: [], owners: [], shippingLines: [] },
      rowToShipmentIndex,
    };
  }

  const range = XLSX.utils.decode_range(ws["!ref"]);
  const headerRow = headerInfo.headerRow;
  const headerMap = headerInfo.map;

  // Resolve indices for importable columns (including legacy helpers, regardless of export enablement)
  const importableDefs = SHIPMENT_EXCEL_COLUMNS.filter((c) => c.kind !== "export_only");
  const idxById = new Map<string, number | undefined>();
  for (const def of importableDefs) {
    idxById.set(def.id, resolveColumnIndex(headerMap, def));
  }

  // Determine missing mandatory columns (only if import-enabled+required; absence must fail validation clearly)
  const missingRequiredCols: string[] = [];
  for (const def of importableDefs) {
    if (!isColumnImportEnabled(settings, def.id)) continue;
    if (!isColumnRequiredForImport(settings, def.id)) continue;
    const idx = idxById.get(def.id);
    if (idx == null) missingRequiredCols.push(def.header);
  }
  if (missingRequiredCols.length > 0) {
    // Report as file-level/header errors and do not import rows (cannot reliably validate required fields)
    for (const col of missingRequiredCols) {
      errors.push({ rowNumber: headerRow + 1, column: col, reason: "Required column is missing from the Excel file" });
    }
    return {
      shipments: [],
      errors,
      summary: { totalRowsProcessed: 0, successfullyImportedRows: 0, skippedRows: 0, failedRows: 0 },
      masterData: { suppliers: [], origins: [], owners: [], shippingLines: [] },
      rowToShipmentIndex,
    };
  }

  const existingAcidSet = new Set(
    existingShipments
      .map((s) => toTrimmedString(s.acidNumber).toLowerCase())
      .filter(Boolean),
  );
  const fileAcidSeen = new Set<string>();

  const importYear = new Date().getFullYear();
  let nextSeq = getNextShipmentSequenceStart(existingShipments as any, importYear);

  let totalRowsProcessed = 0;
  let failedRows = 0;
  let skippedRows = 0;

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    if (isRowCompletelyEmpty(ws, r, range)) continue;
    totalRowsProcessed++;
    const excelRowNumber = r + 1; // 1-based for user
    const rowErrors: ImportRowError[] = [];

    const getColIdx = (id: string) => (isColumnImportEnabled(settings, id) ? idxById.get(id) : undefined);
    const getCell = (id: string) => getCellByCol(ws, r, getColIdx(id));
    const getText = (id: string) => toTrimmedString(getCellDisplayString(getCell(id)));

    // Shipment Mode / legacy mapping
    let shipmentType: "SEA" | "AIR" = "SEA";
    let seaMode: "FCL" | "LCL" | undefined = "FCL";
    const modeIdx = getColIdx("shipment_mode");
    const legacySeaModeIdx = getColIdx("legacy_sea_mode");
    if (modeIdx != null) {
      const rawMode = toTrimmedString(getCellDisplayString(getCellByCol(ws, r, modeIdx)));
      if (!rawMode) {
        if (isColumnRequiredForImport(settings, "shipment_mode")) {
          rowErrors.push({ rowNumber: excelRowNumber, column: "Shipment Mode", reason: "Missing required value" });
        } else {
          // default SEA FCL
        }
      } else {
        const norm = normalizeMode(rawMode);
        if (!norm) {
          rowErrors.push({ rowNumber: excelRowNumber, column: "Shipment Mode", invalidValue: rawMode, reason: "Invalid Shipment Mode (allowed: FCL, LCL, AIR)" });
        } else {
          shipmentType = norm.shipmentType;
          seaMode = norm.shipmentType === "SEA" ? (norm.seaMode || "FCL") : undefined;
          // If legacy "Shipment Type" header was SEA and separate legacy Sea Mode column exists, honor it
          if (rawMode.trim().toUpperCase() === "SEA" && legacySeaModeIdx != null) {
            const legacySea = toTrimmedString(getCellDisplayString(getCellByCol(ws, r, legacySeaModeIdx))).toUpperCase();
            if (legacySea === "LCL" || legacySea === "FCL") seaMode = legacySea;
          }
        }
      }
    } else {
      // Column disabled/missing but not required -> default
    }

    const supplierName = getText("supplier_name");
    if (isColumnRequiredForImport(settings, "supplier_name") && !supplierName) {
      rowErrors.push({ rowNumber: excelRowNumber, column: "Supplier Name", reason: "Missing required value" });
    }

    const acidNumber = getText("acid_number");
    if (isColumnRequiredForImport(settings, "acid_number") && !acidNumber) {
      rowErrors.push({ rowNumber: excelRowNumber, column: "ACID Number", reason: "Missing required value" });
    }

    // Duplicate detection (within file and existing records) by ACID Number when available
    const acidKey = acidNumber.toLowerCase();
    if (acidNumber) {
      if (fileAcidSeen.has(acidKey)) {
        rowErrors.push({ rowNumber: excelRowNumber, column: "ACID Number", invalidValue: acidNumber, reason: "Duplicate shipment within the uploaded file (same ACID Number)" });
      } else if (existingAcidSet.has(acidKey)) {
        // Existing reliable duplicate key -> skipped/reported (no create, no update)
        rowErrors.push({ rowNumber: excelRowNumber, column: "ACID Number", invalidValue: acidNumber, reason: "Shipment already exists (matching ACID Number)" });
      }
    }

    // Dates
    const dateFieldMap: Array<[string, string]> = [
      ["do_date", "D/O Date"],
      ["customs_cert_date", "Customs Cert Date"],
      ["etd", "ETD"],
      ["eta_port", "ETA Port"],
      ["eta_factory", "ETA Factory"],
      ["ata_factory", "ATA Factory"],
      ["pre_alert_date", "Pre alert date"],
      ["original_docs_date", "Original Docs Date"],
      ["cargox_date", "CargoX Date"],
      ["form4_receiving_date", "Form4 receiving date"],
    ];
    const dates: Record<string, string | undefined> = {};
    for (const [id, label] of dateFieldMap) {
      if (!isColumnImportEnabled(settings, id)) continue;
      const cell = getCell(id);
      const norm = normalizeDateCellValue(cell);
      if (norm.ok) {
        dates[id] = norm.value;
      } else {
        rowErrors.push({
          rowNumber: excelRowNumber,
          column: label,
          invalidValue: getCellDisplayString(cell),
          reason: (norm as { ok: false; reason: string }).reason,
        });
      }
    }

    // Numbers
    let invoiceValue = 0;
    if (isColumnImportEnabled(settings, "invoice_value")) {
      const parsed = parseNumberCell(getCell("invoice_value"));
      if (parsed.invalid) {
        rowErrors.push({ rowNumber: excelRowNumber, column: "Invoice Value", invalidValue: parsed.raw, reason: "Invalid numeric value" });
      } else if (parsed.present && parsed.value != null) {
        invoiceValue = parsed.value;
      }
    }
    let freeDays: number | undefined = undefined;
    if (isColumnImportEnabled(settings, "free_days")) {
      const parsed = parseNumberCell(getCell("free_days"));
      if (parsed.invalid) {
        rowErrors.push({ rowNumber: excelRowNumber, column: "Free days", invalidValue: parsed.raw, reason: "Invalid numeric value" });
      } else if (parsed.present && parsed.value != null) {
        if (!Number.isInteger(parsed.value) || parsed.value < 0) {
          rowErrors.push({ rowNumber: excelRowNumber, column: "Free days", invalidValue: parsed.raw, reason: "Invalid number of days" });
        } else if (parsed.value === 0) {
          freeDays = undefined;
        } else {
          freeDays = parsed.value;
        }
      }
    }

    // Containers
    let containers: ContainerEntry[] = [];
    const has20Col = getColIdx("container_20ft") != null && isColumnImportEnabled(settings, "container_20ft");
    const has40Col = getColIdx("container_40ft") != null && isColumnImportEnabled(settings, "container_40ft");
    if (has20Col || has40Col) {
      const p20 = has20Col ? parseNumberCell(getCell("container_20ft")) : { present: false as const };
      const p40 = has40Col ? parseNumberCell(getCell("container_40ft")) : { present: false as const };
      if (p20.present && p20.invalid) rowErrors.push({ rowNumber: excelRowNumber, column: "Container 20 ft", invalidValue: p20.raw, reason: "Invalid container quantity" });
      if (p40.present && p40.invalid) rowErrors.push({ rowNumber: excelRowNumber, column: "Container 40 ft", invalidValue: p40.raw, reason: "Invalid container quantity" });
      const q20 = p20.present && p20.value != null ? p20.value : 0;
      const q40 = p40.present && p40.value != null ? p40.value : 0;
      const validateQty = (q: number, col: string, raw?: string) => {
        if (!Number.isFinite(q) || !Number.isInteger(q) || q < 0) rowErrors.push({ rowNumber: excelRowNumber, column: col, invalidValue: raw, reason: "Invalid container quantity" });
      };
      if (p20.present && !p20.invalid) validateQty(q20, "Container 20 ft", p20.raw);
      if (p40.present && !p40.invalid) validateQty(q40, "Container 40 ft", p40.raw);

      // For AIR/LCL, container fields are optional and typically not used; accept zeros/blanks without forcing records.
      // Reconstruct records only for positive quantities.
      if (!rowErrors.some(e => e.column === "Container 20 ft" || e.column === "Container 40 ft")) {
        if (q20 > 0) containers.push({ id: crypto.randomUUID().slice(0, 8), containerType: "20GP", quantity: q20 });
        if (q40 > 0) containers.push({ id: crypto.randomUUID().slice(0, 8), containerType: "40GP", quantity: q40 });
      }
    } else {
      // Legacy fallback: Container Type / Container Count (old template)
      const legacyTypeIdx = getColIdx("legacy_container_type");
      const legacyCountIdx = idxById.get("container_count"); // header "Container Count" exists (export-only now) but may be present in legacy file
      // Try reading legacy count by header name directly if present
      const legacyCountCell = legacyCountIdx != null ? getCellByCol(ws, r, legacyCountIdx) : getCellByCol(ws, r, resolveColumnIndex(headerMap, { header: "Container Count", legacyHeaders: [], fieldLabel: "", dataType: "Number", kind: "import_only", defaultExportEnabled: false, defaultImportEnabled: true, defaultRequiredForImport: false } as any));
      const legacyType = legacyTypeIdx != null ? toTrimmedString(getCellDisplayString(getCellByCol(ws, r, legacyTypeIdx))) : "";
      const legacyCountParsed = parseNumberCell(legacyCountCell);
      if (legacyCountParsed.invalid) {
        rowErrors.push({ rowNumber: excelRowNumber, column: "Container Count", invalidValue: legacyCountParsed.raw, reason: "Invalid container quantity" });
      } else {
        const cCount = legacyCountParsed.present && legacyCountParsed.value != null ? legacyCountParsed.value : 0;
        if (cCount > 0) {
          if (!Number.isInteger(cCount) || cCount < 0) {
            rowErrors.push({ rowNumber: excelRowNumber, column: "Container Count", invalidValue: legacyCountParsed.raw, reason: "Invalid container quantity" });
          } else {
            containers = [{ id: crypto.randomUUID().slice(0, 8), containerType: (legacyType || "Other") as any, quantity: cCount }];
          }
        }
      }
    }

    if (rowErrors.length > 0) {
      // "Already exists" / "Duplicate within file" are reported as skipped; other validation issues as failed.
      const skipReasons = rowErrors.filter(e => /already exists|Duplicate shipment within/i.test(e.reason));
      const failReasons = rowErrors.filter(e => !/already exists|Duplicate shipment within/i.test(e.reason));
      if (skipReasons.length > 0) skippedRows++;
      if (failReasons.length > 0) failedRows++;
      errors.push(...rowErrors);
      // Track within-file duplicates to catch subsequent repeats; do not mark records that already exist in system.
      if (acidNumber && !existingAcidSet.has(acidKey)) fileAcidSeen.add(acidKey);
      continue;
    }

    if (acidNumber) fileAcidSeen.add(acidKey);

    const owner = getText("owner");
    const countryOfOrigin = getText("country_of_origin");
    const shippingLine = getText("shipping_line");
    if (supplierName) suppliers.add(supplierName);
    if (countryOfOrigin) origins.add(countryOfOrigin);
    if (owner) owners.add(owner);
    if (shippingLine) shippingLines.add(shippingLine);

    const currency = (getText("currency") || "USD") as Currency;
    const paymentTerm = (getText("payment_term") || "Open Account") as PaymentTerm;

    const shipment: Shipment = {
      id: formatShipmentId(importYear, nextSeq++),
      shipmentType,
      seaMode: shipmentType === "SEA" ? (seaMode || "FCL") : undefined,
      poNumber: getText("po_number"),
      supplierName,
      countryOfOrigin,
      factory: (getText("factory") || "Ref") as Factory,
      acidNumber,
      masterBL: getText("master_bl"),
      houseBL: getText("house_bl"),
      customsCertNumber: getText("customs_cert_number"),
      invoiceNumber: getText("invoice_number"),
      invoiceValue,
      currency,
      paymentTerm,
      incoterm: getText("incoterm"),
      bankName: getText("bank_name"),
      status: ((getText("status") || "Not Shipped") as ShipmentStatus),
      containers,
      carrier: getText("carrier"),
      shippingLine,
      pol: getText("pol"),
      pod: getText("pod"),
      broker: getText("broker"),
      freeDays,
      doDate: dates["do_date"],
      customsCertDate: dates["customs_cert_date"],
      etd: dates["etd"],
      etaPort: dates["eta_port"],
      etaFactory: dates["eta_factory"],
      ataFactory: dates["ata_factory"],
      preAlertDate: dates["pre_alert_date"],
      originalDocsDate: dates["original_docs_date"],
      cargoxDate: dates["cargox_date"],
      form4ReceivingDate: dates["form4_receiving_date"],
      costs: [],
      documents: DOCUMENT_TYPES.map((t) => ({ type: t, status: "Pending" })),
      createdAt: new Date().toISOString(),
      exchangeRateUSD: 50.5,
      exchangeRateEUR: 55.0,
      baseCurrency: "EGP",
      f4CommissionRate: 1.2,
      weightKg: 0,
      cbm: 0,
      owner,
    };

    rowToShipmentIndex.set(excelRowNumber, shipments.length);
    shipments.push(shipment);
  }

  const summary: ImportSummary = {
    totalRowsProcessed,
    successfullyImportedRows: shipments.length,
    skippedRows,
    failedRows,
  };

  return {
    shipments,
    errors,
    summary,
    masterData: {
      suppliers: Array.from(suppliers),
      origins: Array.from(origins),
      owners: Array.from(owners),
      shippingLines: Array.from(shippingLines),
    },
    rowToShipmentIndex,
  };
}

export function buildImportErrorReportWorkbook(errors: ImportRowError[], summary: ImportSummary): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Total rows processed", summary.totalRowsProcessed],
    ["Successfully imported rows", summary.successfullyImportedRows],
    ["Skipped rows", summary.skippedRows],
    ["Failed rows", summary.failedRows],
  ]);
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  const detailHeader = ["Excel row number", "Column name", "Invalid value", "Reason for rejection"];
  const detailRows = errors.map((e) => [e.rowNumber, e.column, e.invalidValue ?? "", e.reason]);
  const detailSheet = XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows]);
  XLSX.utils.book_append_sheet(wb, detailSheet, "Errors");
  return wb;
}

export function downloadImportErrorReport(errors: ImportRowError[], summary: ImportSummary) {
  const wb = buildImportErrorReportWorkbook(errors, summary);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadWorkbook(wb, `shipment-import-errors-${stamp}.xlsx`);
}

// Small verification helper (can be used in dev/test) to inspect exported workbook date cell metadata
export function inspectWorkbookDateCells(wb: XLSX.WorkBook) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws || !ws["!ref"]) return [];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const out: Array<{ addr: string; t?: string; z?: string; v: any }> = [];
  for (let r = 1; r <= range.e.r; r++) {
    for (let c = 0; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr] as XLSX.CellObject | undefined;
      if (!cell) continue;
      if (cell.t === "d" || String(cell.z || "") === DATE_FORMAT) {
        out.push({ addr, t: cell.t, z: cell.z != null ? String(cell.z) : undefined, v: cell.v instanceof Date ? cell.v.toISOString() : cell.v });
      }
    }
  }
  return out;
}
