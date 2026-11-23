import type { Shipment } from "@/types/shipment";
import { calcClearanceLeadTime, calcForm4LeadTime, calcTotalLeadTime, totalContainers } from "@/types/shipment";

export type ExcelDataType = "Text" | "Number" | "Date" | "Boolean";
export type ExcelColumnKind = "export_import" | "export_only" | "import_only";

export interface ShipmentExcelColumnDef {
  id: string;
  header: string;
  legacyHeaders?: string[]; // accepted on import for backward compatibility
  fieldLabel: string; // Shipment Field / Data Mapping label for Settings UI
  dataType: ExcelDataType;
  kind: ExcelColumnKind;
  defaultExportEnabled: boolean;
  defaultImportEnabled: boolean;
  defaultRequiredForImport: boolean;
  systemCritical?: boolean; // cannot be disabled in ways that break import reliability
  validationNote?: string;
}

export interface ShipmentExcelColumnSetting {
  exportEnabled: boolean;
  importEnabled: boolean;
  requiredForImport: boolean;
}

export type ShipmentExcelSettings = {
  columns: Record<string, ShipmentExcelColumnSetting>;
};

// NOTE: Export and Import must use this as the single source of truth.
// Order here defines default export column order.
export const SHIPMENT_EXCEL_COLUMNS: ShipmentExcelColumnDef[] = [
  { id: "shipment_mode", header: "Shipment Mode", legacyHeaders: ["Shipment Type"], fieldLabel: "Shipment Mode (maps to shipmentType + seaMode)", dataType: "Text", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: true, systemCritical: true, validationNote: "Allowed: FCL, LCL, AIR. Legacy: Shipment Type (+ Sea Mode) supported on import." },
  { id: "owner", header: "Owner", fieldLabel: "owner", dataType: "Text", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Optional text; may be added to master data (Owner)." },
  { id: "po_number", header: "PO Number", fieldLabel: "poNumber", dataType: "Text", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false },
  { id: "supplier_name", header: "Supplier Name", fieldLabel: "supplierName", dataType: "Text", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: true, systemCritical: true, validationNote: "Required for import; may be added to master data (Supplier Name)." },
  { id: "country_of_origin", header: "Country of Origin", fieldLabel: "countryOfOrigin", dataType: "Text", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Optional text; may be added to master data (Country of Origin)." },
  { id: "factory", header: "Factory", fieldLabel: "factory", dataType: "Text", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Defaults to Ref if blank on import." },
  { id: "acid_number", header: "ACID Number", fieldLabel: "acidNumber", dataType: "Text", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: true, systemCritical: true, validationNote: "Required for import." },
  { id: "customs_cert_number", header: "Customs Cert Number", fieldLabel: "customsCertNumber", dataType: "Text", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false },
  { id: "master_bl", header: "MBL Number", legacyHeaders: ["Master B/L"], fieldLabel: "masterBL", dataType: "Text", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false },
  { id: "house_bl", header: "HBL Number", legacyHeaders: ["House B/L"], fieldLabel: "houseBL", dataType: "Text", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false },
  { id: "status", header: "Status", fieldLabel: "status", dataType: "Text", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Imported if provided; defaults to Not Shipped. Status is otherwise derived from dates in app." },
  { id: "pol", header: "POL", fieldLabel: "pol", dataType: "Text", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false },
  { id: "pod", header: "POD", fieldLabel: "pod", dataType: "Text", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false },
  { id: "invoice_value", header: "Invoice Value", fieldLabel: "invoiceValue", dataType: "Number", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Numeric; defaults to 0 if blank/invalid." },
  { id: "invoice_number", header: "Invoice Number", fieldLabel: "invoiceNumber", dataType: "Text", kind: "export_import", defaultExportEnabled: false, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Supported for import/export (legacy import-only in previous template behavior)." },
  { id: "currency", header: "Currency", fieldLabel: "currency", dataType: "Text", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Defaults to USD if blank." },
  { id: "payment_term", header: "Payment Term", fieldLabel: "paymentTerm", dataType: "Text", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Defaults to Open Account if blank." },
  { id: "incoterm", header: "incoterm", fieldLabel: "incoterm", dataType: "Text", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false },
  { id: "bank_name", header: "bank name", fieldLabel: "bankName", dataType: "Text", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false },
  { id: "free_days", header: "Free days", fieldLabel: "freeDays", dataType: "Number", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Integer days; blank if not applicable/invalid." },
  { id: "do_date", header: "D/O Date", fieldLabel: "doDate", dataType: "Date", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Excel date (yyyy-mm-dd). Empty allowed." },
  { id: "customs_cert_date", header: "Customs Cert Date", fieldLabel: "customsCertDate", dataType: "Date", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Excel date (yyyy-mm-dd). Empty allowed." },
  { id: "etd", header: "ETD", fieldLabel: "etd", dataType: "Date", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Excel date (yyyy-mm-dd). Empty allowed." },
  { id: "eta_port", header: "ETA Port", fieldLabel: "etaPort", dataType: "Date", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Excel date (yyyy-mm-dd). Empty allowed." },
  { id: "eta_factory", header: "ETA Factory", fieldLabel: "etaFactory", dataType: "Date", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Excel date (yyyy-mm-dd). Empty allowed." },
  { id: "ata_factory", header: "ATA Factory", fieldLabel: "ataFactory", dataType: "Date", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Excel date (yyyy-mm-dd). Empty allowed." },
  { id: "pre_alert_date", header: "Pre alert date", fieldLabel: "preAlertDate", dataType: "Date", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Excel date (yyyy-mm-dd). Empty allowed." },
  { id: "original_docs_date", header: "Original Docs Date", fieldLabel: "originalDocsDate", dataType: "Date", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Excel date (yyyy-mm-dd). Empty allowed." },
  { id: "cargox_date", header: "CargoX Date", fieldLabel: "cargoxDate", dataType: "Date", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Excel date (yyyy-mm-dd). Empty allowed." },
  { id: "form4_receiving_date", header: "Form4 receiving date", fieldLabel: "form4ReceivingDate", dataType: "Date", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Excel date (yyyy-mm-dd). Empty allowed." },
  { id: "carrier", header: "Carrier", fieldLabel: "carrier", dataType: "Text", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false },
  { id: "shipping_line", header: "Shipping Line", fieldLabel: "shippingLine", dataType: "Text", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Optional text; may be added to master data (Shipping Lines)." },
  { id: "broker", header: "Broker", fieldLabel: "broker", dataType: "Text", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false },
  { id: "container_20ft", header: "Container 20 ft", fieldLabel: "containers (20ft total quantity)", dataType: "Number", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Total quantity of 20-foot containers. Used with Container 40 ft to reconstruct container records on import." },
  { id: "container_40ft", header: "Container 40 ft", fieldLabel: "containers (40ft total quantity)", dataType: "Number", kind: "export_import", defaultExportEnabled: true, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Total quantity of 40-foot containers (incl. 40HC/45HC/40OT/40FR). Used with Container 20 ft to reconstruct container records on import." },
  { id: "container_count", header: "Container Count", fieldLabel: "totalContainers(shipment) / derived", dataType: "Number", kind: "export_only", defaultExportEnabled: true, defaultImportEnabled: false, defaultRequiredForImport: false, validationNote: "Calculated total (Container 20 ft + Container 40 ft). Ignored on import." },
  { id: "clearance_lead_time", header: "Clearance Lead Time", fieldLabel: "calcClearanceLeadTime(shipment)", dataType: "Number", kind: "export_only", defaultExportEnabled: true, defaultImportEnabled: false, defaultRequiredForImport: false, validationNote: "Calculated field (existing system logic). Ignored on import." },
  { id: "form4_lead_time", header: "Form 4 Lead Time", fieldLabel: "calcForm4LeadTime(shipment)", dataType: "Number", kind: "export_only", defaultExportEnabled: true, defaultImportEnabled: false, defaultRequiredForImport: false, validationNote: "Calculated field (existing system logic). Ignored on import." },
  { id: "total_lead_time", header: "Total Lead Time", fieldLabel: "calcTotalLeadTime(shipment)", dataType: "Number", kind: "export_only", defaultExportEnabled: true, defaultImportEnabled: false, defaultRequiredForImport: false, validationNote: "Calculated field (existing system logic). Ignored on import." },
  // Legacy-only import helper columns (not exported by default, but recognized on import for backward compatibility)
  { id: "legacy_container_type", header: "Container Type", fieldLabel: "containers[0].containerType (legacy import)", dataType: "Text", kind: "import_only", defaultExportEnabled: false, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Legacy compatibility: used when Container 20 ft / 40 ft columns are absent." },
  { id: "legacy_sea_mode", header: "Sea Mode", fieldLabel: "seaMode (legacy import)", dataType: "Text", kind: "import_only", defaultExportEnabled: false, defaultImportEnabled: true, defaultRequiredForImport: false, validationNote: "Legacy compatibility for Shipment Mode mapping (FCL/LCL)." },
];

export const SHIPMENT_EXCEL_COLUMNS_BY_ID = Object.fromEntries(
  SHIPMENT_EXCEL_COLUMNS.map((c) => [c.id, c]),
) as Record<string, ShipmentExcelColumnDef>;

export const DEFAULT_SHIPMENT_EXCEL_SETTINGS: ShipmentExcelSettings = {
  columns: Object.fromEntries(
    SHIPMENT_EXCEL_COLUMNS.map((c) => [
      c.id,
      {
        exportEnabled: c.defaultExportEnabled,
        importEnabled: c.kind === "export_only" ? false : c.defaultImportEnabled,
        requiredForImport: c.kind === "export_only" ? false : c.defaultRequiredForImport,
      } satisfies ShipmentExcelColumnSetting,
    ]),
  ) as Record<string, ShipmentExcelColumnSetting>,
};

export function normalizeShipmentExcelSettings(raw: any): ShipmentExcelSettings {
  const out: ShipmentExcelSettings = {
    columns: { ...DEFAULT_SHIPMENT_EXCEL_SETTINGS.columns },
  };
  const cols =
    raw && typeof raw === "object" && raw.columns && typeof raw.columns === "object"
      ? raw.columns
      : {};
  for (const def of SHIPMENT_EXCEL_COLUMNS) {
    const prev = out.columns[def.id];
    const r = cols[def.id] && typeof cols[def.id] === "object" ? cols[def.id] : {};
    let exportEnabled = typeof r.exportEnabled === "boolean" ? r.exportEnabled : prev.exportEnabled;
    let importEnabled = typeof r.importEnabled === "boolean" ? r.importEnabled : prev.importEnabled;
    let requiredForImport =
      typeof r.requiredForImport === "boolean" ? r.requiredForImport : prev.requiredForImport;

    // Enforce kind constraints
    if (def.kind === "export_only") {
      importEnabled = false;
      requiredForImport = false;
    }
    // import_only: export togglable (default off)

    // System-critical import fields must remain import-enabled and required for reliable import
    if (def.systemCritical && def.kind !== "export_only") {
      importEnabled = true;
      requiredForImport = true;
    }

    out.columns[def.id] = { exportEnabled, importEnabled, requiredForImport };
  }
  return out;
}

export function isColumnExportEnabled(settings: ShipmentExcelSettings, id: string): boolean {
  return !!settings.columns[id]?.exportEnabled;
}
export function isColumnImportEnabled(settings: ShipmentExcelSettings, id: string): boolean {
  const def = SHIPMENT_EXCEL_COLUMNS_BY_ID[id];
  if (!def || def.kind === "export_only") return false;
  return !!settings.columns[id]?.importEnabled;
}
export function isColumnRequiredForImport(settings: ShipmentExcelSettings, id: string): boolean {
  const def = SHIPMENT_EXCEL_COLUMNS_BY_ID[id];
  if (!def || def.kind === "export_only") return false;
  if (def.systemCritical) return true;
  return !!settings.columns[id]?.requiredForImport && !!settings.columns[id]?.importEnabled;
}

export function getEnabledExportColumns(settings: ShipmentExcelSettings): ShipmentExcelColumnDef[] {
  return SHIPMENT_EXCEL_COLUMNS.filter(
    (c) => c.kind !== "import_only" && isColumnExportEnabled(settings, c.id),
  );
}

export function getImportableColumns(settings: ShipmentExcelSettings): ShipmentExcelColumnDef[] {
  return SHIPMENT_EXCEL_COLUMNS.filter(
    (c) => c.kind !== "export_only" && isColumnImportEnabled(settings, c.id),
  );
}

// Helpers for container 20/40 classification (export/reporting helpers; do not mutate shipment data)
function isCountableContainerRecord(c: { containerType?: string; quantity?: number }): boolean {
  const qty = Number(c?.quantity);
  return Number.isFinite(qty) && qty > 0;
}

export function getContainer20Qty(s: Shipment): number {
  return (s.containers || []).reduce((sum, c) => {
    if (!isCountableContainerRecord(c)) return sum;
    const t = c.containerType === "Other" ? "" : String(c.containerType || "");
    return sum + (t.startsWith("20") ? Number(c.quantity) : 0);
  }, 0);
}
export function getContainer40Qty(s: Shipment): number {
  return (s.containers || []).reduce((sum, c) => {
    if (!isCountableContainerRecord(c)) return sum;
    const t = c.containerType === "Other" ? "" : String(c.containerType || "");
    // Treat 40* and 45HC as "40 ft" bucket per requirement column naming
    return sum + (t.startsWith("40") || t.startsWith("45") ? Number(c.quantity) : 0);
  }, 0);
}
export function getContainerCountCalc(s: Shipment): number {
  return getContainer20Qty(s) + getContainer40Qty(s);
}

export function calcTotalLeadTimeExportValue(s: Shipment): number | null {
  // Requirement states "Total Lead Time = ATA Factory Date - ETD Date".
  // Existing system function calcTotalLeadTime uses ETA Factory - ETD; do not change it.
  // This export value follows the stated requirement for the Excel column.
  if (!s.ataFactory || !s.etd) return null;
  const ata = new Date(s.ataFactory);
  const etd = new Date(s.etd);
  if (isNaN(ata.getTime()) || isNaN(etd.getTime())) return null;
  return Math.round((ata.getTime() - etd.getTime()) / 86400000);
}

export function getShipmentModeLabel(s: Shipment): "FCL" | "LCL" | "AIR" {
  if (s.shipmentType === "AIR") return "AIR";
  return s.seaMode === "LCL" ? "LCL" : "FCL";
}
