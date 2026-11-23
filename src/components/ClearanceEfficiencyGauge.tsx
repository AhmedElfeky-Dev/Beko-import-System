import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useShipments } from "@/context/ShipmentContext";
import { calcStatus, calcClearanceLeadTime } from "@/types/shipment";
import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Gauge } from "lucide-react";
import { Input } from "@/components/ui/input";

type RangeKey = "7" | "30" | "90" | "custom";

export default function ClearanceEfficiencyGauge() {
  const { shipments } = useShipments();
  const navigate = useNavigate();
  const [range, setRange] = useState<RangeKey>("30");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const { pct, count, withinTargetPct, belowPct, abovePct, minDays, maxDays } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let from: Date | null = null;
    let to: Date | null = null;
    if (range === "custom") {
      if (customFrom) from = new Date(customFrom);
      if (customTo) to = new Date(customTo);
    } else {
      const days = Number(range);
      from = new Date(today);
      from.setDate(from.getDate() - days);
      to = today;
    }

    const filtered = shipments.filter((s) => {
      if (calcStatus(s) !== "Released") return false;
      if (!s.ataFactory) return false;
      const lead = calcClearanceLeadTime(s);
      if (lead == null || lead < 0) return false;

      const ata = new Date(s.ataFactory);
      if (from && ata < from) return false;
      if (to) {
        const toEnd = new Date(to);
        toEnd.setHours(23, 59, 59, 999);
        if (ata > toEnd) return false;
      }
      return true;
    });

    const leads = filtered
      .map((s) => calcClearanceLeadTime(s))
      .filter((v): v is number => v != null && v >= 0);

    const total = leads.length;
    if (total === 0) {
      return { pct: 0, count: 0, withinTargetPct: 0, belowPct: 0, abovePct: 0, minDays: null as number | null, maxDays: null as number | null };
    }

    const within = leads.filter((d) => d >= 7 && d <= 10).length;
    const below = leads.filter((d) => d < 7).length;
    const above = leads.filter((d) => d > 10).length;
    const efficientCount = leads.filter((d) => d <= 10).length;
    return {
      pct: Math.round((efficientCount / total) * 100),
      count: total,
      withinTargetPct: Math.round((within / total) * 100),
      belowPct: Math.round((below / total) * 100),
      abovePct: Math.round((above / total) * 100),
      minDays: Math.min(...leads),
      maxDays: Math.max(...leads),
    };
  }, [shipments, range, customFrom, customTo]);

  const color =
    pct >= 80 ? "hsl(142, 71%, 45%)" : pct >= 60 ? "hsl(38, 92%, 50%)" : "hsl(0, 72%, 51%)";
  const label = pct >= 80 ? "Excellent" : pct >= 60 ? "متوسط" : "Poor";

  const data = [{ name: "eff", value: pct, fill: color }];

  const handleClick = () => {
    navigate("/shipments?status=Released");
  };

  return (
    <div className="bg-card rounded-lg border p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">Clearance Lead Time Efficiency (%)</h3>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
          {range === "custom" && (
            <>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 w-[140px]" />
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 w-[140px]" />
            </>
          )}
        </div>
      </div>

      {count === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
          No released shipments in the selected period
        </div>
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div onClick={handleClick} className="cursor-pointer relative">
                <ResponsiveContainer width="100%" height={220}>
                  <RadialBarChart
                    innerRadius="70%"
                    outerRadius="100%"
                    data={data}
                    startAngle={180}
                    endAngle={0}
                  >
                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                    <RadialBar background dataKey="value" cornerRadius={8} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-end pb-6 pointer-events-none">
                  <p className="text-3xl font-bold" style={{ color }}>{pct}%</p>
                  <p className="text-xs font-medium" style={{ color }}>{label}</p>
                  <p className="text-xs text-muted-foreground mt-1">Based on {count} shipment{count === 1 ? "" : "s"}</p>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs space-y-1">
                <div>Within target (7–10d): <strong>{withinTargetPct}%</strong></div>
                <div>Below 7 days: <strong>{belowPct}%</strong></div>
                <div>Above 10 days: <strong>{abovePct}%</strong></div>
                <div>Min: <strong>{minDays}d</strong> · Max: <strong>{maxDays}d</strong></div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
