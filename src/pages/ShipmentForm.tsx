import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useShipments } from "@/context/ShipmentContext";
import { apiGetShipment } from "@/lib/api";
import {
  Shipment, ShipmentType, SeaMode, Factory, Currency, PaymentTerm,
  ContainerType, ContainerEntry, CONTAINER_TYPES,
  DOCUMENT_TYPES, ShipmentDocument, calcStatus, totalContainers, getContainerSummary, getNextShipmentId
} from "@/types/shipment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableCombobox } from "@/components/SearchableCombobox";
import { MasterCategory } from "@/hooks/useMasterData";
import { ArrowLeft, Plus, Trash2, Save, Package, Loader2 } from "lucide-react";
import { toast } from "sonner";
import CostItemsEditor from "@/components/CostItemsEditor";

const createEmptyShipment = (id = ""): Shipment => ({
  id,
  shipmentType: "SEA",
  poNumber: "",
  supplierName: "",
  countryOfOrigin: "",
  factory: "Ref",
  acidNumber: "",
  masterBL: "",
  houseBL: "",
  customsCertNumber: "",
  invoiceNumber: "",
  invoiceValue: 0,
  currency: "USD",
  paymentTerm: "Open Account",
  incoterm: "",
  bankName: "",
  status: "Not Shipped",
  containers: [],
  carrier: "",
  shippingLine: "",
  pol: "",
  pod: "",
  broker: "",
  costs: [],
  documents: DOCUMENT_TYPES.map((t) => ({ type: t, status: "Pending" })),
  createdAt: new Date().toISOString().split("T")[0],
  exchangeRateUSD: 50.5,
  exchangeRateEUR: 55.0,
  baseCurrency: "EGP",
  f4CommissionRate: 1.2,
  seaMode: "FCL",
  weightKg: 0,
  cbm: 0,
  owner: "",
});

export default function ShipmentForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { shipments, getShipment, addShipment, updateShipment, loading: shipmentsLoading } = useShipments();
  const isEdit = !!id;

  const [form, setForm] = useState<Shipment>(() => createEmptyShipment(""));
  const [loadingShipment, setLoadingShipment] = useState(isEdit);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const migrate = (existing: Shipment): Shipment => {
      const migrated = { ...existing };
      if (migrated.shippingLine == null) migrated.shippingLine = "";
      if (!migrated.containers) {
        migrated.containers = [];
        if (migrated.numberOfContainers && migrated.numberOfContainers > 0 && migrated.containerType) {
          migrated.containers = [{
            id: crypto.randomUUID().slice(0, 8),
            containerType: migrated.containerType,
            quantity: migrated.numberOfContainers,
          }];
        }
      }
      if (migrated.shipmentType === "SEA" && !migrated.seaMode) migrated.seaMode = "FCL";
      if (migrated.weightKg == null) migrated.weightKg = 0;
      if (migrated.cbm == null) migrated.cbm = 0;
      return migrated;
    };

    if (!isEdit || !id) {
      setForm(createEmptyShipment(""));
      setLoadingShipment(false);
      setNotFound(false);
      return;
    }

    const existing = getShipment(id);
    if (existing) {
      setForm(migrate(existing));
      setLoadingShipment(false);
      setNotFound(false);
      return;
    }

    setLoadingShipment(true);
    setNotFound(false);
    apiGetShipment(id)
      .then((data) => {
        if (cancelled) return;
        setForm(migrate(data as Shipment));
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingShipment(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, isEdit, getShipment]);

  useEffect(() => {
    if (isEdit || shipmentsLoading) return;
    setForm((prev) => {
      const year = String(new Date().getFullYear());
      if (prev.id && prev.id.startsWith(year) && /^\d+$/.test(prev.id.slice(year.length))) return prev;
      return { ...prev, id: getNextShipmentId(shipments) };
    });
  }, [isEdit, shipmentsLoading, shipments]);

  const validateDateSequence = (field: string, value: string, current: Shipment): string | null => {
    if (!value) return null;
    const d = new Date(value);
    const etd = current.etd ? new Date(current.etd) : null;
    const etaPort = current.etaPort ? new Date(current.etaPort) : null;
    const etaFactory = current.etaFactory ? new Date(current.etaFactory) : null;
    const ataFactory = current.ataFactory ? new Date(current.ataFactory) : null;

    if (field === "etd") {
      if (etaPort && d > etaPort) return "ETD cannot be after ETA Port";
    } else if (field === "etaPort") {
      if (etd && d < etd) return "ETA Port cannot be before ETD";
      if (etaFactory && d > etaFactory) return "ETA Port cannot be after ETA Factory";
    } else if (field === "etaFactory") {
      if (etaPort && d < etaPort) return "ETA Factory cannot be before ETA Port";
    } else if (field === "ataFactory") {
      if (etaPort && d < etaPort) return "ATA Factory cannot be before ETA Port";
    }
    return null;
  };

  const set = <K extends keyof Shipment>(key: K, value: Shipment[K]) => {
    const dateFields = ["etd", "etaPort", "etaFactory", "ataFactory"];
    if (dateFields.includes(key as string) && value) {
      const error = validateDateSequence(key as string, value as string, form);
      if (error) {
        toast.error(error);
        return;
      }
    }
    setForm((prev) => {
      const updated = { ...prev, [key]: value };
      updated.status = calcStatus(updated);
      return updated;
    });
  };

  // Container management
  const addContainer = () => {
    const entry: ContainerEntry = { id: crypto.randomUUID().slice(0, 8), containerType: "40HC", quantity: 1 };
    set("containers", [...form.containers, entry]);
  };

  const updateContainer = (idx: number, field: keyof ContainerEntry, value: any) => {
    const containers = [...form.containers];
    containers[idx] = { ...containers[idx], [field]: value };
    if (field === "containerType" && value !== "Other") {
      containers[idx].customType = undefined;
    }
    set("containers", containers);
  };

  const removeContainer = (idx: number) => {
    set("containers", form.containers.filter((_, i) => i !== idx));
  };



  const toggleDocStatus = (idx: number) => {
    const docs = [...form.documents];
    docs[idx] = {
      ...docs[idx],
      status: docs[idx].status === "Pending" ? "Received" : "Pending",
      receivedDate: docs[idx].status === "Pending" ? new Date().toISOString().split("T")[0] : undefined,
    };
    set("documents", docs);
  };

  const handleSave = async () => {
    if (!form.poNumber || !form.supplierName) {
      toast.error("PO Number and Supplier Name are required");
      return;
    }
    setSaving(true);
    try {
      let shipmentToSave = form;
      if (!isEdit) {
        const year = String(new Date().getFullYear());
        const hasYearSeqId = shipmentToSave.id && shipmentToSave.id.startsWith(year) && /^\d+$/.test(shipmentToSave.id.slice(year.length));
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(shipmentToSave.id || "");
        if (!shipmentToSave.id || isUuid || !hasYearSeqId) {
          shipmentToSave = { ...shipmentToSave, id: getNextShipmentId(shipments) };
          setForm(shipmentToSave);
        }
      }

      if (isEdit) {
        await updateShipment(shipmentToSave);
        toast.success("Shipment updated");
      } else {
        await addShipment(shipmentToSave);
        toast.success("Shipment created");
      }
      navigate("/shipments");
    } catch {
      // context already toasts on failure
    } finally {
      setSaving(false);
    }
  };

  const renderTextInput = (label: string, field: keyof Shipment, type = "text") => (
    <div className="space-y-1" key={field}>
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={(form[field] as string | number) ?? ""}
        onChange={(e) => set(field, type === "number" ? Number(e.target.value) : e.target.value as any)}
        className="h-9 text-sm"
      />
    </div>
  );

  const renderComboField = (label: string, field: keyof Shipment, category: MasterCategory) => (
    <div className="space-y-1" key={field}>
      <Label className="text-xs">{label}</Label>
      <SearchableCombobox
        category={category}
        value={(form[field] as string) ?? ""}
        onChange={(v) => set(field, v as any)}
        placeholder={`Select ${label.toLowerCase()}`}
      />
    </div>
  );

  const renderSelectField = (label: string, field: keyof Shipment, options: string[]) => (
    <div className="space-y-1" key={field}>
      <Label className="text-xs">{label}</Label>
      <Select value={form[field] as string} onValueChange={(v) => set(field, v as any)}>
        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  if (isEdit && loadingShipment) {
    return <div className="text-center py-20 text-muted-foreground">Loading shipment...</div>;
  }

  if (isEdit && notFound) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p>Shipment not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/shipments")}>
          Back to Shipments
        </Button>
      </div>
    );
  }

  const fieldGridClass = "grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4";

  return (
    <div className="space-y-6 animate-fade-in w-full max-w-none">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{isEdit ? "Edit Shipment" : "New Shipment"}</h1>
        </div>
        <Button onClick={handleSave} disabled={saving || (isEdit && loadingShipment)}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      <div className="space-y-6">
        {/* Row 1: Basic Info + Shipping Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="bg-card rounded-lg border p-5 shadow-sm space-y-4 min-w-0">
            <h3 className="text-sm font-medium text-muted-foreground">Basic Information</h3>
            <div className={fieldGridClass}>
              {renderSelectField("Type", "shipmentType", ["SEA", "AIR"])}
              {form.shipmentType === "SEA" && renderSelectField("Sea Mode", "seaMode", ["FCL", "LCL"])}
              {renderTextInput("PO Number", "poNumber")}
              {renderComboField("Supplier Name", "supplierName", "supplier_name")}
              {renderComboField("Owner", "owner", "owner")}
              {renderComboField("Country of Origin", "countryOfOrigin", "country_of_origin")}
              {renderSelectField("Factory", "factory", ["Ref", "Oven", "Dishwasher", "CAPEX"])}
              {renderTextInput("ACID Number", "acidNumber")}
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Input
                  value={calcStatus(form)}
                  readOnly
                  disabled
                  className="h-9 text-sm bg-muted"
                />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-5 shadow-sm space-y-4 min-w-0">
            <h3 className="text-sm font-medium text-muted-foreground">Shipping Details</h3>
            <div className={fieldGridClass}>
              {renderTextInput("Master B/L", "masterBL")}
              {renderTextInput("House B/L", "houseBL")}
              {renderComboField("Carrier", "carrier", "carrier")}
              {renderComboField("Shipping Line", "shippingLine", "shipping_line")}
              {renderComboField("POL", "pol", "pol")}
              {renderComboField("POD", "pod", "pod")}
              {renderComboField("Broker", "broker", "broker")}
              {renderTextInput("Free Days (Sea)", "freeDays", "number")}
            </div>
          </div>
        </div>

        {/* Row 2: Containers (SEA+FCL) or Cargo Measurements (AIR/SEA+LCL) + Key Dates */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {form.shipmentType === "SEA" && form.seaMode === "FCL" ? (
            <div className="bg-card rounded-lg border p-5 shadow-sm space-y-4 min-w-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2 flex-wrap">
                  <Package className="h-4 w-4" /> Containers
                  {form.containers.length > 0 && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">
                      Total: {totalContainers(form)}
                    </span>
                  )}
                </h3>
                <Button variant="outline" size="sm" onClick={addContainer}>
                  <Plus className="h-4 w-4 mr-1" /> Add Container
                </Button>
              </div>
              {form.containers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No containers added yet</p>
              ) : (
                <div className="space-y-3">
                  <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_minmax(140px,180px)_minmax(100px,140px)_40px] gap-3 text-xs font-medium text-muted-foreground px-1">
                    <span>Container Type</span>
                    <span>Custom Type</span>
                    <span>Quantity</span>
                    <span></span>
                  </div>
                  {form.containers.map((c, i) => (
                    <div key={c.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(140px,180px)_minmax(100px,140px)_40px] gap-3 items-start md:items-center p-3 md:p-0 border md:border-0 rounded-md md:rounded-none">
                      <div className="space-y-1 min-w-0">
                        <Label className="text-xs md:hidden">Container Type</Label>
                        <Select value={c.containerType} onValueChange={(v) => updateContainer(i, "containerType", v)}>
                          <SelectTrigger className="h-9 text-sm w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CONTAINER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 min-w-0">
                        <Label className="text-xs md:hidden">Custom Type</Label>
                        <Input
                          value={c.customType || ""}
                          onChange={(e) => updateContainer(i, "customType", e.target.value)}
                          placeholder={c.containerType === "Other" ? "Enter type..." : "—"}
                          disabled={c.containerType !== "Other"}
                          className="h-9 text-sm w-full"
                        />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <Label className="text-xs md:hidden">Quantity</Label>
                        <Input
                          type="number"
                          min={1}
                          value={c.quantity}
                          onChange={(e) => updateContainer(i, "quantity", Math.max(1, Number(e.target.value)))}
                          className="h-9 text-sm w-full"
                        />
                      </div>
                      <div className="flex md:block justify-end">
                        <Button variant="ghost" size="icon" onClick={() => removeContainer(i)} className="text-destructive h-9 w-9">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Container Summary */}
              {form.containers.length > 0 && (() => {
                const summary = getContainerSummary(form);
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
                      Total Containers: <span className="font-semibold text-foreground">{totalContainers(form)}</span>
                    </p>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="bg-card rounded-lg border p-5 shadow-sm space-y-4 min-w-0">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Package className="h-4 w-4" /> Cargo Measurements
              </h3>
              <div className={fieldGridClass}>
                {renderTextInput("Weight (kg)", "weightKg", "number")}
                {renderTextInput("CBM", "cbm", "number")}
              </div>
            </div>
          )}

          <div className="bg-card rounded-lg border p-5 shadow-sm space-y-4 min-w-0">
            <h3 className="text-sm font-medium text-muted-foreground">Key Dates</h3>
            <div className={fieldGridClass}>
              {renderTextInput("ETD", "etd", "date")}
              {renderTextInput("ETA Port", "etaPort", "date")}
              {renderTextInput("ETA Factory", "etaFactory", "date")}
              {renderTextInput("ATA Factory", "ataFactory", "date")}
              {renderTextInput("D/O Date", "doDate", "date")}
              {renderTextInput("Pre-Alert Date", "preAlertDate", "date")}
              {renderTextInput("Original Docs Date", "originalDocsDate", "date")}
              {renderTextInput("CargoX Date", "cargoxDate", "date")}
              {renderTextInput("Form4 Receiving Date", "form4ReceivingDate", "date")}
            </div>
          </div>
        </div>

        {/* Row 3: Financial Details + Cost Items */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="bg-card rounded-lg border p-5 shadow-sm space-y-4 min-w-0">
            <h3 className="text-sm font-medium text-muted-foreground">Financial Details</h3>
            <div className={fieldGridClass}>
              {renderTextInput("Invoice Number", "invoiceNumber")}
              {renderTextInput("Invoice Value", "invoiceValue", "number")}
              {renderSelectField("Currency", "currency", ["USD", "EUR", "EGP"])}
              {renderComboField("Payment Term", "paymentTerm", "payment_term")}
              {renderComboField("Incoterm", "incoterm", "incoterm")}
              {renderComboField("Bank Name", "bankName", "bank_name")}
              {renderTextInput("Customs Cert #", "customsCertNumber")}
              {renderTextInput("Customs Cert Date", "customsCertDate", "date")}
              {renderTextInput("Exchange Rate USD", "exchangeRateUSD", "number")}
              {renderTextInput("Exchange Rate EUR", "exchangeRateEUR", "number")}
              {renderSelectField("Base Currency", "baseCurrency", ["EGP", "USD", "EUR"])}
              {renderTextInput("F4 Commission Rate (%)", "f4CommissionRate", "number")}
            </div>
          </div>

          <div className="min-w-0">
            <CostItemsEditor
              costs={form.costs}
              baseCurrency={form.baseCurrency}
              invoiceCurrency={form.currency}
              invoiceValue={form.invoiceValue}
              exchangeRateUSD={form.exchangeRateUSD}
              exchangeRateEUR={form.exchangeRateEUR}
              f4CommissionRate={form.f4CommissionRate}
              onChange={(newCosts) => set("costs", newCosts)}
            />
          </div>
        </div>

        {/* Row 4: Documents */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="bg-card rounded-lg border p-5 shadow-sm space-y-4 min-w-0 lg:col-span-2">
            <h3 className="text-sm font-medium text-muted-foreground">Documents</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {form.documents.map((d, i) => (
                <button
                  key={d.type}
                  type="button"
                  onClick={() => toggleDocStatus(i)}
                  className={`rounded-lg border p-3 text-center text-sm transition-colors cursor-pointer ${
                    d.status === "Received" ? "border-accent/50 bg-accent/5" : "border-border hover:border-accent/30"
                  }`}
                >
                  <p className="font-medium text-xs">{d.type}</p>
                  <p className={`text-xs mt-1 ${d.status === "Received" ? "text-accent font-medium" : "text-muted-foreground"}`}>
                    {d.status}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
