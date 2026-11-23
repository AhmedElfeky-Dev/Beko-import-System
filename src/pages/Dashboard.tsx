import { useShipments } from "@/context/ShipmentContext";
import { isDelayed, totalCostBase, calcClearanceLeadTime, calcRemainingDaysToDemurrage, calcLastFreeReleaseDate, calcStatus, calcConvertedInvoiceValue, convertToBase } from "@/types/shipment";
import { Package, Ship, AlertTriangle, DollarSign, Clock, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import ClearanceEfficiencyGauge from "@/components/ClearanceEfficiencyGauge";
import ShipmentTypesByMonth from "@/components/ShipmentTypesByMonth";
import ContainerVolumeByMonth from "@/components/ContainerVolumeByMonth";

const STATUS_COLORS: Record<string, string> = {
  "Not Shipped": "hsl(210, 15%, 70%)",
  "In Transit": "hsl(210, 70%, 50%)",
  "At Customs": "hsl(38, 92%, 50%)",
  Released: "hsl(142, 71%, 45%)",
};

export default function Dashboard() {
  const { shipments } = useShipments();

  const byStatus = shipments.reduce<Record<string, number>>((acc, s) => {
    const status = calcStatus(s);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const statusData = Object.entries(byStatus).map(([name, value]) => ({ name, value }));
  // Total turnover = sum of invoice values, each converted to USD
  const toUSD = (sh: typeof shipments[number], amountBase: number) => {
    const rateUSD = Number(sh.exchangeRateUSD) || 0;
    const rateEUR = Number(sh.exchangeRateEUR) || 0;
    if (sh.baseCurrency === "USD") return amountBase;
    let inEgp = amountBase;
    if (sh.baseCurrency === "EUR") inEgp = amountBase * rateEUR;
    return rateUSD > 0 ? inEgp / rateUSD : 0;
  };
  const totalTurnover = shipments.reduce((s, sh) => s + toUSD(sh, calcConvertedInvoiceValue(sh)), 0);

  const clearanceTimes = shipments
    .map(calcClearanceLeadTime)
    .filter((v): v is number => v !== null && v >= 0);
  const avgClearance = clearanceTimes.length
    ? Math.round(clearanceTimes.reduce((a, b) => a + b, 0) / clearanceTimes.length)
    : 0;

  const demurrageCases = shipments.filter((s) =>
    s.costs.some((c) => c.type === "Demurrage USD")
  ).length;

  const kpis = [
    { label: "Total Shipments", value: shipments.length, icon: Package, color: "text-primary" },
    { label: "In Transit", value: byStatus["In Transit"] || 0, icon: Ship, color: "text-info" },
    { label: "At Customs", value: byStatus["At Customs"] || 0, icon: AlertTriangle, color: "text-destructive" },
    { label: "Total Turnover", value: `$${(totalTurnover / 1000).toFixed(0)}K`, icon: DollarSign, color: "text-accent" },
    { label: "Avg. Clearance", value: `${avgClearance}d`, icon: Clock, color: "text-warning" },
    { label: "Demurrage Cases", value: demurrageCases, icon: TrendingUp, color: "text-destructive" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="kpi-card">
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
            </div>
            <p className="text-2xl font-bold">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border p-5 shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Shipments by Status</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={4}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}`}
              >
                {statusData.map((entry) => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || "#999"} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border p-5 shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Cost Breakdown ($)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={shipments
                .filter((s) => s.costs.length > 0)
                .slice(0, 6)
                .map((s) => ({ name: s.id, cost: toUSD(s, totalCostBase(s)) }))}
            >
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
              <Bar dataKey="cost" fill="hsl(210, 70%, 38%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <ClearanceEfficiencyGauge />
        <ShipmentTypesByMonth />
        <ContainerVolumeByMonth />
      </div>


      {(() => {
        const demurrageAlerts = shipments
          .filter((s) => s.shipmentType === "SEA" && calcStatus(s) !== "Released")
          .map((s) => ({ s, remaining: calcRemainingDaysToDemurrage(s), lastFree: calcLastFreeReleaseDate(s) }))
          .filter((x) => x.remaining != null && x.remaining <= 3)
          .sort((a, b) => (a.remaining ?? 0) - (b.remaining ?? 0));

        if (demurrageAlerts.length === 0) return null;

        return (
          <div className="bg-card rounded-lg border border-warning/30 p-5 shadow-sm">
            <h3 className="text-sm font-medium text-warning mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4" /> Demurrage Alerts
            </h3>
            <div className="space-y-2">
              {demurrageAlerts.map(({ s, remaining, lastFree }) => (
                <div key={s.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                  <div>
                    <span className="font-medium">{s.id}</span>
                    <span className="text-muted-foreground ml-2">{s.supplierName}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground text-xs">Last free: {lastFree}</span>
                    <span className={`font-semibold ${remaining != null && remaining <= 0 ? "text-destructive" : "text-warning"}`}>
                      {remaining != null && remaining <= 0 ? `⚠ ${Math.abs(remaining)}d overdue` : `${remaining}d remaining`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
