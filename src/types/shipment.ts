export type ShipmentType = "SEA" | "AIR";
export type SeaMode = "FCL" | "LCL";
export type Factory = "Ref" | "Oven" | "Dishwasher" | "CAPEX";
export type Currency = "USD" | "EUR" | "EGP";
export type BaseCurrency = "EGP" | "USD" | "EUR";
export type PaymentTerm = "Open Account" | "CAD" | "Advance" | "FOC";
export type ShipmentStatus = "Not Shipped" | "In Transit" | "At Customs" | "Released";
export type ContainerType = "20GP" | "40GP" | "40HC" | "45HC" | "20OT" | "40OT" | "20FR" | "40FR" | "Other";

export const CONTAINER_TYPES: ContainerType[] = ["20GP", "40GP", "40HC", "45HC", "20OT", "40OT", "20FR", "40FR", "Other"];

export interface ContainerEntry {
  id: string;
  containerType: ContainerType;
  customType?: string;
  quantity: number;
}

export type CostType = string;

/** Default cost item names seeded into Master Data and used for backward compatibility. */
export const COST_TYPES: string[] = [
  "Import Duty", "Nafeza Fees", "Transportation", "Customs Clearance",
  "Approvals", "ACID Fees", "THC EGP", "THC USD", "Storage EGP",
  "Storage USD", "Demurrage USD", "Freight", "F4 Commission", "Additional Cost",
];

export type DocumentType = "Invoice" | "Packing List" | "Bill of Lading" | "COO" | "EUR1";
export type DocumentStatus = "Pending" | "Received";

export interface CostItem {
  id: string;
  type: string;
  amount: number;
  currency: Currency;
  convertedAmount?: number;
  notes?: string;
}

export interface ShipmentDocument {
  type: DocumentType;
  status: DocumentStatus;
  receivedDate?: string;
}

export interface Shipment {
  id: string;
  shipmentType: ShipmentType;
  poNumber: string;
  supplierName: string;
  countryOfOrigin: string;
  factory: Factory;
  acidNumber: string;
  masterBL: string;
  houseBL: string;
  doDate?: string;
  customsCertNumber: string;
  customsCertDate?: string;
  invoiceNumber: string;
  invoiceValue: number;
  currency: Currency;
  paymentTerm: PaymentTerm;
  incoterm: string;
  bankName: string;
  etd?: string;
  etaPort?: string;
  etaFactory?: string;
  ataFactory?: string;
  status: ShipmentStatus;
  containers: ContainerEntry[];
  /** @deprecated kept for backward compat */
  numberOfContainers?: number;
  /** @deprecated kept for backward compat */
  containerType?: ContainerType;
  carrier: string;
  shippingLine: string;
  pol: string;
  pod: string;
  preAlertDate?: string;
  originalDocsDate?: string;
  cargoxDate?: string;
  form4ReceivingDate?: string;
  broker: string;
  freeDays?: number;
  costs: CostItem[];
  documents: ShipmentDocument[];
  createdAt: string;
  // Financial / Cost Management fields
  exchangeRateUSD: number;
  exchangeRateEUR: number;
  baseCurrency: BaseCurrency;
  f4CommissionRate: number;
  // Sea sub-mode (FCL uses containers, LCL uses weight/CBM). Only relevant for SEA.
  seaMode?: SeaMode;
  // Cargo measurements — used for AIR and SEA-LCL.
  weightKg?: number;
  cbm?: number;
  owner?: string;
  /** Server-managed optimistic lock version; pass back on PUT/PATCH */
  _version?: number;
}

export const DOCUMENT_TYPES: DocumentType[] = ["Invoice", "Packing List", "Bill of Lading", "COO", "EUR1"];

// ── Calculation helpers ──

export function convertToBase(amount: number, currency: Currency, shipment: Shipment): number {
  const amt = Number(amount) || 0;
  const rateUSD = Number(shipment.exchangeRateUSD) || 1;
  const rateEUR = Number(shipment.exchangeRateEUR) || 1;
  if (currency === shipment.baseCurrency) return amt;
  // Convert source -> base via EGP pivot (rates are quoted as 1 USD/EUR = X EGP)
  let inEgp = amt;
  if (currency === "USD") inEgp = amt * rateUSD;
  else if (currency === "EUR") inEgp = amt * rateEUR;
  if (shipment.baseCurrency === "EGP") return inEgp;
  if (shipment.baseCurrency === "USD") return inEgp / rateUSD;
  if (shipment.baseCurrency === "EUR") return inEgp / rateEUR;
  return amt;
}

export function calcConvertedInvoiceValue(s: Shipment): number {
  return convertToBase(Number(s.invoiceValue) || 0, s.currency, s);
}

export function calcF4Commission(s: Shipment): number {
  return (Number(s.invoiceValue) || 0) * ((Number(s.f4CommissionRate) || 0) / 100);
}

export function recalcCostConversions(s: Shipment): CostItem[] {
  return s.costs.map((c) => ({
    ...c,
    convertedAmount: convertToBase(Number(c.amount) || 0, c.currency, s),
  }));
}

export function totalCostBase(s: Shipment): number {
  const t = recalcCostConversions(s).reduce((sum, c) => sum + (Number(c.convertedAmount) || 0), 0);
  return Number.isFinite(t) ? t : 0;
}

export function totalCostByType(s: Shipment): { type: string; total: number }[] {
  const map = new Map<string, number>();
  for (const c of recalcCostConversions(s)) {
    map.set(c.type, (map.get(c.type) || 0) + (c.convertedAmount ?? 0));
  }
  return Array.from(map.entries()).map(([type, total]) => ({ type, total }));
}

export function calcCostRatio(s: Shipment): number | null {
  const invoiceConverted = calcConvertedInvoiceValue(s);
  if (!invoiceConverted) return null;
  return (totalCostBase(s) / invoiceConverted) * 100;
}

// ── Analytics helpers (multi-shipment) ──

export function calcWeightedAvgCost(shipments: Shipment[]): number | null {
  let sumProduct = 0;
  let sumInvoice = 0;
  for (const s of shipments) {
    const inv = calcConvertedInvoiceValue(s);
    const cost = totalCostBase(s);
    sumProduct += cost * inv;
    sumInvoice += inv;
  }
  return sumInvoice > 0 ? sumProduct / sumInvoice : null;
}

export function calcMedianCost(shipments: Shipment[]): number | null {
  const costs = shipments.map(totalCostBase).sort((a, b) => a - b);
  if (costs.length === 0) return null;
  const mid = Math.floor(costs.length / 2);
  return costs.length % 2 !== 0 ? costs[mid] : (costs[mid - 1] + costs[mid]) / 2;
}

// ── Legacy helpers ──

export function calcLastFreeReleaseDate(s: Shipment): string | null {
  if (!s.etaPort || s.freeDays == null || s.shipmentType !== "SEA" || s.seaMode !== "FCL") return null;
  const eta = new Date(s.etaPort);
  // Count ETA Port arrival day as day 1 of free time: last free release = ETA + (freeDays - 1) - 3
  eta.setDate(eta.getDate() + s.freeDays - 4);
  return eta.toISOString().split("T")[0];
}

export function calcRemainingDaysToDemurrage(s: Shipment): number | null {
  if (s.ataFactory) return null;
  const lastFree = calcLastFreeReleaseDate(s);
  if (!lastFree) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const remaining = Math.ceil((new Date(lastFree).getTime() - today.getTime()) / 86400000);
  // Skip 0: after 1 day left, next day is -1 (first demurrage day)
  return remaining === 0 ? -1 : remaining;
}

export function calcForm4LeadTime(s: Shipment): number | null {
  if (!s.form4ReceivingDate || !s.cargoxDate) return null;
  return Math.round((new Date(s.form4ReceivingDate).getTime() - new Date(s.cargoxDate).getTime()) / 86400000);
}

export function calcClearanceLeadTime(s: Shipment): number | null {
  if (!s.ataFactory) return null;
  const finalClearance = new Date(s.ataFactory);

  let start: Date;
  if (s.shipmentType === "SEA" && s.seaMode === "LCL") {
    if (!s.doDate) return null;
    start = new Date(s.doDate);
  } else {
    if (!s.etaPort) return null;
    const arrival = new Date(s.etaPort);
    start = new Date(arrival.getTime() + 86400000); // Day after ETA Port
  }

  return Math.round((finalClearance.getTime() - start.getTime()) / 86400000);
}

export function calcTotalLeadTime(s: Shipment): number | null {
  if (!s.etaFactory || !s.etd) return null;
  return Math.round((new Date(s.etaFactory).getTime() - new Date(s.etd).getTime()) / 86400000);
}

export function totalCost(s: Shipment): number {
  return s.costs.reduce((sum, c) => sum + c.amount, 0);
}

export function getNextShipmentSequenceStart(
  shipments: Pick<Shipment, "id">[],
  year = new Date().getFullYear(),
): number {
  const prefix = String(year);
  let maxSeq = 0;
  for (const s of shipments) {
    const id = s?.id;
    if (typeof id !== "string" || !id.startsWith(prefix)) continue;
    const suffix = id.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    const seq = parseInt(suffix, 10);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  }
  return maxSeq + 1;
}

export function formatShipmentId(year: number, seq: number): string {
  return `${year}${String(seq).padStart(2, "0")}`;
}

export function getNextShipmentId(
  shipments: Pick<Shipment, "id">[],
  year = new Date().getFullYear(),
): string {
  return formatShipmentId(year, getNextShipmentSequenceStart(shipments, year));
}

export function totalContainers(s: Shipment): number {
  return (s.containers || []).reduce((sum, c) => sum + c.quantity, 0);
}

export interface ContainerSummaryEntry {
  type: string;
  quantity: number;
}

export function getContainerSummary(s: Shipment): ContainerSummaryEntry[] {
  const map = new Map<string, number>();
  for (const c of s.containers || []) {
    const key = c.containerType === "Other" ? (c.customType || "Other") : c.containerType;
    map.set(key, (map.get(key) || 0) + c.quantity);
  }
  return Array.from(map.entries()).map(([type, quantity]) => ({ type, quantity }));
}

export function getContainerSummaryMulti(shipments: Shipment[]): ContainerSummaryEntry[] {
  const map = new Map<string, number>();
  for (const s of shipments) {
    for (const c of s.containers || []) {
      const key = c.containerType === "Other" ? (c.customType || "Other") : c.containerType;
      map.set(key, (map.get(key) || 0) + c.quantity);
    }
  }
  return Array.from(map.entries())
    .map(([type, quantity]) => ({ type, quantity }))
    .sort((a, b) => b.quantity - a.quantity);
}

export function calcStatus(s: Shipment): ShipmentStatus {
  if (s.ataFactory) return "Released";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (s.etd && new Date(s.etd) >= today) return "Not Shipped";
  if (s.etd && new Date(s.etd) < today) {
    if (!s.etaPort || new Date(s.etaPort) > today) return "In Transit";
    if (new Date(s.etaPort) <= today) return "At Customs";
  }
  return "Not Shipped";
}

export function isDelayed(s: Shipment): boolean {
  return false;
}
