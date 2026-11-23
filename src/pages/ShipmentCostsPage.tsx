import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useShipments } from "@/context/ShipmentContext";
import { apiGetShipment } from "@/lib/api";
import { Shipment } from "@/types/shipment";
import ShipmentCostsTab from "@/components/ShipmentCostsTab";
import { Button } from "@/components/ui/button";

export default function ShipmentCostsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getShipment, loading: shipmentsLoading } = useShipments();
  const fromContext = getShipment(id || "");
  const [fetched, setFetched] = useState<Shipment | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!id || fromContext) {
      setFetched(null);
      setFetching(false);
      return;
    }
    setFetching(true);
    apiGetShipment(id)
      .then((data) => {
        if (!cancelled) setFetched(data as Shipment);
      })
      .catch(() => {
        if (!cancelled) setFetched(null);
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, fromContext?.id]);

  const s = fromContext ?? fetched;

  if (!s) {
    if (shipmentsLoading || fetching) {
      return <div className="text-center py-20 text-muted-foreground">Loading shipment...</div>;
    }
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p>Shipment not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/shipments")}>
          Back to Shipments
        </Button>
      </div>
    );
  }

  return <ShipmentCostsTab shipment={s} />;
}
