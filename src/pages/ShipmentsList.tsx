import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useShipments } from "@/context/ShipmentContext";
import { useMasterData } from "@/hooks/useMasterData";
import { useAuth } from "@/context/AuthContext";
import { Shipment, calcLastFreeReleaseDate, calcRemainingDaysToDemurrage, calcStatus } from "@/types/shipment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Download, Search, Ship, Plane, ClockArrowUp, Copy, Check, Upload, FileWarning, X,
  ArrowUpDown, ArrowUp, ArrowDown, Settings2,
} from "lucide-react";
import { toast } from "sonner";
import QuickUpdateDrawer from "@/components/QuickUpdateDrawer";
import { apiBulkCreateShipments, apiBulkAddMasterData } from "@/lib/api";
import {
  loadShipmentExcelSettings,
  exportShipmentsToExcel,
  parseAndValidateImportFile,
  downloadImportErrorReport,
  type ImportSummary,
  type ImportRowError,
} from "@/lib/shipmentExcel";
import { cn } from "@/lib/utils";

const statusClass: Record<string, string> = {
  "Not Shipped": "status-not-shipped",
  "In Transit": "status-in-transit",
  "At Customs": "status-at-customs",
  Released: "status-released",
};

type SortDir = "asc" | "desc";
type ColumnId =
  | "type" | "owner" | "supplier" | "po" | "origin" | "acid" | "cert" | "mbl"
  | "status" | "etd" | "etaPort" | "freeDays" | "lastFreeRelease" | "daysToDemurrage" | "actions";

interface ColumnDef {
  id: ColumnId;
  label: string;
  minWidth: number;
  defaultWidth: number;
  align?: "left" | "center";
  sortable?: boolean;
  hideable?: boolean;
}

const COLUMNS: ColumnDef[] = [
  { id: "type", label: "Type", minWidth: 72, defaultWidth: 84, align: "left", sortable: true },
  { id: "actions", label: "Actions", minWidth: 72, defaultWidth: 80, align: "center", sortable: false, hideable: false },
  { id: "owner", label: "Owner", minWidth: 110, defaultWidth: 140, align: "left", sortable: true },
  { id: "supplier", label: "Supplier", minWidth: 140, defaultWidth: 200, align: "left", sortable: true },
  { id: "po", label: "PO", minWidth: 110, defaultWidth: 140, align: "left", sortable: true },
  { id: "origin", label: "Origin", minWidth: 110, defaultWidth: 140, align: "left", sortable: true },
  { id: "acid", label: "ACID", minWidth: 120, defaultWidth: 160, align: "left", sortable: true },
  { id: "cert", label: "Cert #", minWidth: 120, defaultWidth: 160, align: "left", sortable: true },
  { id: "mbl", label: "MBL", minWidth: 120, defaultWidth: 160, align: "left", sortable: true },
  { id: "status", label: "Status", minWidth: 120, defaultWidth: 140, align: "left", sortable: true },
  { id: "etd", label: "ETD", minWidth: 110, defaultWidth: 120, align: "left", sortable: true },
  { id: "etaPort", label: "ETA Port", minWidth: 110, defaultWidth: 120, align: "left", sortable: true },
  { id: "freeDays", label: "Free Days", minWidth: 90, defaultWidth: 100, align: "center", sortable: true },
  { id: "lastFreeRelease", label: "Last Free Release", minWidth: 140, defaultWidth: 150, align: "left", sortable: true },
  { id: "daysToDemurrage", label: "Days to Demurrage", minWidth: 140, defaultWidth: 150, align: "center", sortable: true },
];

const DEFAULT_VISIBILITY: Record<ColumnId, boolean> = COLUMNS.reduce((acc, c) => {
  acc[c.id] = true;
  return acc;
}, {} as Record<ColumnId, boolean>);

const DEFAULT_WIDTHS: Record<ColumnId, number> = COLUMNS.reduce((acc, c) => {
  acc[c.id] = c.defaultWidth;
  return acc;
}, {} as Record<ColumnId, number>);

interface TablePrefs {
  widths: Record<string, number>;
  visibility: Record<string, boolean>;
  sort?: { id: ColumnId; dir: SortDir } | null;
}

function loadPrefs(userId: string | undefined): TablePrefs {
  const key = `sc_shipments_table_prefs_${userId || "anon"}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { widths: {}, visibility: {}, sort: { id: "daysToDemurrage", dir: "asc" } };
    const parsed = JSON.parse(raw);
    return {
      widths: parsed?.widths && typeof parsed.widths === "object" ? parsed.widths : {},
      visibility: parsed?.visibility && typeof parsed.visibility === "object" ? parsed.visibility : {},
      sort: parsed?.sort && parsed.sort.id ? parsed.sort : { id: "daysToDemurrage", dir: "asc" },
    };
  } catch {
    return { widths: {}, visibility: {}, sort: { id: "daysToDemurrage", dir: "asc" } };
  }
}

function savePrefs(userId: string | undefined, prefs: TablePrefs) {
  const key = `sc_shipments_table_prefs_${userId || "anon"}`;
  try {
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch {
    // ignore storage errors
  }
}

function CopyCell({ value, width }: { value: string | undefined; width: number }) {
  const [copied, setCopied] = useState(false);
  const text = value || "";

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <td className="px-3 py-1.5 text-muted-foreground" style={{ width, minWidth: width, maxWidth: width }}>
      {text ? (
        <span className="inline-flex items-center gap-1.5 group max-w-full">
          <span className="truncate">{text}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="relative inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
            title="Copy"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            {copied && (
              <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-foreground text-background text-[10px] font-medium whitespace-nowrap animate-in fade-in zoom-in-95 duration-150">
                Copied!
              </span>
            )}
          </button>
        </span>
      ) : (
        "—"
      )}
    </td>
  );
}

function getSortValue(s: Shipment, id: ColumnId): string | number | null {
  const status = calcStatus(s);
  switch (id) {
    case "type": return s.shipmentType === "AIR" ? "AIR" : (s.seaMode || "SEA");
    case "owner": return s.owner || "";
    case "supplier": return s.supplierName || "";
    case "po": return s.poNumber || "";
    case "origin": return s.countryOfOrigin || "";
    case "acid": return s.acidNumber || "";
    case "cert": return s.customsCertNumber || "";
    case "mbl": return s.masterBL || "";
    case "status": return status;
    case "etd": return s.etd || "";
    case "etaPort": return s.etaPort || "";
    case "freeDays": return s.shipmentType === "SEA" && s.seaMode === "FCL" ? (s.freeDays ?? null) : null;
    case "lastFreeRelease": return calcLastFreeReleaseDate(s) || "";
    case "daysToDemurrage": return calcRemainingDaysToDemurrage(s);
    default: return "";
  }
}

export default function ShipmentsList() {
  const { shipments, refresh } = useShipments();
  const { refresh: refreshMasterData } = useMasterData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [modeFilter, setModeFilter] = useState<string>("all");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerShipment, setDrawerShipment] = useState<Shipment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    summary: ImportSummary;
    errors: ImportRowError[];
    masterDataErrors: string[];
    serverAdded?: number;
    serverSkipped?: number;
  } | null>(null);

  const userId = user?.id;
  const [prefs, setPrefs] = useState<TablePrefs>(() => loadPrefs(userId));
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    setPrefs(loadPrefs(userId));
  }, [userId]);

  useEffect(() => {
    savePrefs(userId, prefs);
  }, [userId, prefs]);

  const columnWidths = useMemo(() => {
    const out = { ...DEFAULT_WIDTHS };
    for (const c of COLUMNS) {
      const v = prefs.widths[c.id];
      if (typeof v === "number" && Number.isFinite(v)) out[c.id] = Math.max(c.minWidth, v);
    }
    return out;
  }, [prefs.widths]);

  const columnVisibility = useMemo(() => {
    const out = { ...DEFAULT_VISIBILITY };
    for (const c of COLUMNS) {
      if (c.hideable === false) { out[c.id] = true; continue; }
      const v = prefs.visibility[c.id];
      if (typeof v === "boolean") out[c.id] = v;
    }
    return out;
  }, [prefs.visibility]);

  const visibleColumns = useMemo(() => COLUMNS.filter((c) => columnVisibility[c.id]), [columnVisibility]);
  const tableWidth = useMemo(() => visibleColumns.reduce((sum, c) => sum + columnWidths[c.id], 0), [visibleColumns, columnWidths]);

  const sort = prefs.sort ?? { id: "daysToDemurrage" as ColumnId, dir: "asc" as SortDir };

  const setSort = (id: ColumnId) => {
    const col = COLUMNS.find((c) => c.id === id);
    if (!col?.sortable) return;
    setPrefs((prev) => {
      const current = prev.sort ?? { id: "daysToDemurrage" as ColumnId, dir: "asc" as SortDir };
      const next: { id: ColumnId; dir: SortDir } =
        current.id === id ? { id, dir: current.dir === "asc" ? "desc" : "asc" } : { id, dir: "asc" };
      return { ...prev, sort: next };
    });
  };

  const setColumnVisible = (id: ColumnId, visible: boolean) => {
    const col = COLUMNS.find((c) => c.id === id);
    if (!col || col.hideable === false) return;
    setPrefs((prev) => ({ ...prev, visibility: { ...prev.visibility, [id]: visible } }));
  };

  const resizingRef = useRef<{ id: ColumnId; startX: number; startWidth: number } | null>(null);

  const onResizeStart = useCallback((e: React.MouseEvent, id: ColumnId) => {
    e.preventDefault();
    e.stopPropagation();
    const col = COLUMNS.find((c) => c.id === id);
    if (!col) return;
    resizingRef.current = { id, startX: e.clientX, startWidth: columnWidths[id] };
    const onMove = (ev: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const next = Math.max(col.minWidth, r.startWidth + (ev.clientX - r.startX));
      setPrefs((prev) => ({ ...prev, widths: { ...prev.widths, [r.id]: next } }));
    };
    const onUp = () => {
      resizingRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [columnWidths]);

  const suppliers = useMemo(() => [...new Set(shipments.map((s) => s.supplierName))], [shipments]);
  const owners = useMemo(() => [...new Set(shipments.map((s) => s.owner).filter(Boolean))], [shipments]);

  const filtered = useMemo(() => {
    const rows = shipments.filter((s) => {
      const matchSearch =
        !search ||
        s.id.toLowerCase().includes(search.toLowerCase()) ||
        s.poNumber.toLowerCase().includes(search.toLowerCase()) ||
        s.supplierName.toLowerCase().includes(search.toLowerCase()) ||
        (s.acidNumber && s.acidNumber.toLowerCase().includes(search.toLowerCase())) ||
        (s.customsCertNumber && s.customsCertNumber.toLowerCase().includes(search.toLowerCase())) ||
        (s.masterBL && s.masterBL.toLowerCase().includes(search.toLowerCase()));
      const matchStatus = statusFilter === "all" || calcStatus(s) === statusFilter;
      const matchSupplier = supplierFilter === "all" || s.supplierName === supplierFilter;
      const matchOwner = ownerFilter === "all" || s.owner === ownerFilter;
      const matchMode =
        modeFilter === "all" ||
        (modeFilter === "AIR"
          ? s.shipmentType === "AIR"
          : s.shipmentType === "SEA" && s.seaMode === modeFilter);
      return matchSearch && matchStatus && matchSupplier && matchOwner && matchMode;
    });

    const dir = sort.dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av = getSortValue(a, sort.id);
      const bv = getSortValue(b, sort.id);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * dir;
    });
    return rows;
  }, [shipments, search, statusFilter, supplierFilter, ownerFilter, modeFilter, sort]);

  // Reset to page 1 whenever filters/search change
  useEffect(() => { setPage(1); }, [search, statusFilter, supplierFilter, ownerFilter, modeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, filtered.length);

  const handleExport = async () => {
    try {
      const excelSettings = await loadShipmentExcelSettings();
      exportShipmentsToExcel(filtered, excelSettings);
      toast.success("Excel file downloaded");
    } catch (err: any) {
      toast.error(err?.message || "Failed to export shipments");
    }
  };

  const openDrawer = (s: Shipment, e: React.MouseEvent) => {
    e.stopPropagation();
    setDrawerShipment(s);
    setDrawerOpen(true);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    try {
      const excelSettings = await loadShipmentExcelSettings();
      const data = await file.arrayBuffer();
      const existingShipments = shipments.map((s) => ({ id: s.id, acidNumber: s.acidNumber }));
      const prepared = parseAndValidateImportFile(data, excelSettings, existingShipments);

      let serverAdded = 0;
      let serverSkipped = 0;
      const masterDataErrors: string[] = [];

      const masterDataEntries: Array<[string, string[]]> = [
        ["supplier_name", prepared.masterData.suppliers],
        ["country_of_origin", prepared.masterData.origins],
        ["owner", prepared.masterData.owners],
        ["shipping_line", prepared.masterData.shippingLines],
      ].filter(([, values]) => values.length > 0) as Array<[string, string[]]>;

      if (masterDataEntries.length > 0) {
        const results = await Promise.allSettled(
          masterDataEntries.map(([category, values]) => apiBulkAddMasterData(category, values))
        );
        for (const r of results) {
          if (r.status === "rejected") masterDataErrors.push(r.reason?.message || "Failed to add master data values");
        }
        if (masterDataErrors.length > 0) {
          toast.error("Some master data values could not be added; check import report");
        }
        await refreshMasterData().catch(() => {});
      }

      if (prepared.shipments.length > 0) {
        const result = await apiBulkCreateShipments(prepared.shipments);
        serverAdded = result?.added || 0;
        serverSkipped = typeof result?.skipped === "number" ? result.skipped : Math.max(0, prepared.shipments.length - serverAdded);
        if (serverAdded > 0) await refresh().catch(() => {});
      }

      const summary: ImportSummary = {
        ...prepared.summary,
        successfullyImportedRows: serverAdded,
        skippedRows: prepared.summary.skippedRows + serverSkipped,
        totalRowsProcessed: prepared.summary.totalRowsProcessed,
        failedRows: prepared.summary.failedRows,
      };
      // If server skipped some that parser considered valid, keep total consistent
      summary.totalRowsProcessed = summary.successfullyImportedRows + summary.skippedRows + summary.failedRows;

      const errors: ImportRowError[] = [...prepared.errors];
      if (serverSkipped > 0) {
        errors.push({
          rowNumber: 0,
          column: "Import",
          invalidValue: "",
          reason: `${serverSkipped} row(s) were not imported by the server (possible ID conflict).`,
        });
      }
      for (const msg of masterDataErrors) {
        errors.push({
          rowNumber: 0,
          column: "Master Data",
          invalidValue: "",
          reason: msg,
        });
      }

      setImportResult({ summary, errors, masterDataErrors, serverAdded, serverSkipped });

      if (summary.successfullyImportedRows > 0 && summary.failedRows === 0 && summary.skippedRows === 0) {
        toast.success(`${summary.successfullyImportedRows} shipment(s) imported`);
      } else if (summary.successfullyImportedRows > 0) {
        toast.warning(`Imported ${summary.successfullyImportedRows}, skipped ${summary.skippedRows}, failed ${summary.failedRows}`);
      } else if (summary.totalRowsProcessed === 0 && prepared.errors.length > 0) {
        toast.error("No rows imported. Check the error report.");
      } else {
        toast.warning(`No new shipments imported. Skipped ${summary.skippedRows}, failed ${summary.failedRows}`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to read file");
    } finally {
      setImporting(false);
    }
  };

  const downloadErrors = () => {
    if (!importResult || importResult.errors.length === 0) return;
    downloadImportErrorReport(importResult.errors, importResult.summary);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Shipments</h1>
          <p className="text-muted-foreground text-sm">
            {filtered.length === 0 ? "No shipments" : `Showing ${rangeStart}–${rangeEnd} of ${filtered.length}`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileSelected}
          />
          <Button variant="outline" size="sm" onClick={handleImportClick} disabled={importing}>
            <Upload className="h-4 w-4 mr-1.5" /> {importing ? "Importing..." : "Import from Excel"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1.5" /> Export Shipments
          </Button>
          <Button size="sm" onClick={() => navigate("/shipments/new")}>
            <Plus className="h-4 w-4 mr-1.5" /> New Shipment
          </Button>
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between gap-4 px-4 py-2 border-t bg-muted/20 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="border rounded px-1.5 py-0.5 text-xs bg-background"
            >
              {[10, 15, 20, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="ml-2">
              {filtered.length === 0 ? "No results" : `Showing ${rangeStart}–${rangeEnd} of ${filtered.length}`}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)} disabled={safePage === 1}
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium transition-colors" title="First page">«</button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium transition-colors" title="Previous page">‹</button>
            <span className="px-2 text-xs text-muted-foreground whitespace-nowrap">
              Page {safePage} of {totalPages}
            </span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium transition-colors" title="Next page">›</button>
            <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages}
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium transition-colors" title="Last page">»</button>
          </div>
        </div>
      </div>

      {importResult && (
        <Card className={cn("p-4 space-y-3", importResult.summary.failedRows > 0 || importResult.errors.length > 0 ? "border-amber-300" : "border-emerald-300")}>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileWarning className={cn("h-4 w-4", importResult.summary.failedRows > 0 ? "text-amber-600" : "text-emerald-600")} />
                Import Summary
              </div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                <span>Total processed: <strong className="text-foreground">{importResult.summary.totalRowsProcessed}</strong></span>
                <span>Imported: <strong className="text-foreground">{importResult.summary.successfullyImportedRows}</strong></span>
                <span>Skipped: <strong className="text-foreground">{importResult.summary.skippedRows}</strong></span>
                <span>Failed: <strong className="text-foreground">{importResult.summary.failedRows}</strong></span>
              </div>
              {importResult.masterDataErrors.length > 0 && (
                <div className="text-xs text-amber-700">
                  Some master data values could not be added automatically. Rows may still be imported if values were valid.
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {importResult.errors.length > 0 && (
                <Button variant="outline" size="sm" onClick={downloadErrors}>
                  <Download className="h-4 w-4 mr-1.5" /> Download Error Report
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => setImportResult(null)} aria-label="Dismiss import summary">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {importResult.errors.length > 0 && (
            <div className="border rounded-md overflow-hidden">
              <div className="max-h-44 overflow-auto text-xs">
                <table className="w-full">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium">Row</th>
                      <th className="text-left px-2 py-1.5 font-medium">Column</th>
                      <th className="text-left px-2 py-1.5 font-medium">Value</th>
                      <th className="text-left px-2 py-1.5 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.errors.slice(0, 50).map((err, i) => (
                      <tr key={`${err.rowNumber}-${err.column}-${i}`} className="border-t">
                        <td className="px-2 py-1.5">{err.rowNumber}</td>
                        <td className="px-2 py-1.5">{err.column}</td>
                        <td className="px-2 py-1.5 max-w-[180px] truncate" title={err.invalidValue}>{err.invalidValue || "—"}</td>
                        <td className="px-2 py-1.5">{err.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importResult.errors.length > 50 && (
                <div className="px-2 py-1.5 text-[11px] text-muted-foreground border-t bg-muted/20">
                  Showing first 50 errors. Download the error report for full details.
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ID, PO, supplier, ACID, Cert#, MBL..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Not Shipped">Not Shipped</SelectItem>
            <SelectItem value="In Transit">In Transit</SelectItem>
            <SelectItem value="At Customs">At Customs</SelectItem>
            <SelectItem value="Released">Released</SelectItem>
          </SelectContent>
        </Select>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Owner" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Owners</SelectItem>
            {owners.map((o) => <SelectItem key={o} value={o!}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Supplier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            {suppliers.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Mode" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            <SelectItem value="FCL">FCL</SelectItem>
            <SelectItem value="LCL">LCL</SelectItem>
            <SelectItem value="AIR">AIR</SelectItem>
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-10 gap-1.5">
              <Settings2 className="h-4 w-4" /> Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 max-h-80 overflow-auto">
            <DropdownMenuLabel>Visible Columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {COLUMNS.filter((c) => c.hideable !== false).map((c) => (
              <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/50 rounded-sm">
                <Checkbox
                  checked={columnVisibility[c.id]}
                  onCheckedChange={(v) => setColumnVisible(c.id, !!v)}
                />
                <span>{c.label}</span>
              </label>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse" style={{ tableLayout: "fixed", width: tableWidth, minWidth: tableWidth }}>
            <thead>
              <tr className="border-b bg-muted/40">
                {visibleColumns.map((col) => {
                  const width = columnWidths[col.id];
                  const isSorted = sort.id === col.id;
                  const canSort = !!col.sortable;
                  return (
                    <th
                      key={col.id}
                      className={cn(
                        "relative px-3 py-1.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground select-none group/th",
                        col.align === "center" ? "text-center" : "text-left",
                        canSort && "cursor-pointer hover:bg-muted/70 hover:text-foreground transition-colors"
                      )}
                      style={{ width, minWidth: col.minWidth, maxWidth: width }}
                      onClick={canSort ? () => setSort(col.id) : undefined}
                      aria-sort={isSorted ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                    >
                      <div className={cn("flex items-center gap-1.5", col.align === "center" && "justify-center")}>
                        <span className="truncate">{col.label}</span>
                        {canSort && (
                          isSorted ? (
                            sort.dir === "asc" ? <ArrowUp className="h-3.5 w-3.5 text-primary shrink-0" /> : <ArrowDown className="h-3.5 w-3.5 text-primary shrink-0" />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-0 group-hover/th:opacity-50 shrink-0 transition-opacity" />
                          )
                        )}
                      </div>
                      <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize ${col.label} column`}
                        className="absolute top-0 right-0 h-full w-2 cursor-col-resize touch-none group/resize"
                        onMouseDown={(e) => onResizeStart(e, col.id)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="absolute top-1/2 right-0 -translate-y-1/2 h-5 w-px bg-border group-hover/resize:bg-primary/60 group-hover/resize:w-[2px]" />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {paginated.map((s) => {
                const computedStatus = calcStatus(s);
                const lastFree = calcLastFreeReleaseDate(s);
                const remaining = calcRemainingDaysToDemurrage(s);
                const lastFreeClass = lastFree
                  ? new Date(lastFree) < new Date() ? "text-destructive font-semibold"
                    : (new Date(lastFree).getTime() - new Date().getTime()) / 86400000 <= 2 ? "text-warning font-semibold"
                    : ""
                  : "";
                const remainingClass = remaining != null
                  ? remaining <= 0 ? "text-destructive font-bold"
                    : remaining <= 3 ? "text-warning font-semibold"
                    : "text-success font-medium"
                  : "";

                return (
                  <tr
                    key={s.id}
                    className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/shipments/${s.id}`)}
                  >
                    {visibleColumns.map((col) => {
                      const w = columnWidths[col.id];
                      const cellStyle = { width: w, minWidth: w, maxWidth: w };
                      const baseCell = cn("px-3 py-1.5 overflow-hidden text-ellipsis whitespace-nowrap", col.align === "center" ? "text-center" : "text-left");
                      switch (col.id) {
                        case "type":
                          return (
                            <td key={col.id} className={baseCell} style={cellStyle}>
                              {s.shipmentType === "SEA" ? <Ship className="h-4 w-4 text-info inline" /> : <Plane className="h-4 w-4 text-accent inline" />}
                            </td>
                          );
                        case "owner":
                          return <td key={col.id} className={cn(baseCell, "font-medium text-primary")} style={cellStyle} title={s.owner || ""}>{s.owner || "—"}</td>;
                        case "supplier":
                          return <td key={col.id} className={baseCell} style={cellStyle} title={s.supplierName}>{s.supplierName}</td>;
                        case "po":
                          return <td key={col.id} className={cn(baseCell, "text-muted-foreground")} style={cellStyle} title={s.poNumber}>{s.poNumber}</td>;
                        case "origin":
                          return <td key={col.id} className={cn(baseCell, "text-muted-foreground")} style={cellStyle} title={s.countryOfOrigin}>{s.countryOfOrigin}</td>;
                        case "acid":
                          return <CopyCell key={col.id} value={s.acidNumber} width={w} />;
                        case "cert":
                          return <CopyCell key={col.id} value={s.customsCertNumber} width={w} />;
                        case "mbl":
                          return <CopyCell key={col.id} value={s.masterBL} width={w} />;
                        case "status":
                          return (
                            <td key={col.id} className={baseCell} style={cellStyle}>
                              <span className={`status-badge ${statusClass[computedStatus] || ""}`}>{computedStatus}</span>
                            </td>
                          );
                        case "etd":
                          return <td key={col.id} className={cn(baseCell, "text-muted-foreground")} style={cellStyle}>{s.etd || "—"}</td>;
                        case "etaPort":
                          return <td key={col.id} className={cn(baseCell, "text-muted-foreground")} style={cellStyle}>{s.etaPort || "—"}</td>;
                        case "freeDays":
                          return <td key={col.id} className={cn(baseCell, "text-muted-foreground")} style={cellStyle}>{s.shipmentType === "SEA" && s.seaMode === "FCL" ? (s.freeDays ?? "—") : "—"}</td>;
                        case "lastFreeRelease":
                          return <td key={col.id} className={cn(baseCell, lastFreeClass)} style={cellStyle}>{lastFree || "—"}</td>;
                        case "daysToDemurrage":
                          return <td key={col.id} className={cn(baseCell, remainingClass)} style={cellStyle}>{remaining != null ? remaining : "—"}</td>;
                        case "actions":
                          return (
                            <td key={col.id} className={baseCell} style={cellStyle}>
                              <button
                                type="button"
                                title="Quick Update"
                                className="inline-flex items-center justify-center rounded-md h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                onClick={(e) => openDrawer(s, e)}
                                id={`quick-update-${s.id}`}
                              >
                                <ClockArrowUp className="h-4 w-4" />
                              </button>
                            </td>
                          );
                        default:
                          return null;
                      }
                    })}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={visibleColumns.length} className="text-center py-8 text-muted-foreground">
                    No shipments found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between gap-4 px-4 py-2 border-t bg-muted/20 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="border rounded px-1.5 py-0.5 text-xs bg-background"
            >
              {[10, 15, 20, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="ml-2">
              {filtered.length === 0 ? "No results" : `Showing ${rangeStart}–${rangeEnd} of ${filtered.length}`}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)} disabled={safePage === 1}
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium transition-colors" title="First page">«</button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium transition-colors" title="Previous page">‹</button>
            <span className="px-2 text-xs text-muted-foreground whitespace-nowrap">
              Page {safePage} of {totalPages}
            </span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium transition-colors" title="Next page">›</button>
            <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages}
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium transition-colors" title="Last page">»</button>
          </div>
        </div>
      </div>

      <QuickUpdateDrawer
        shipment={drawerShipment}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}