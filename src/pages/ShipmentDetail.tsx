import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useShipments } from "@/context/ShipmentContext";
import { useAuth } from "@/context/AuthContext";
import { apiGetShipment } from "@/lib/api";
import { Shipment, calcForm4LeadTime, calcClearanceLeadTime, calcTotalLeadTime, isDelayed, calcLastFreeReleaseDate, calcRemainingDaysToDemurrage, calcStatus, totalContainers, getContainerSummary } from "@/types/shipment";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, Trash2, Ship, Plane, FileText, Clock, CheckCircle2, Circle, Package } from "lucide-react";
import { toast } from "sonner";

const statusSteps = ["Not Shipped", "In Transit", "At Customs", "Released"] as const;

export default function ShipmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getShipment, deleteShipment, loading: shipmentsLoading } = useShipments();
  const { can } = useAuth();
  const canEdit = can("shipments", "edit");
  const fromContext = getShipment(id || "");
  const [fetched, setFetched] = useState<Shipment | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!id || fromContext) {
      setFetched(null);
      setFetching(false);
      setFetchError(false);
      return;
    }
    setFetching(true);
    setFetchError(false);
    apiGetShipment(id)
      .then((data) => {
        if (!cancelled) setFetched(data as Shipment);
      })
      .catch(() => {
        if (!cancelled) setFetchError(true);
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

  const handleDelete = () => {
    deleteShipment(s.id);
    toast.success("Shipment deleted");
    navigate("/shipments");
  };

  const computedStatus = calcStatus(s);
  const statusIdx = statusSteps.indexOf(computedStatus as any);
  const f4lt = calcForm4LeadTime(s);
  const clt = calcClearanceLeadTime(s);
  const tlt = calcTotalLeadTime(s);

  const Field = ({ label, value }: { label: string; value: string | number | null | undefined }) => (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium">{value ?? "—"}</p>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/shipments")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              {s.id}
              {s.shipmentType === "SEA" ? <Ship className="h-5 w-5 text-info" /> : <Plane className="h-5 w-5 text-accent" />}
            </h1>
            <p className="text-sm text-muted-foreground">{s.supplierName} · {s.poNumber}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate(`/shipments/${s.id}/edit`)}>
                <Edit className="h-4 w-4 mr-1" /> Edit
              </Button>
              <Button variant="outline" size="sm" className="text-destructive" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Status Timeline */}
      <div className="bg-card rounded-lg border p-5 shadow-sm">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">Tracking Status</h3>
        {isDelayed(s) && (
          <div className="mb-3 text-sm text-destructive font-medium">⚠ This shipment is delayed</div>
        )}
        <div className="flex items-center justify-between relative">
          <div className="absolute top-3 left-0 right-0 h-0.5 bg-border" />
          {statusSteps.map((step, i) => (
            <div key={step} className="relative flex flex-col items-center z-10">
              {i <= statusIdx ? (
                <CheckCircle2 className="h-6 w-6 text-accent bg-card" />
              ) : (
                <Circle className="h-6 w-6 text-muted-foreground bg-card" />
              )}
              <span className={`text-xs mt-1 ${i <= statusIdx ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                {step}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Shipment Details */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <FileText className="h-4 w-4" /> Shipment Information
          </h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Field label="Factory" value={s.factory} />
            <Field label="Country of Origin" value={s.countryOfOrigin} />
            <Field label="ACID Number" value={s.acidNumber} />
            <Field label="Master B/L" value={s.masterBL} />
            <Field label="House B/L" value={s.houseBL} />
            <Field label="D/O Date" value={s.doDate} />
            <Field label="Invoice #" value={s.invoiceNumber} />
            <Field label="Invoice Value" value={`${s.invoiceValue.toLocaleString()} ${s.currency}`} />
            <Field label="Payment Term" value={s.paymentTerm} />
            <Field label="Incoterm" value={s.incoterm} />
            <Field label="Bank" value={s.bankName} />
            <Field label="Broker" value={s.broker} />
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card rounded-lg border p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Ship className="h-4 w-4" /> Logistics
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Carrier" value={s.carrier} />
              <Field label="Shipping Line" value={s.shippingLine} />
              <Field label="POL" value={s.pol} />
              <Field label="POD" value={s.pod} />
              {s.shipmentType === "SEA" && <Field label="Sea Mode" value={s.seaMode || "FCL"} />}
              {(s.shipmentType === "AIR" || (s.shipmentType === "SEA" && s.seaMode === "LCL")) && (
                <>
                  <Field label="Weight (kg)" value={s.weightKg ? s.weightKg.toLocaleString() : "—"} />
                  <Field label="CBM" value={s.cbm ? s.cbm.toLocaleString() : "—"} />
                </>
              )}
              {s.shipmentType === "SEA" && s.seaMode !== "LCL" && (
                <Field label="Total Containers" value={totalContainers(s) > 0 ? totalContainers(s) : "—"} />
              )}
              <Field label="ETD" value={s.etd} />
              <Field label="ETA Port" value={s.etaPort} />
              <Field label="ETA Factory" value={s.etaFactory} />
              <Field label="Pre-Alert Date" value={s.preAlertDate} />
              <Field label="Original Docs" value={s.originalDocsDate} />
              <Field label="CargoX Date" value={s.cargoxDate} />
              <Field label="Form4 Received" value={s.form4ReceivingDate} />
              <Field label="Customs Cert #" value={s.customsCertNumber} />
              <Field label="Customs Cert Date" value={s.customsCertDate} />
            </div>
          </div>

          {/* Containers */}
          {s.shipmentType === "SEA" && (s.seaMode || "FCL") === "FCL" && s.containers && s.containers.length > 0 && (
            <div className="bg-card rounded-lg border p-5 shadow-sm">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-3">
                <Package className="h-4 w-4" /> Containers
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">
                  Total: {totalContainers(s)}
                </span>
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-muted-foreground font-medium">Container Type</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {s.containers.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2">{c.containerType === "Other" ? (c.customType || "Other") : c.containerType}</td>
                      <td className="py-2 text-right font-medium">{c.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Container Summary */}
              {(() => {
                const summary = getContainerSummary(s);
                if (summary.length === 0) return null;
                return (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">Container Summary</h4>
                    <div className="flex flex-wrap gap-2">
                      {summary.map((entry) => (
                        <div key={entry.type} className="bg-muted/50 rounded-md px-3 py-1.5 text-sm">
                          <span className="font-medium">{entry.type}</span>
                          <span className="text-muted-foreground ml-1">× {entry.quantity}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Total Containers: <span className="font-semibold text-foreground">{totalContainers(s)}</span>
                    </p>
                  </div>
                );
              })()}
            </div>
          )}

          <div className="bg-card rounded-lg border p-5 shadow-sm">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4" /> Lead Times
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold">{f4lt !== null ? `${f4lt}d` : "—"}</p>
                <p className="text-xs text-muted-foreground">Form4 Lead Time</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{clt !== null ? `${clt}d` : "—"}</p>
                <p className="text-xs text-muted-foreground">Clearance Lead Time</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{tlt !== null ? `${tlt}d` : "—"}</p>
                <p className="text-xs text-muted-foreground">Total Lead Time</p>
              </div>
            </div>
            {s.shipmentType === "SEA" && (
              <>
                <div className="border-t pt-4 mt-4">
                  <h4 className="text-xs text-muted-foreground mb-3">Demurrage Control</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{s.freeDays ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">Free Days</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{calcLastFreeReleaseDate(s) || "—"}</p>
                      <p className="text-xs text-muted-foreground">Last Free Release</p>
                    </div>
                    {(() => {
                      const rem = calcRemainingDaysToDemurrage(s);
                      const colorClass = rem != null ? (rem <= 0 ? "text-destructive" : rem <= 3 ? "text-warning" : "text-success") : "";
                      return (
                        <div className="text-center">
                          <p className={`text-2xl font-bold ${colorClass}`}>{rem != null ? `${rem}d` : "—"}</p>
                          <p className="text-xs text-muted-foreground">Days to Demurrage</p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>


      {/* Documents */}
      <div className="bg-card rounded-lg border p-5 shadow-sm">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-3">
          <FileText className="h-4 w-4" /> Documents
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {s.documents.map((d) => (
            <div
              key={d.type}
              className={`rounded-lg border p-3 text-center text-sm ${
                d.status === "Received" ? "border-accent/50 bg-accent/5" : "border-border"
              }`}
            >
              <p className="font-medium text-xs">{d.type}</p>
              <Badge
                variant={d.status === "Received" ? "default" : "secondary"}
                className={`mt-1 text-xs ${d.status === "Received" ? "bg-accent text-accent-foreground" : ""}`}
              >
                {d.status}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
