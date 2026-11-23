import { useEffect, useState, useCallback } from "react";
import {
  apiGetMasterData,
  apiAddMasterData,
  apiUpdateMasterData,
  apiDeleteMasterData,
  apiBulkAddMasterData,
  type MasterDataRow,
} from "@/lib/api";
import { toast } from "sonner";

export type MasterCategory =
  | "supplier_name"
  | "country_of_origin"
  | "carrier"
  | "shipping_line"
  | "pol"
  | "pod"
  | "broker"
  | "payment_term"
  | "incoterm"
  | "bank_name"
  | "owner"
  | "cost_item";

export const MASTER_CATEGORIES: { key: MasterCategory; label: string }[] = [
  { key: "owner", label: "Owner" },
  { key: "supplier_name", label: "Supplier Name" },
  { key: "country_of_origin", label: "Country of Origin" },
  { key: "carrier", label: "Carrier" },
  { key: "shipping_line", label: "Shipping Lines" },
  { key: "pol", label: "POL (Port of Loading)" },
  { key: "pod", label: "POD (Port of Discharge)" },
  { key: "broker", label: "Broker" },
  { key: "payment_term", label: "Payment Term" },
  { key: "incoterm", label: "Incoterm" },
  { key: "bank_name", label: "Bank Name" },
  { key: "cost_item", label: "Cost Items" },
];

export interface MasterDataItem {
  id: string;
  category: MasterCategory;
  value: string;
  code?: string | null;
}

const isMasterCategory = (value: string): value is MasterCategory =>
  MASTER_CATEGORIES.some((c) => c.key === value);

// Module-level cache & subscriber system (same pattern as before)
let cache: MasterDataItem[] | null = null;
const subscribers = new Set<(items: MasterDataItem[]) => void>();

async function fetchAll(): Promise<MasterDataItem[]> {
  try {
    const rows = await apiGetMasterData();
    return rows
      .filter((r: MasterDataRow) => isMasterCategory(r.category))
      .map((r: MasterDataRow): MasterDataItem => ({
        id: r.id,
        category: r.category as MasterCategory,
        value: r.value,
        code: r.code ?? null,
      }))
      .sort((a, b) => a.value.localeCompare(b.value));
  } catch (err: any) {
    toast.error("Failed to load master data: " + (err?.message || "Unknown error"));
    return [];
  }
}

async function refreshCache() {
  cache = await fetchAll();
  subscribers.forEach((cb) => cb(cache!));
}

export function useMasterData(category?: MasterCategory) {
  const [items, setItems] = useState<MasterDataItem[]>(cache ?? []);

  useEffect(() => {
    const cb = (all: MasterDataItem[]) => setItems(all);
    subscribers.add(cb);
    if (cache === null) {
      refreshCache();
    } else {
      setItems(cache);
    }
    return () => { subscribers.delete(cb); };
  }, []);

  const addValue = useCallback(async (cat: MasterCategory, value: string, code?: string | null) => {
    const v = value.trim();
    if (!v) return null;
    // Optimistic duplicate check
    if ((cache ?? []).some((i) => i.category === cat && i.value.toLowerCase() === v.toLowerCase())) {
      return v;
    }
    try {
      await apiAddMasterData(cat, v, code ?? null);
      await refreshCache();
      return v;
    } catch (err: any) {
      toast.error(err?.message || "Failed to add value");
      return null;
    }
  }, []);

  const updateValue = useCallback(async (id: string, patch: { value?: string; code?: string | null }) => {
    try {
      await apiUpdateMasterData(id, patch);
      await refreshCache();
      return true;
    } catch (err: any) {
      toast.error(err?.message || "Failed to update value");
      return false;
    }
  }, []);

  const deleteValue = useCallback(async (id: string) => {
    try {
      await apiDeleteMasterData(id);
      await refreshCache();
      return true;
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete value");
      return false;
    }
  }, []);

  const bulkAdd = useCallback(async (
    cat: MasterCategory,
    values: Array<string | { value: string; code?: string | null }>
  ) => {
    try {
      const result = await apiBulkAddMasterData(cat, values);
      await refreshCache();
      return result;
    } catch (err: any) {
      toast.error(err?.message || "Bulk add failed");
      return { added: 0, skipped: values.length };
    }
  }, []);

  const filtered = category ? items.filter((i) => i.category === category) : items;
  return { items: filtered, allItems: items, addValue, updateValue, bulkAdd, deleteValue, refresh: refreshCache };
}
