import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shipment, convertToBase, totalCostBase, totalCostByType, calcConvertedInvoiceValue,
  calcF4Commission, calcCostRatio, recalcCostConversions, totalContainers,
} from "@/types/shipment";
import { useShipments } from "@/context/ShipmentContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, ArrowLeft, Calculator, TrendingUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import CostItemsEditor from "@/components/CostItemsEditor";

interface Props {
  shipment: Shipment;
}

export default function ShipmentCostsTab({ shipment }: Props) {
  const { updateShipment } = useShipments();
  const navigate = useNavigate();
  const [form, setForm] = useState<Shipment>(() => ({
    ...shipment,
    costs: recalcCostConversions(shipment),
  }));
  const [saving, setSaving] = useState(false);

  const recalcAndSet = (updated: Shipment) => {
    updated.costs = recalcCostConversions(updated);
    const f4Idx = updated.costs.findIndex((c) => c.type === "F4 Commission");
    if (f4Idx >= 0) {
      updated.costs[f4Idx].amount = calcF4Commission(updated);
      updated.costs[f4Idx].convertedAmount = convertToBase(
        updated.costs[f4Idx].amount,
        updated.costs[f4Idx].currency,
        updated
      );
    }
    setForm({ ...updated });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateShipment(form);
      toast.success("Costs saved successfully");
    } catch {
      // context already toasts on failure
    } finally {
      setSaving(false);
    }
  };

  const convertedInvoice = calcConvertedInvoiceValue(form);
  const totalBase = totalCostBase(form);
  const byType = totalCostByType(form);
  const costRatio = calcCostRatio(form);

  const fmt = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/shipments/${form.id}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cost Management</h1>
            <p className="text-sm text-muted-foreground">{form.id} · {form.supplierName}</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          {saving ? "Saving..." : "Save Costs"}
        </Button>
      </div>

      {/* Shipment Header Info (Read-only) */}
      <div className="bg-card rounded-lg border p-5 shadow-sm">
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Shipment Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Supplier</p>
            <p className="font-medium">{form.supplierName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">ACID Number</p>
            <p className="font-medium">{form.acidNumber || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">PO Number</p>
            <p className="font-medium">{form.poNumber}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Invoice Value</p>
            <p className="font-medium">{fmt(form.invoiceValue)} {form.currency}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Incoterm</p>
            <p className="font-medium">{form.incoterm || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Factory</p>
            <p className="font-medium">{form.factory}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Containers</p>
            <p className="font-medium">{totalContainers(form) || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Exchange Rate USD</p>
            <p className="font-medium">{form.exchangeRateUSD} → {form.baseCurrency}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Exchange Rate EUR</p>
            <p className="font-medium">{form.exchangeRateEUR} → {form.baseCurrency}</p>
          </div>
        </div>
      </div>

      {/* Exchange Rate & F4 Rate Controls */}
      <div className="bg-card rounded-lg border p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Calculator className="h-4 w-4" /> Rate Settings
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Exchange Rate USD</Label>
            <Input
              type="number"
              step="0.01"
              value={form.exchangeRateUSD}
              onChange={(e) => recalcAndSet({ ...form, exchangeRateUSD: Number(e.target.value) })}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Exchange Rate EUR</Label>
            <Input
              type="number"
              step="0.01"
              value={form.exchangeRateEUR}
              onChange={(e) => recalcAndSet({ ...form, exchangeRateEUR: Number(e.target.value) })}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Base Currency</Label>
            <Select value={form.baseCurrency} onValueChange={(v) => recalcAndSet({ ...form, baseCurrency: v as any })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EGP">EGP</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">F4 Commission Rate (%)</Label>
            <Input
              type="number"
              step="0.1"
              value={form.f4CommissionRate}
              onChange={(e) => recalcAndSet({ ...form, f4CommissionRate: Number(e.target.value) })}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Converted Invoice Value</Label>
            <Input
              value={`${fmt(convertedInvoice)} ${form.baseCurrency}`}
              readOnly
              disabled
              className="h-9 text-sm bg-muted"
            />
          </div>
        </div>
      </div>

      {/* Cost Items Table — shared component */}
      <CostItemsEditor
        costs={form.costs}
        baseCurrency={form.baseCurrency}
        invoiceCurrency={form.currency}
        invoiceValue={form.invoiceValue}
        exchangeRateUSD={form.exchangeRateUSD}
        exchangeRateEUR={form.exchangeRateEUR}
        f4CommissionRate={form.f4CommissionRate}
        onChange={(newCosts) => setForm((prev) => ({ ...prev, costs: newCosts }))}
      />

      {/* Summary Section */}
      {form.costs.length > 0 && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Cost by Type */}
          <div className="bg-card rounded-lg border p-5 shadow-sm">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4" /> Cost Breakdown by Type
            </h3>
            <div className="space-y-2">
              {byType.map((item) => (
                <div key={item.type} className="flex justify-between text-sm py-1.5 border-b last:border-0">
                  <span>{item.type}</span>
                  <span className="font-medium">{fmt(item.total)} {form.baseCurrency}</span>
                </div>
              ))}
            </div>
          </div>

          {/* KPIs */}
          <div className="bg-card rounded-lg border p-5 shadow-sm">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Financial KPIs</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <p className="text-2xl font-bold">{fmt(totalBase)}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Cost ({form.baseCurrency})</p>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <p className="text-2xl font-bold">{fmt(convertedInvoice)}</p>
                <p className="text-xs text-muted-foreground mt-1">Invoice ({form.baseCurrency})</p>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <p className="text-2xl font-bold">{costRatio != null ? `${costRatio.toFixed(1)}%` : "—"}</p>
                <p className="text-xs text-muted-foreground mt-1">Cost Ratio</p>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <p className="text-2xl font-bold">{fmt(calcF4Commission(form))}</p>
                <p className="text-xs text-muted-foreground mt-1">F4 Commission ({form.f4CommissionRate}%)</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
