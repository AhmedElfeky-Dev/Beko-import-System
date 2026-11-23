import { useMemo } from "react";
import {
  CostItem, Currency,
  Shipment, convertToBase, totalCostBase, calcF4Commission, recalcCostConversions,
} from "@/types/shipment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableCombobox } from "@/components/SearchableCombobox";
import { Plus, Trash2, Calculator, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { useMasterData } from "@/hooks/useMasterData";

interface CostItemsEditorProps {
  costs: CostItem[];
  baseCurrency: string;
  invoiceCurrency: string;
  invoiceValue: number;
  exchangeRateUSD: number;
  exchangeRateEUR: number;
  f4CommissionRate: number;
  /** Called with the updated costs array whenever a change occurs */
  onChange: (costs: CostItem[]) => void;
}

/** Helper: build a temporary Shipment-like object for calculation helpers */
function makePseudoShipment(props: CostItemsEditorProps, costs: CostItem[]): Shipment {
  return {
    costs,
    baseCurrency: props.baseCurrency,
    currency: props.invoiceCurrency,
    invoiceValue: props.invoiceValue,
    exchangeRateUSD: props.exchangeRateUSD,
    exchangeRateEUR: props.exchangeRateEUR,
    f4CommissionRate: props.f4CommissionRate,
  } as unknown as Shipment;
}

export default function CostItemsEditor(props: CostItemsEditorProps) {
  const { costs, baseCurrency, onChange } = props;
  const { items: costItemMasterData } = useMasterData("cost_item");

  const activeCostTypes = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of costItemMasterData) {
      const value = String(item.value || "").trim();
      const key = value.toLowerCase();
      if (!value || seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
    return out;
  }, [costItemMasterData]);

  const emit = (newCosts: CostItem[]) => {
    const pseudo = makePseudoShipment(props, newCosts);
    onChange(recalcCostConversions(pseudo));
  };

  const addCost = () => {
    const defaultType = activeCostTypes[0] || costs[0]?.type || "Additional Cost";
    emit([...costs, { id: crypto.randomUUID(), type: defaultType, amount: 0, currency: "USD" }]);
  };

  const removeCost = (id: string) => emit(costs.filter((c) => c.id !== id));

  const updateCost = (id: string, field: keyof CostItem, value: any) => {
    emit(costs.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const applyF4 = () => {
    const pseudo = makePseudoShipment(props, costs);
    const commission = calcF4Commission(pseudo);
    const updated = costs.filter((c) => c.type !== "F4 Commission");
    updated.push({
      id: crypto.randomUUID(),
      type: "F4 Commission",
      amount: commission,
      currency: props.invoiceCurrency as Currency,
    });
    emit(updated);
    toast.success(`F4 Commission: ${commission.toLocaleString()} ${props.invoiceCurrency}`);
  };

  const pseudo = makePseudoShipment(props, costs);
  const totalBase = totalCostBase(pseudo);
  const totalInEGP = convertToBase(totalBase, baseCurrency as Currency, { ...pseudo, baseCurrency: "EGP" as any } as Shipment);
  const totalInInvoice = convertToBase(totalBase, baseCurrency as Currency, { ...pseudo, baseCurrency: props.invoiceCurrency as any } as Shipment);
  const totalsToShow: Array<{ amount: number; currency: string }> = [];
  const pushTotal = (amount: number, currency: string) => {
    if (!currency) return;
    if (totalsToShow.some((t) => t.currency === currency)) return;
    totalsToShow.push({ amount, currency });
  };
  pushTotal(totalInEGP, "EGP");
  pushTotal(totalInInvoice, props.invoiceCurrency);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Cost Items
        </h3>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-foreground bg-muted/50 px-3 py-1.5 rounded-md border border-border/50">
            Total: {totalsToShow.map((t) => `${t.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${t.currency}`).join(" / ")}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={applyF4} className="gap-1.5">
            <Calculator className="h-3.5 w-3.5" /> Apply F4 Commission
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={addCost} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Cost
          </Button>
        </div>
      </div>

      {costs.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border/50 rounded-lg">
          No cost items. Click "Add Cost" to start.
        </p>
      ) : (
        <div className="space-y-2">
          {costs.map((cost) => {
            const converted = convertToBase(Number(cost.amount) || 0, cost.currency, pseudo);
            const currentType = String(cost.type || "").trim();

            return (
              <div
                key={cost.id}
                className="grid grid-cols-12 gap-2 items-end p-3 bg-muted/20 rounded-lg border border-border/30"
              >
                <div className="col-span-3 space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase">Type</span>
                  <SearchableCombobox
                    category="cost_item"
                    value={currentType}
                    onChange={(v) => updateCost(cost.id, "type", v)}
                    placeholder="Select cost type"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase">Amount</span>
                  <Input
                    type="number"
                    className="h-8 text-xs"
                    value={cost.amount || ""}
                    onChange={(e) => updateCost(cost.id, "amount", Number(e.target.value))}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase">Currency</span>
                  <Select value={cost.currency} onValueChange={(v) => updateCost(cost.id, "currency", v as Currency)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="EGP">EGP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase">Converted ({baseCurrency})</span>
                  <div className="h-8 flex items-center px-2 text-xs text-muted-foreground bg-muted/30 rounded-md border border-border/20">
                    {converted.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="col-span-2 space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase">Notes</span>
                  <Input
                    className="h-8 text-xs"
                    value={cost.notes || ""}
                    onChange={(e) => updateCost(cost.id, "notes", e.target.value)}
                    placeholder="Notes"
                  />
                </div>
                <div className="col-span-1 flex justify-end pb-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => removeCost(cost.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}