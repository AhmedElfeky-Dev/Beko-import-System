import { useMemo, useState } from "react";
import { useShipments } from "@/context/ShipmentContext";
import { totalCostBase, recalcCostConversions, convertToBase, calcConvertedInvoiceValue, type Currency, type BaseCurrency } from "@/types/shipment";
import { TrendingUp, TrendingDown, AlertTriangle, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, BarChart, Bar, Legend, CartesianGrid, Area, AreaChart,
} from "recharts";

type Period = "month" | "quarter" | "year" | "custom";

const COLORS = [
  "hsl(220 40% 15%)",   // dark navy - Freight
  "hsl(220 25% 30%)",   // THC
  "hsl(220 15% 50%)",   // Customs
  "hsl(220 15% 65%)",   // Duties
  "hsl(220 15% 80%)",   // Inland
  "hsl(0 75% 55%)",     // Storage
  "hsl(28 90% 55%)",    // Demurrage
];

// Map cost types to dashboard categories
const CATEGORY_MAP: Record<string, string> = {
  "Freight": "Freight",
  "THC USD": "THC",
  "THC EGP": "THC",
  "Customs Clearance": "Customs",
  "Nafeza Fees": "Customs",
  "ACID Fees": "Customs",
  "Approvals": "Customs",
  "Import Duty": "Duties",
  "Transportation": "Inland Transport",
  "Storage USD": "Storage",
  "Storage EGP": "Storage",
  "Demurrage USD": "Demurrage",
  "F4 Commission": "Customs",
  "Additional Cost": "Customs",
};

const CATEGORIES = ["Freight", "THC", "Customs", "Duties", "Inland Transport", "Storage", "Demurrage"];

function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function fmtMoney(n: number) {
  return Math.round(n).toLocaleString();
}

export default function CostDashboard() {
  const { shipments } = useShipments();
  const [currency, setCurrency] = useState<BaseCurrency>("EGP");
  const [period, setPeriod] = useState<Period>("year");
  const [supplier, setSupplier] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Anchor periods to the most recent shipment date so demo/historical data still
  // shows up for Month/Quarter/Year filters.
  const anchorDate = useMemo(() => {
    if (!shipments.length) return new Date();
    const max = shipments.reduce((acc, s) => {
      const t = new Date(s.createdAt).getTime();
      return t > acc ? t : acc;
    }, 0);
    return max ? new Date(max) : new Date();
  }, [shipments]);

  const supplierOptions = useMemo(() => {
    const set = new Set<string>();
    shipments.forEach((s) => s.supplierName && set.add(s.supplierName));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [shipments]);

  // Convert any shipment cost into the selected display currency.
  const toDisplay = (amountBase: number, s: any): number => {
    if (s.baseCurrency === currency) return amountBase;
    if (s.baseCurrency === "EGP" && currency === "USD") return amountBase / (s.exchangeRateUSD || 1);
    if (s.baseCurrency === "USD" && currency === "EGP") return amountBase * (s.exchangeRateUSD || 1);
    if (s.baseCurrency === "EGP" && currency === "EUR") return amountBase / (s.exchangeRateEUR || 1);
    if (s.baseCurrency === "EUR" && currency === "EGP") return amountBase * (s.exchangeRateEUR || 1);
    if (s.baseCurrency === "USD" && currency === "EUR") return (amountBase * (s.exchangeRateUSD || 1)) / (s.exchangeRateEUR || 1);
    if (s.baseCurrency === "EUR" && currency === "USD") return (amountBase * (s.exchangeRateEUR || 1)) / (s.exchangeRateUSD || 1);
    return amountBase;
  };

  // Period filter — anchored to most recent shipment date
  const inPeriod = (s: any) => {
    const d = new Date(s.createdAt);
    if (period === "custom") {
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
      return true;
    }
    const ref = anchorDate;
    if (period === "month") return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
    if (period === "quarter") {
      const q = Math.floor(ref.getMonth() / 3);
      const dq = Math.floor(d.getMonth() / 3);
      return d.getFullYear() === ref.getFullYear() && q === dq;
    }
    if (period === "year") return d.getFullYear() === ref.getFullYear();
    return true;
  };

  const filtered = useMemo(
    () => shipments.filter((s) => (supplier === "all" || s.supplierName === supplier) && inPeriod(s)),
    [shipments, period, supplier, dateFrom, dateTo, anchorDate]
  );

  // KPIs
  const { totalCost, avgCost, totalDemurrage, demurrageCases, totalFreight, prevTotal } = useMemo(() => {
    let total = 0;
    let demurrage = 0;
    let demCases = 0;
    let freight = 0;
    for (const s of filtered) {
      const recCosts = recalcCostConversions(s);
      let shipDem = 0;
      for (const c of recCosts) {
        const baseAmt = c.convertedAmount ?? 0;
        const disp = toDisplay(baseAmt, s);
        total += disp;
        const cat = CATEGORY_MAP[c.type] ?? "Customs";
        if (cat === "Demurrage") { demurrage += disp; shipDem += disp; }
        if (cat === "Freight") freight += disp;
      }
      if (shipDem > 0) demCases++;
    }
    // Prev period (last year same period) — simple: compare with shipments of prev year
    let prev = 0;
    const prevYear = anchorDate.getFullYear() - 1;
    for (const s of shipments) {
      if (new Date(s.createdAt).getFullYear() !== prevYear) continue;
      for (const c of recalcCostConversions(s)) {
        prev += toDisplay(c.convertedAmount ?? 0, s);
      }
    }
    return {
      totalCost: total,
      avgCost: filtered.length ? total / filtered.length : 0,
      totalDemurrage: demurrage,
      demurrageCases: demCases,
      totalFreight: freight,
      prevTotal: prev,
    };
  }, [filtered, shipments, currency]);

  const trendPct = prevTotal > 0 ? ((totalCost - prevTotal) / prevTotal) * 100 : 0;

  // Cost breakdown by category
  const breakdown = useMemo(() => {
    const map = new Map<string, number>();
    CATEGORIES.forEach((c) => map.set(c, 0));
    for (const s of filtered) {
      for (const c of recalcCostConversions(s)) {
        const cat = CATEGORY_MAP[c.type] ?? "Customs";
        map.set(cat, (map.get(cat) || 0) + toDisplay(c.convertedAmount ?? 0, s));
      }
    }
    const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
    return CATEGORIES.map((cat, i) => ({
      name: cat,
      value: map.get(cat) || 0,
      pct: total > 0 ? ((map.get(cat) || 0) / total) * 100 : 0,
      color: COLORS[i],
    }));
  }, [filtered, currency]);

  const breakdownTotal = breakdown.reduce((s, b) => s + b.value, 0);

  // Monthly cost trend (last 12 months)
  const monthlyTrend = useMemo(() => {
    const now = anchorDate;
    const months: { key: string; label: string; value: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleString("en", { month: "short" }),
        value: 0,
      });
    }
    const idx = new Map(months.map((m, i) => [m.key, i]));
    for (const s of shipments) {
      const d = new Date(s.createdAt);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      if (!idx.has(k)) continue;
      let total = 0;
      for (const c of recalcCostConversions(s)) total += toDisplay(c.convertedAmount ?? 0, s);
      months[idx.get(k)!].value += total;
    }
    return months;
  }, [shipments, currency]);

  // Cost by Factory
  const byFactory = useMemo(() => {
    const map = new Map<string, { factory: string; freight: number; other: number }>();
    for (const s of filtered) {
      const f = s.factory;
      if (!map.has(f)) map.set(f, { factory: f, freight: 0, other: 0 });
      const row = map.get(f)!;
      for (const c of recalcCostConversions(s)) {
        const disp = toDisplay(c.convertedAmount ?? 0, s);
        const cat = CATEGORY_MAP[c.type] ?? "Customs";
        if (cat === "Freight") row.freight += disp;
        else row.other += disp;
      }
    }
    return Array.from(map.values());
  }, [filtered, currency]);

  // Cost per Container type
  const byContainer = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of filtered) {
      const ctSet = (s.containers || []).map((c: any) =>
        c.containerType === "Other" ? c.customType || "Other" : c.containerType
      );
      if (ctSet.length === 0) continue;
      let total = 0;
      for (const c of recalcCostConversions(s)) total += toDisplay(c.convertedAmount ?? 0, s);
      const totalQty = (s.containers || []).reduce((a: number, c: any) => a + c.quantity, 0) || 1;
      for (const c of s.containers || []) {
        const key = c.containerType === "Other" ? c.customType || "Other" : c.containerType;
        map.set(key, (map.get(key) || 0) + (total * c.quantity) / totalQty);
      }
    }
    const allTypes = ["20ST", "20HC", "40ST", "40HC", "45HC"];
    const merged = new Map<string, number>();
    allTypes.forEach((t) => merged.set(t, 0));
    map.forEach((v, k) => {
      // Map 20GP->20ST, 40GP->40ST style
      const norm = k.replace("GP", "ST");
      merged.set(norm, (merged.get(norm) || 0) + v);
    });
    const max = Math.max(...Array.from(merged.values()), 1);
    return Array.from(merged.entries()).map(([type, value]) => ({ type, value, pct: (value / max) * 100 }));
  }, [filtered, currency]);

  // Demurrage cases trend
  const demurrageMonthly = useMemo(() => {
    const now = anchorDate;
    const months: { label: string; value: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: d.toLocaleString("en", { month: "short" }), value: 0 });
    }
    const idxMap = new Map<string, number>();
    months.forEach((m, i) => idxMap.set(m.label + i, i));
    for (const s of shipments) {
      const d = new Date(s.createdAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const refIdx = months.findIndex((_, i) => {
        const dd = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
        return `${dd.getFullYear()}-${dd.getMonth()}` === key;
      });
      if (refIdx < 0) continue;
      for (const c of recalcCostConversions(s)) {
        const cat = CATEGORY_MAP[c.type] ?? "Customs";
        if (cat === "Demurrage") months[refIdx].value += toDisplay(c.convertedAmount ?? 0, s);
      }
    }
    return months;
  }, [shipments, currency]);

  const avgDemurrage = demurrageCases > 0 ? totalDemurrage / demurrageCases : 0;

  const Pill = ({ active, children, onClick }: any) => (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs rounded-md transition ${
        active ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cost Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Financial analytics · all values converted to {currency}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="inline-flex bg-muted rounded-lg p-1">
            {(["EGP", "USD"] as BaseCurrency[]).map((c) => (
              <Pill key={c} active={currency === c} onClick={() => setCurrency(c)}>{c}</Pill>
            ))}
          </div>
          <div className="inline-flex bg-muted rounded-lg p-1">
            {(["month", "quarter", "year", "custom"] as Period[]).map((p) => (
              <Pill key={p} active={period === p} onClick={() => setPeriod(p)}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Pill>
            ))}
          </div>
        </div>
      </div>

      {/* Supplier + Date Range filters */}
      <div className="bg-card rounded-lg border p-4 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5 min-w-[220px]">
          <Label className="text-xs text-muted-foreground">Supplier</Label>
          <Select value={supplier} onValueChange={setSupplier}>
            <SelectTrigger><SelectValue placeholder="All suppliers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All suppliers</SelectItem>
              {supplierOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); if (e.target.value) setPeriod("custom"); }}
            className="w-[160px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); if (e.target.value) setPeriod("custom"); }}
            className="w-[160px]"
          />
        </div>
        {(supplier !== "all" || dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSupplier("all"); setDateFrom(""); setDateTo(""); }}
          >
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
        <div className="ml-auto text-xs text-muted-foreground">
          {filtered.length} shipment{filtered.length === 1 ? "" : "s"} match
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-lg border p-5">
          <p className="text-xs text-muted-foreground">Total Cost ({currency})</p>
          <p className="text-3xl font-bold mt-2">{fmtK(totalCost)}</p>
          {prevTotal > 0 && (
            <div className={`flex items-center gap-1 mt-2 text-xs ${trendPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {trendPct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              <span>{trendPct >= 0 ? "+" : ""}{trendPct.toFixed(1)}% vs prev</span>
            </div>
          )}
        </div>
        <div className="bg-card rounded-lg border p-5">
          <p className="text-xs text-muted-foreground">Avg Cost / Shipment</p>
          <p className="text-3xl font-bold mt-2">{currency} {fmtK(avgCost)}</p>
        </div>
        <div className="bg-card rounded-lg border p-5">
          <p className="text-xs text-muted-foreground">Total Demurrage</p>
          <p className="text-3xl font-bold mt-2 text-red-600">{currency} {fmtK(totalDemurrage)}</p>
          <p className="text-xs text-muted-foreground mt-2">{demurrageCases} cases</p>
        </div>
        <div className="bg-card rounded-lg border p-5">
          <p className="text-xs text-muted-foreground">Total Freight</p>
          <p className="text-3xl font-bold mt-2">{currency} {fmtK(totalFreight)}</p>
          <p className="text-xs text-muted-foreground mt-2">
            {totalCost > 0 ? Math.round((totalFreight / totalCost) * 100) : 0}% of total
          </p>
        </div>
      </div>

      {/* Breakdown + Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border p-5">
          <h3 className="font-semibold mb-4">Cost Breakdown by Type</h3>
          <div className="flex items-center gap-6">
            <div className="relative w-[200px] h-[200px] flex-shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={breakdown} dataKey="value" innerRadius={60} outerRadius={90} paddingAngle={1}>
                    {breakdown.map((b, i) => <Cell key={i} fill={b.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-xl font-bold">{fmtMoney(breakdownTotal)}</p>
                <p className="text-xs text-muted-foreground">total</p>
              </div>
            </div>
            <div className="flex-1 space-y-2 text-sm">
              {breakdown.map((b) => (
                <div key={b.name} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm" style={{ background: b.color }} />
                  <span className="flex-1">{b.name}</span>
                  <span className="font-medium">{fmtMoney(b.value)}</span>
                  <span className="text-muted-foreground text-xs w-10 text-right">{b.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg border p-5">
          <h3 className="font-semibold mb-4">Monthly Cost Trend (last 12 months)</h3>
          <div className="h-[240px]">
            <ResponsiveContainer>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Line type="monotone" dataKey="value" stroke="hsl(220 40% 15%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Factory + Container */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border p-5">
          <h3 className="font-semibold mb-4">Cost by Factory</h3>
          <div className="h-[240px]">
            <ResponsiveContainer>
              <BarChart data={byFactory}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="factory" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="freight" stackId="a" fill="hsl(220 40% 15%)" name="Freight" />
                <Bar dataKey="other" stackId="a" fill="hsl(28 90% 55%)" name="Other" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card rounded-lg border p-5">
          <h3 className="font-semibold mb-4">Cost per Container</h3>
          <div className="space-y-3">
            {byContainer.map((c) => (
              <div key={c.type} className="flex items-center gap-3">
                <span className="text-sm w-12 text-muted-foreground">{c.type}</span>
                <div className="flex-1 h-6 bg-muted rounded relative overflow-hidden">
                  <div
                    className="h-full bg-foreground/90 rounded transition-all"
                    style={{ width: `${c.pct}%` }}
                  />
                </div>
                <span className="text-sm font-medium w-24 text-right">{currency} {fmtK(c.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Demurrage Cases */}
      <div className="bg-card rounded-lg border p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <h3 className="font-semibold">Demurrage Cases</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-6 border-b">
          <div>
            <p className="text-3xl font-bold">{demurrageCases}</p>
            <p className="text-xs text-muted-foreground mt-1">Total cases</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-red-600">{currency} {fmtK(totalDemurrage)}</p>
            <p className="text-xs text-muted-foreground mt-1">Total paid</p>
          </div>
          <div>
            <p className="text-3xl font-bold">{currency} {fmtK(avgDemurrage)}</p>
            <p className="text-xs text-muted-foreground mt-1">Avg per case</p>
          </div>
        </div>
        <div className="h-[200px] mt-4">
          <ResponsiveContainer>
            <AreaChart data={demurrageMonthly}>
              <defs>
                <linearGradient id="demGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(0 75% 55%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(0 75% 55%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip formatter={(v: number) => fmtMoney(v)} />
              <Area type="monotone" dataKey="value" stroke="hsl(0 75% 55%)" strokeWidth={2} fill="url(#demGrad)" dot={{ r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
