import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { apiGetExcelSettings, apiUpdateExcelSettings } from "@/lib/api";
import {
  SHIPMENT_EXCEL_COLUMNS,
  DEFAULT_SHIPMENT_EXCEL_SETTINGS,
  normalizeShipmentExcelSettings,
  type ShipmentExcelSettings,
} from "@/lib/shipmentExcelConfig";

function kindLabel(kind: string) {
  if (kind === "export_import") return "Export & Import";
  if (kind === "export_only") return "Export-only";
  if (kind === "import_only") return "Import-only";
  return kind;
}

export default function ExcelImportExportSettings() {
  const [settings, setSettings] = useState<ShipmentExcelSettings>(DEFAULT_SHIPMENT_EXCEL_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await apiGetExcelSettings();
        if (!cancelled) setSettings(normalizeShipmentExcelSettings(raw));
      } catch (err: any) {
        if (!cancelled) {
          setSettings(DEFAULT_SHIPMENT_EXCEL_SETTINGS);
          toast.error(err?.message || "Failed to load Excel settings");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => SHIPMENT_EXCEL_COLUMNS, []);

  const updateColumn = (id: string, patch: Partial<{ exportEnabled: boolean; importEnabled: boolean; requiredForImport: boolean }>) => {
    setSettings((prev) => {
      const def = SHIPMENT_EXCEL_COLUMNS.find((c) => c.id === id);
      if (!def) return prev;
      const current = prev.columns[id] || { exportEnabled: def.defaultExportEnabled, importEnabled: def.defaultImportEnabled, requiredForImport: def.defaultRequiredForImport };
      let next = { ...current, ...patch };

      if (def.kind === "export_only") {
        next.importEnabled = false;
        next.requiredForImport = false;
      }
      if (def.systemCritical && def.kind !== "export_only") {
        next.importEnabled = true;
        next.requiredForImport = true;
      }
      // Required only meaningful when import enabled
      if (!next.importEnabled) next.requiredForImport = false;

      const merged = normalizeShipmentExcelSettings({ columns: { ...prev.columns, [id]: next } });
      return merged;
    });
    setDirty(true);
  };

  const resetDefaults = () => {
    setSettings(DEFAULT_SHIPMENT_EXCEL_SETTINGS);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const normalized = normalizeShipmentExcelSettings(settings);
      const saved = await apiUpdateExcelSettings(normalized);
      setSettings(normalizeShipmentExcelSettings(saved));
      setDirty(false);
      toast.success("Excel Import/Export settings saved");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save Excel settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Excel Import/Export Columns</CardTitle>
          <CardDescription>
            Centralized column configuration (single source of truth). Manage which columns are enabled for Export and Import.
            Disabling Export does not disable Import (and vice versa). System-critical import fields are locked to keep import reliable.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetDefaults} disabled={saving || loading}>Reset defaults</Button>
          <Button onClick={save} disabled={saving || loading || !dirty}>{saving ? "Saving..." : "Save changes"}</Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground py-6">Loading settings...</div>
        ) : (
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Excel Header</TableHead>
                  <TableHead>Shipment Field / Data Mapping</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Data Type</TableHead>
                  <TableHead className="text-center">Export Enabled</TableHead>
                  <TableHead className="text-center">Import Enabled</TableHead>
                  <TableHead className="text-center">Required for Import</TableHead>
                  <TableHead>Validation Rules / Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((def) => {
                  const col = settings.columns[def.id];
                  const exportDisabled = def.kind === "import_only" ? false : false; // import-only can still be toggled off (no-op for export) but keep UI simple
                  const importToggleDisabled = def.kind === "export_only" || !!def.systemCritical;
                  const requiredToggleDisabled = def.kind === "export_only" || !!def.systemCritical || !col.importEnabled;
                  return (
                    <TableRow key={def.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span>{def.header}</span>
                          {def.systemCritical && <Badge variant="secondary" className="w-fit">System-critical</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[220px] text-sm">{def.fieldLabel}</TableCell>
                      <TableCell><Badge variant="outline">{kindLabel(def.kind)}</Badge></TableCell>
                      <TableCell>{def.dataType}</TableCell>
                      <TableCell className="text-center">
                        {def.kind === "import_only" ? (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        ) : (
                          <Switch
                            checked={!!col.exportEnabled}
                            onCheckedChange={(v) => updateColumn(def.id, { exportEnabled: v })}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {def.kind === "export_only" ? (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <Switch
                              checked={!!col.importEnabled}
                              disabled={importToggleDisabled}
                              onCheckedChange={(v) => updateColumn(def.id, { importEnabled: v })}
                            />
                            {def.systemCritical && <span className="text-[10px] text-muted-foreground">Locked</span>}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {def.kind === "export_only" ? (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        ) : (
                          <Switch
                            checked={!!col.requiredForImport}
                            disabled={requiredToggleDisabled}
                            onCheckedChange={(v) => updateColumn(def.id, { requiredForImport: v })}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground min-w-[260px]">{def.validationNote || "-"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
