import { useState, useMemo } from "react";
import { useShipments } from "@/context/ShipmentContext";
import { useNavigate } from "react-router-dom";
import { totalCostBase, calcCostRatio, calcConvertedInvoiceValue } from "@/types/shipment";
import { DollarSign, TrendingUp, ArrowRight, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export default function CostsPage() {
  const { shipments } = useShipments();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [costMin, setCostMin] = useState("");
  const [costMax, setCostMax] = useState("");

  const suppliers = useMemo(
    () => [...new Set(shipments.map((s) => s.supplierName))].sort(),
    [shipments]
  );
  const currencies = useMemo(
    () => [...new Set(shipments.map((s) => s.currency))].sort(),
    [shipments]
  );

  const filtered = useMemo(() => {
    return shipments.filter((s) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !s.acidNumber?.toLowerCase().includes(q) &&
          !s.supplierName.toLowerCase().includes(q)
        )
          return false;
      }
      if (supplierFilter !== "all" && s.supplierName !== supplierFilter) return false;
      if (currencyFilter !== "all" && s.currency !== currencyFilter) return false;
      const tc = totalCostBase(s);
      if (costMin && tc < Number(costMin)) return false;
      if (costMax && tc > Number(costMax)) return false;
      return true;
    });
  }, [shipments, search, supplierFilter, currencyFilter, costMin, costMax]);

  const filteredWithCosts = filtered.filter((s) => s.costs.length > 0);
  const filteredWithoutCosts = filtered.filter((s) => s.costs.length === 0);
  // Convert each shipment's total cost (in its base currency) to USD using its own exchange rate
  const toUSD = (s: typeof shipments[number], amountBase: number) => {
    const rateUSD = Number(s.exchangeRateUSD) || 0;
    const rateEUR = Number(s.exchangeRateEUR) || 0;
    if (s.baseCurrency === "USD") return amountBase;
    let inEgp = amountBase;
    if (s.baseCurrency === "EUR") inEgp = amountBase * rateEUR;
    return rateUSD > 0 ? inEgp / rateUSD : 0;
  };
  const toInvoiceCurrency = (s: typeof shipments[number], amountBase: number) => {
    if (s.currency === s.baseCurrency) return amountBase;
    const rateUSD = Number(s.exchangeRateUSD) || 0;
    const rateEUR = Number(s.exchangeRateEUR) || 0;
    let inEgp = amountBase;
    if (s.baseCurrency === "USD") inEgp = amountBase * rateUSD;
    else if (s.baseCurrency === "EUR") inEgp = amountBase * rateEUR;
    if (s.currency === "EGP") return inEgp;
    if (s.currency === "USD") return rateUSD > 0 ? inEgp / rateUSD : 0;
    if (s.currency === "EUR") return rateEUR > 0 ? inEgp / rateEUR : 0;
    return amountBase;
  };
  const grandTotal = filteredWithCosts.reduce((sum, s) => sum + toUSD(s, totalCostBase(s)), 0);
  const totalInvoiceValue = filteredWithCosts.reduce((sum, s) => sum + toUSD(s, calcConvertedInvoiceValue(s)), 0);
  const weightedAvgCost = totalInvoiceValue > 0 ? (grandTotal / totalInvoiceValue) * 100 : 0;

  const hasFilters = search || supplierFilter !== "all" || currencyFilter !== "all" || costMin || costMax;

  const clearFilters = () => {
    setSearch("");
    setSupplierFilter("all");
    setCurrencyFilter("all");
    setCostMin("");
    setCostMax("");
  };

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-semibold tracking-tight">Cost Management</h1>

      {/* Filters */}
      <div className="bg-card rounded-lg border shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-muted-foreground mb-1 block">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ID or Supplier..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="min-w-[160px]">
            <label className="text-xs text-muted-foreground mb-1 block">Supplier</label>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[130px]">
            <label className="text-xs text-muted-foreground mb-1 block">Currency</label>
            <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {currencies.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[120px]">
            <label className="text-xs text-muted-foreground mb-1 block">Min Cost</label>
            <Input
              type="number"
              placeholder="0"
              value={costMin}
              onChange={(e) => setCostMin(e.target.value)}
            />
          </div>

          <div className="min-w-[120px]">
            <label className="text-xs text-muted-foreground mb-1 block">Max Cost</label>
            <Input
              type="number"
              placeholder="∞"
              value={costMax}
              onChange={(e) => setCostMax(e.target.value)}
            />
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="kpi-card">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Total Costs</span>
          </div>
          <p className="text-2xl font-bold">{fmt(grandTotal)} USD</p>
        </div>
        <div className="kpi-card">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <span className="text-xs text-muted-foreground">Weighted Avg Cost</span>
          </div>
          <p className="text-2xl font-bold">{weightedAvgCost.toFixed(2)}%</p>
          <p className="text-xs text-muted-foreground mt-1">Logistics / Invoice Value</p>
        </div>
        <div className="kpi-card">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-info" />
            <span className="text-xs text-muted-foreground">Shipments with Costs</span>
          </div>
          <p className="text-2xl font-bold">{filteredWithCosts.length}</p>
        </div>
        <div className="kpi-card">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Without Costs</span>
          </div>
          <p className="text-2xl font-bold">{filteredWithoutCosts.length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border shadow-sm">
        <div className="p-5 border-b flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">
            Shipments {hasFilters ? `(${filtered.length} of ${shipments.length})` : `(${shipments.length})`}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-3 px-4 font-medium">ACID Number</th>
                <th className="text-left py-3 px-4 font-medium">Supplier</th>
                <th className="text-right py-3 px-4 font-medium">Invoice Value</th>
                <th className="text-right py-3 px-4 font-medium">Total Cost</th>
                <th className="text-right py-3 px-4 font-medium">Cost Ratio</th>
                <th className="text-center py-3 px-4 font-medium">Items</th>
                <th className="py-3 px-4 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    No shipments match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const tc = totalCostBase(s);
                  const ratio = calcCostRatio(s);
                  return (
                    <tr
                      key={s.id}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => navigate(`/shipments/${s.id}/costs`)}
                    >
                      <td className="py-3 px-4 font-medium">{s.acidNumber || "—"}</td>
                      <td className="py-3 px-4">{s.supplierName}</td>
                      <td className="py-3 px-4 text-right">
                        {fmt(s.invoiceValue)} {s.currency}
                      </td>
                      <td className="py-3 px-4 text-right font-medium">
                        {s.costs.length > 0
                          ? `${fmt(toInvoiceCurrency(s, tc))} ${s.currency}`
                          : "—"}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {ratio != null ? (
                          <Badge variant={ratio > 10 ? "destructive" : "secondary"} className="text-xs">
                            {ratio.toFixed(1)}%
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">{s.costs.length}</td>
                      <td className="py-3 px-4">
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
