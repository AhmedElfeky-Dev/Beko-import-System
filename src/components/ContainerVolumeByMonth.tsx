import { useMemo, useState } from "react";
import { useShipments } from "@/context/ShipmentContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function ContainerVolumeByMonth() {
  const { shipments } = useShipments();
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  const { total20ft, total40ft, grandTotal } = useMemo(() => {
    let filtered = shipments;

    if (selectedMonth !== "all") {
      filtered = shipments.filter((s) => {
        if (!s.ataFactory) return false;
        const date = new Date(s.ataFactory);
        return date.getMonth().toString() === selectedMonth;
      });
    }

    let count20ft = 0;
    let count40ft = 0;

    for (const s of filtered) {
      if (s.shipmentType === "SEA" && s.containers && Array.isArray(s.containers)) {
        for (const c of s.containers) {
          const type = c.containerType || "";
          const qty = c.quantity || 0;
          if (type.startsWith("20")) {
            count20ft += qty;
          } else if (type.startsWith("40") || type.startsWith("45")) {
            count40ft += qty;
          } else if (type === "Other" && c.customType) {
            // Best effort guess if custom type starts with 20 or 40
            if (c.customType.startsWith("20")) count20ft += qty;
            else if (c.customType.startsWith("40") || c.customType.startsWith("45")) count40ft += qty;
          }
        }
      }
    }

    return {
      total20ft: count20ft,
      total40ft: count40ft,
      grandTotal: count20ft + count40ft,
    };
  }, [shipments, selectedMonth]);

  return (
    <div className="bg-card rounded-lg border p-5 shadow-sm space-y-6 flex flex-col justify-between">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Package className="h-4 w-4" /> Container Volume
        </h3>
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

      <div className="text-center">
        <p className="text-4xl font-bold tracking-tight text-primary">
          {grandTotal}
        </p>
        <p className="text-xs font-medium text-muted-foreground mt-1 uppercase tracking-wider">
          Grand Total Containers
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t pt-4">
        <div className="text-center">
          <p className="text-2xl font-semibold">{total20ft}</p>
          <p className="text-xs text-muted-foreground mt-1">20ft Containers</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-semibold">{total40ft}</p>
          <p className="text-xs text-muted-foreground mt-1">40ft/45ft Containers</p>
        </div>
      </div>
    </div>
  );
}
