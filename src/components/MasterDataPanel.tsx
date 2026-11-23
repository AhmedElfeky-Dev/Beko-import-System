import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Upload, Download, Search } from "lucide-react";
import { useMasterData, MASTER_CATEGORIES, MasterCategory, MasterDataItem } from "@/hooks/useMasterData";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

interface EditState {
  category: MasterCategory;
  item?: MasterDataItem;
  value: string;
  code: string;
}

function CategoryCard({
  category,
  label,
  onEdit,
}: {
  category: MasterCategory;
  label: string;
  onEdit: (state: EditState) => void;
}) {
  const { isAdmin } = useAuth();
  const { items, deleteValue } = useMasterData(category);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      items.filter(
        (i) =>
          i.value.toLowerCase().includes(search.toLowerCase()) ||
          (i.code ?? "").toLowerCase().includes(search.toLowerCase()),
      ),
    [items, search],
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-4 bg-muted/40 py-4">
        <CardTitle className="text-lg">{label}</CardTitle>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 h-9 w-56"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            onClick={() => onEdit({ category, value: "", code: "" })}
          >
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-[1fr_180px_80px] px-4 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/20">
          <div>Name</div>
          <div>Code</div>
          <div className="text-right">Actions</div>
        </div>
        <div className="max-h-[320px] overflow-y-auto divide-y">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No values yet</div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[1fr_180px_80px] items-center px-4 py-2.5 text-sm hover:bg-muted/30"
              >
                <div className="font-medium">{item.value}</div>
                <div className="text-muted-foreground">{item.code || "—"}</div>
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() =>
                      onEdit({
                        category,
                        item,
                        value: item.value,
                        code: item.code ?? "",
                      })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        if (confirm(`Delete "${item.value}"?`)) deleteValue(item.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function MasterDataPanel() {
  const { addValue, updateValue, bulkAdd } = useMasterData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["category", "value", "code"],
      ...MASTER_CATEGORIES.flatMap((c) => [[c.key, `Example ${c.label}`, ""]]),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Master Data");
    XLSX.writeFile(wb, "master-data-template.xlsx");
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const validCats = new Set(MASTER_CATEGORIES.map((c) => c.key as string));
      const groups: Record<string, { value: string; code: string | null }[]> = {};
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
        for (const row of rows) {
          const keys = Object.keys(row);
          const catKey = keys.find((k) => k.toLowerCase().trim() === "category");
          const valKey = keys.find((k) => k.toLowerCase().trim() === "value" || k.toLowerCase().trim() === "name");
          const codeKey = keys.find((k) => k.toLowerCase().trim() === "code");
          let cat = catKey ? String(row[catKey]).trim() : "";
          const val = valKey ? String(row[valKey]).trim() : "";
          const code = codeKey ? String(row[codeKey]).trim() : "";
          if (!cat && validCats.has(sheetName)) cat = sheetName;
          if (!validCats.has(cat) || !val) continue;
          (groups[cat] ||= []).push({ value: val, code: code || null });
        }
      }
      let added = 0,
        skipped = 0;
      for (const [cat, values] of Object.entries(groups)) {
        const r = await bulkAdd(cat as MasterCategory, values);
        added += r.added;
        skipped += r.skipped;
      }
      if (added === 0 && skipped === 0) {
        toast.error("No valid rows found. Use columns: category, value, code");
      } else {
        toast.success(`Imported ${added} value(s)${skipped ? `, skipped ${skipped} duplicate/empty` : ""}`);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to read file");
    } finally {
      setImporting(false);
    }
  };

  const handleSave = async () => {
    if (!editState) return;
    const value = editState.value.trim();
    if (!value) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    if (editState.item) {
      const ok = await updateValue(editState.item.id, { value, code: editState.code });
      if (ok) toast.success("Updated");
    } else {
      const r = await addValue(editState.category, value, editState.code);
      if (r) toast.success("Added");
    }
    setSaving(false);
    setEditState(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileSelected}
        />
        <Button type="button" variant="outline" size="sm" onClick={handleDownloadTemplate}>
          <Download className="h-4 w-4 mr-1" /> Template
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
        >
          <Upload className="h-4 w-4 mr-1" /> {importing ? "Importing..." : "Import Excel"}
        </Button>
      </div>

      <div className="space-y-5">
        {MASTER_CATEGORIES.map((c) => (
          <CategoryCard key={c.key} category={c.key} label={c.label} onEdit={setEditState} />
        ))}
      </div>

      <Dialog open={!!editState} onOpenChange={(o) => !o && setEditState(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editState?.item ? "Edit" : "Add"}{" "}
              {MASTER_CATEGORIES.find((c) => c.key === editState?.category)?.label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                autoFocus
                value={editState?.value ?? ""}
                onChange={(e) => setEditState((s) => (s ? { ...s, value: e.target.value } : s))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSave();
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Code (optional)</Label>
              <Input
                value={editState?.code ?? ""}
                onChange={(e) => setEditState((s) => (s ? { ...s, code: e.target.value } : s))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditState(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
