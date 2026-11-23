import { describe, it, expect } from "vitest";
import {
  calcStatus,
  convertToBase,
  calcConvertedInvoiceValue,
  totalCostBase,
  totalContainers,
  getContainerSummary,
  getContainerSummaryMulti,
  calcLastFreeReleaseDate,
  calcRemainingDaysToDemurrage,
  calcForm4LeadTime,
  calcClearanceLeadTime,
  calcTotalLeadTime,
  calcMedianCost,
  calcWeightedAvgCost,
  type Shipment,
  type CostItem,
} from "./shipment";

function baseShipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: "SHP-1",
    shipmentType: "SEA",
    poNumber: "PO-1",
    supplierName: "Supplier",
    countryOfOrigin: "Country",
    factory: "Ref",
    acidNumber: "ACID",
    masterBL: "MBL",
    houseBL: "HBL",
    customsCertNumber: "CERT",
    invoiceNumber: "INV",
    invoiceValue: 1000,
    currency: "USD",
    paymentTerm: "Open Account",
    incoterm: "FOB",
    bankName: "Bank",
    status: "Not Shipped",
    containers: [],
    carrier: "Carrier",
    shippingLine: "",
    pol: "POL",
    pod: "POD",
    broker: "Broker",
    costs: [],
    documents: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    exchangeRateUSD: 50,
    exchangeRateEUR: 55,
    baseCurrency: "EGP",
    f4CommissionRate: 0,
    seaMode: "FCL",
    ...overrides,
  };
}

describe("shipment helpers", () => {
  it("calcStatus returns Released when ataFactory is set", () => {
    expect(calcStatus(baseShipment({ ataFactory: "2026-01-10" }))).toBe("Released");
  });

  it("calcStatus returns Not Shipped when ETD is in the future", () => {
    expect(calcStatus(baseShipment({ etd: "2099-01-01" }))).toBe("Not Shipped");
  });

  it("calcStatus returns In Transit when ETD passed and ETA port is future/missing", () => {
    expect(calcStatus(baseShipment({ etd: "2000-01-01", etaPort: "2099-01-10" }))).toBe("In Transit");
    expect(calcStatus(baseShipment({ etd: "2000-01-01", etaPort: undefined }))).toBe("In Transit");
  });

  it("calcStatus returns At Customs when ETD and ETA port have passed", () => {
    expect(calcStatus(baseShipment({ etd: "2000-01-01", etaPort: "2000-01-10" }))).toBe("At Customs");
  });

  it("convertToBase and calcConvertedInvoiceValue convert via configured rates", () => {
    const s = baseShipment({ invoiceValue: 100, currency: "USD", exchangeRateUSD: 50, exchangeRateEUR: 55, baseCurrency: "EGP" });
    expect(convertToBase(100, "USD", s)).toBe(5000);
    expect(convertToBase(100, "EUR", s)).toBe(5500);
    expect(convertToBase(100, "EGP", s)).toBe(100);
    expect(calcConvertedInvoiceValue(s)).toBe(5000);
  });

  it("totalCostBase sums converted cost amounts", () => {
    const costs: CostItem[] = [
      { id: "1", type: "Freight", amount: 10, currency: "USD" },
      { id: "2", type: "Transportation", amount: 200, currency: "EGP" },
      { id: "3", type: "Customs Clearance", amount: 2, currency: "EUR" },
    ];
    const s = baseShipment({ costs, exchangeRateUSD: 50, exchangeRateEUR: 55, baseCurrency: "EGP" });
    expect(totalCostBase(s)).toBe(10 * 50 + 200 + 2 * 55);
  });

  it("container helpers aggregate quantities and types", () => {
    const s = baseShipment({
      containers: [
        { id: "c1", containerType: "40HC", quantity: 2 },
        { id: "c2", containerType: "20GP", quantity: 1 },
        { id: "c3", containerType: "Other", customType: "Special", quantity: 3 },
      ],
    });
    expect(totalContainers(s)).toBe(6);
    expect(getContainerSummary(s)).toEqual([
      { type: "40HC", quantity: 2 },
      { type: "20GP", quantity: 1 },
      { type: "Special", quantity: 3 },
    ]);
    const s2 = baseShipment({ containers: [{ id: "c4", containerType: "40HC", quantity: 1 }] });
    expect(getContainerSummaryMulti([s, s2])).toEqual([
      { type: "40HC", quantity: 3 },
      { type: "Special", quantity: 3 },
      { type: "20GP", quantity: 1 },
    ]);
  });

  it("calcLastFreeReleaseDate and demurrage null conditions", () => {
    expect(calcLastFreeReleaseDate(baseShipment({ etaPort: "2026-01-10", freeDays: 10, shipmentType: "SEA", seaMode: "FCL" }))).toBe("2026-01-16");
    expect(calcLastFreeReleaseDate(baseShipment({ etaPort: "2026-01-10", freeDays: 10, shipmentType: "AIR" }))).toBeNull();
    expect(calcLastFreeReleaseDate(baseShipment({ etaPort: "2026-01-10", freeDays: 10, shipmentType: "SEA", seaMode: "LCL" }))).toBeNull();
    expect(calcRemainingDaysToDemurrage(baseShipment({ ataFactory: "2026-01-20", etaPort: "2026-01-10", freeDays: 10 }))).toBeNull();
  });

  it("lead time helpers compute day differences or return null", () => {
    expect(calcForm4LeadTime(baseShipment({ form4ReceivingDate: "2026-01-10", cargoxDate: "2026-01-05" }))).toBe(5);
    expect(calcForm4LeadTime(baseShipment({ form4ReceivingDate: "2026-01-10" }))).toBeNull();
    expect(calcTotalLeadTime(baseShipment({ etaFactory: "2026-01-20", etd: "2026-01-10" }))).toBe(10);
    expect(calcClearanceLeadTime(baseShipment({ ataFactory: "2026-01-20", etaPort: "2026-01-10", shipmentType: "SEA", seaMode: "FCL" }))).toBe(9);
    expect(calcClearanceLeadTime(baseShipment({ ataFactory: "2026-01-20", doDate: "2026-01-12", shipmentType: "SEA", seaMode: "LCL" }))).toBe(8);
  });

  it("analytics helpers compute median and weighted average", () => {
    const s1 = baseShipment({ invoiceValue: 100, currency: "EGP", baseCurrency: "EGP", costs: [{ id: "1", type: "Freight", amount: 10, currency: "EGP" }] });
    const s2 = baseShipment({ invoiceValue: 200, currency: "EGP", baseCurrency: "EGP", costs: [{ id: "2", type: "Freight", amount: 50, currency: "EGP" }] });
    expect(calcMedianCost([s1, s2])).toBe(30);
    expect(calcWeightedAvgCost([s1, s2])).toBe((10 * 100 + 50 * 200) / (100 + 200));
    expect(calcMedianCost([])).toBeNull();
    expect(calcWeightedAvgCost([])).toBeNull();
  });
});
