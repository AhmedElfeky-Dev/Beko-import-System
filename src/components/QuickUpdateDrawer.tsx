import { useState, useEffect } from "react";
import { Shipment, calcStatus } from "@/types/shipment";
import { apiPatchShipment } from "@/lib/api";
import { useShipments } from "@/context/ShipmentContext";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  CalendarDays,
  Anchor,
  DollarSign,
  Save,
  Loader2,
  Package,
} from "lucide-react";

interface QuickUpdateDrawerProps {
  shipment: Shipment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormState {
  etd: string;
  etaPort: string;
  etaFactory: string;
  ataFactory: string;
  preAlertDate: string;
  cargoxDate: string;
  form4ReceivingDate: string;
  doDate: string;
  originalDocsDate: string;
  customsCertNumber: string;
  customsCertDate: string;
  masterBL: string;
  houseBL: string;
  invoiceValue: string;
  currency: string;
}

function initForm(s: Shipment | null): FormState {
  return {
    etd: s?.etd || "",
    etaPort: s?.etaPort || "",
    etaFactory: s?.etaFactory || "",
    ataFactory: s?.ataFactory || "",
    preAlertDate: s?.preAlertDate || "",
    cargoxDate: s?.cargoxDate || "",
    form4ReceivingDate: s?.form4ReceivingDate || "",
    doDate: s?.doDate || "",
    originalDocsDate: s?.originalDocsDate || "",
    customsCertNumber: s?.customsCertNumber || "",
    customsCertDate: s?.customsCertDate || "",
    masterBL: s?.masterBL || "",
    houseBL: s?.houseBL || "",
    invoiceValue: s?.invoiceValue != null ? String(s.invoiceValue) : "",
    currency: s?.currency || "USD",
  };
}

export default function QuickUpdateDrawer({
  shipment,
  open,
  onOpenChange,
}: QuickUpdateDrawerProps) {
  const { refresh } = useShipments();
  const [form, setForm] = useState<FormState>(initForm(shipment));
  const [saving, setSaving] = useState(false);

  // Sync form when shipment changes
  useEffect(() => {
    if (shipment) setForm(initForm(shipment));
  }, [shipment]);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSave = async () => {
    if (!shipment) return;

    const next = {
      etd: form.etd || "",
      etaPort: form.etaPort || "",
      etaFactory: form.etaFactory || "",
      ataFactory: form.ataFactory || "",
      preAlertDate: form.preAlertDate || "",
      cargoxDate: form.cargoxDate || "",
      form4ReceivingDate: form.form4ReceivingDate || "",
      doDate: form.doDate || "",
      originalDocsDate: form.originalDocsDate || "",
      customsCertDate: form.customsCertDate || "",
      customsCertNumber: form.customsCertNumber || "",
      masterBL: form.masterBL || "",
      houseBL: form.houseBL || "",
      invoiceValue: form.invoiceValue === "" ? 0 : Number(form.invoiceValue),
      currency: form.currency || shipment.currency || "USD",
    };

    const datePairs: Array<[keyof typeof next, keyof typeof next, string, string]> = [
      ["etd", "etaPort", "ETD", "ETA Port"],
      ["etaPort", "etaFactory", "ETA Port", "ETA Factory"],
      ["etaPort", "ataFactory", "ETA Port", "ATA Factory"],
    ];
    for (const [a, b, la, lb] of datePairs) {
      const va = next[a] as string;
      const vb = next[b] as string;
      if (va && vb && new Date(va) > new Date(vb)) {
        toast.error(`${la} cannot be after ${lb}`);
        return;
      }
    }

    const merged = { ...shipment, ...next } as Shipment;
    merged.status = calcStatus(merged);

    const patch: Record<string, any> = {};
    const dateKeys = [
      "etd",
      "etaPort",
      "etaFactory",
      "ataFactory",
      "preAlertDate",
      "cargoxDate",
      "form4ReceivingDate",
      "doDate",
      "originalDocsDate",
      "customsCertDate",
    ] as const;
    for (const k of dateKeys) {
      const oldVal = ((shipment as any)[k] ?? "") as string;
      const newVal = next[k] ?? "";
      if (oldVal !== newVal) patch[k] = newVal ? newVal : null;
    }

    const textKeys = ["customsCertNumber", "masterBL", "houseBL", "currency"] as const;
    for (const k of textKeys) {
      const oldVal = ((shipment as any)[k] ?? "") as string;
      const newVal = (next[k] ?? "") as string;
      if (oldVal !== newVal) patch[k] = newVal;
    }

    const oldInvoice = Number(shipment.invoiceValue) || 0;
    const newInvoice = Number(next.invoiceValue) || 0;
    if (oldInvoice !== newInvoice) patch.invoiceValue = newInvoice;

    if ((shipment.status || "") !== merged.status) patch.status = merged.status;

    if (Object.keys(patch).length === 0) {
      toast.info("No changes to save");
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      await apiPatchShipment(shipment.id, { ...patch, _version: shipment._version });
      await refresh();
      toast.success("Shipment updated successfully");
      onOpenChange(false);
    } catch (err: any) {
      if (err?.status === 409) {
        toast.error("Conflict: This shipment was modified by another user. Refreshing...");
        await refresh();
      } else {
        toast.error("Update failed: " + (err?.message || "Unknown error"));
      }
    } finally {
      setSaving(false);
    }
  };

  if (!shipment) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col p-0 overflow-hidden"
      >
        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-4">
          <SheetHeader className="space-y-1">
            <SheetTitle className="flex items-center gap-2 text-xl">
              <Package className="h-5 w-5 text-primary" />
              Quick Update
            </SheetTitle>
            <SheetDescription className="sr-only">
              Quickly update key dates, shipping details, and financial information for this shipment.
            </SheetDescription>
          </SheetHeader>
          {/* Reference info */}
          <div className="mt-4 flex items-center gap-4 rounded-lg bg-muted/60 px-4 py-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                ACID
              </p>
              <p className="text-sm font-semibold">
                {shipment.acidNumber || "—"}
              </p>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Supplier
              </p>
              <p className="text-sm font-semibold truncate max-w-[120px]">
                {shipment.supplierName}
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* === Key Dates === */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <CalendarDays className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">
                Key Dates
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DateField label="ETD" value={form.etd} onChange={set("etd")} id="qu-etd" />
              <DateField label="ETA Port" value={form.etaPort} onChange={set("etaPort")} id="qu-eta-port" />
              <DateField label="ETA Factory" value={form.etaFactory} onChange={set("etaFactory")} id="qu-eta-factory" />
              <DateField label="ATA Factory" value={form.ataFactory} onChange={set("ataFactory")} id="qu-ata-factory" />
              <DateField label="Pre-Alert Date" value={form.preAlertDate} onChange={set("preAlertDate")} id="qu-prealert" />
              <DateField label="CargoX Date" value={form.cargoxDate} onChange={set("cargoxDate")} id="qu-cargox" />
              <DateField label="Form 4 Date" value={form.form4ReceivingDate} onChange={set("form4ReceivingDate")} id="qu-form4" />
              <DateField label="D/O Date" value={form.doDate} onChange={set("doDate")} id="qu-do" />
              <DateField label="Original Docs Date" value={form.originalDocsDate} onChange={set("originalDocsDate")} id="qu-original-docs" />
              <TextField label="Customs Cert #" value={form.customsCertNumber} onChange={set("customsCertNumber")} id="qu-cert-number" />
              <DateField label="Customs Cert Date" value={form.customsCertDate} onChange={set("customsCertDate")} id="qu-cert-date" />
            </div>
          </section>

          <Separator />

          {/* === Shipping Details === */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Anchor className="h-4 w-4 text-accent" style={{ color: "hsl(var(--accent))" }} />
              <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--accent))" }}>
                Shipping Details
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <TextField label="Master B/L" value={form.masterBL} onChange={set("masterBL")} id="qu-master-bl" />
              <TextField label="House B/L" value={form.houseBL} onChange={set("houseBL")} id="qu-house-bl" />
            </div>
          </section>

          <Separator />

          {/* === Financial Details === */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-600">
                Financial Details
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <Label htmlFor="qu-currency" className="text-xs font-medium text-muted-foreground mb-1 block">
                  Currency
                </Label>
                <select
                  id="qu-currency"
                  value={form.currency}
                  onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="EGP">EGP</option>
                </select>
              </div>
              <div>
                <Label htmlFor="qu-invoice-value" className="text-xs font-medium text-muted-foreground mb-1 block">
                  Invoice Value ({form.currency})
                </Label>
                <Input
                  id="qu-invoice-value"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.invoiceValue}
                  onChange={set("invoiceValue")}
                  className="h-9"
                />
              </div>
            </div>
          </section>
        </div>

        {/* ── Sticky footer ── */}
        <div className="border-t bg-background px-6 py-4">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-11 text-sm font-semibold gap-2"
            id="qu-save-button"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Saving..." : "Save Updates"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ── Tiny sub-components ── */

function DateField({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  id: string;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground mb-1 block">
        {label}
      </Label>
      <Input id={id} type="date" value={value} onChange={onChange} className="h-9" />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  id: string;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground mb-1 block">
        {label}
      </Label>
      <Input id={id} type="text" value={value} onChange={onChange} className="h-9" />
    </div>
  );
}
