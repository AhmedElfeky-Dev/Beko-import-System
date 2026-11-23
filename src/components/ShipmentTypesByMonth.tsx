import { useMemo, useState } from "react";
import { useShipments } from "@/context/ShipmentContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Ship, Plane } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function ShipmentTypesByMonth() {
  const { shipments } = useShipments();
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  const { seaFcl, seaLcl, air, total } = useMemo(() => {
    let filtered = shipments;

    if (selectedMonth !== "all") {
      filtered = shipments.filter(s => {
        if (!s.ataFactory) return false;
        const date = new Date(s.ataFactory);
        return date.getMonth().toString() === selectedMonth;
      });
    }

    let seaFclCount = 0;
    let seaLclCount = 0;
    let airCount = 0;

    for (const s of filtered) {
      if (s.shipmentType === "AIR") {
        airCount++;
      } else if (s.shipmentType === "SEA") {
        if (s.seaMode === "LCL") {
          seaLclCount++;
        } else {
          // Default to FCL if seaMode is missing or explicitly FCL
          seaFclCount++;
        }
      }
    }

    return {
      seaFcl: seaFclCount,
      seaLcl: seaLclCount,
      air: airCount,
      total: seaFclCount + seaLclCount + airCount
    };
  }, [shipments, selectedMonth]);

  const fclPercent = total > 0 ? (seaFcl / total) * 100 : 0;
  const lclPercent = total > 0 ? (seaLcl / total) * 100 : 0;
  const airPercent = total > 0 ? (air / total) * 100 : 0;

  return (
    <div className="bg-card rounded-lg border p-5 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-sm font-medium text-muted-foreground">Shipment Types Count</h3>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="Select Month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Total for the year</SelectItem>
            {MONTHS.map((m, i) => (
              <SelectItem key={m} value={i.toString()}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 font-medium">
              <span>🚢</span> Sea FCL
            </div>
            <div className="text-muted-foreground">{seaFcl} Shipments</div>
          </div>
          <Progress value={fclPercent} className="h-2" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 font-medium">
              <span>🚢</span> Sea LCL
            </div>
            <div className="text-muted-foreground">{seaLcl} Shipments</div>
          </div>
          <Progress value={lclPercent} className="h-2" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 font-medium">
              <span>✈️</span> AIR
            </div>
            <div className="text-muted-foreground">{air} Shipments</div>
          </div>
          <Progress value={airPercent} className="h-2" />
        </div>
      </div>
    </div>
  );
}
