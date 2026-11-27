import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { Shipment } from "@/types/shipment";
import {
  apiGetShipments,
  apiCreateShipment,
  apiUpdateShipment,
  apiDeleteShipment,
} from "@/lib/api";
import { getToken } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

interface ShipmentContextType {
  shipments: Shipment[];
  loading: boolean;
  addShipment: (s: Shipment) => Promise<void>;
  updateShipment: (s: Shipment) => Promise<void>;
  deleteShipment: (id: string) => Promise<void>;
  getShipment: (id: string) => Shipment | undefined;
  refresh: () => Promise<void>;
}

const ShipmentContext = createContext<ShipmentContextType | null>(null);

export function ShipmentProvider({ children }: { children: ReactNode }) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();

  const fetchShipments = useCallback(async () => {
    if (authLoading) return;
    if (!user || !getToken()) {
      setShipments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiGetShipments();
      setShipments(data as Shipment[]);
    } catch (err: any) {
      toast.error("Failed to load shipments: " + (err?.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  }, [authLoading, user]);

  useEffect(() => {
    void fetchShipments();
  }, [fetchShipments]);

  const addShipment = async (s: Shipment) => {
    try {
      const created = await apiCreateShipment(s);
      setShipments((prev) => [created as Shipment, ...prev]);
    } catch (err: any) {
      toast.error("Failed to create shipment: " + (err?.message || "Unknown error"));
      throw err;
    }
  };

  const updateShipment = async (s: Shipment) => {
    try {
      const updated = await apiUpdateShipment(s.id, s);
      setShipments((prev) => prev.map((p) => (p.id === s.id ? (updated as Shipment) : p)));
    } catch (err: any) {
      if (err?.status === 409) {
        toast.error("Conflict: This shipment was modified by another user. Refreshing data...");
        await fetchShipments();
      } else {
        toast.error("Failed to update shipment: " + (err?.message || "Unknown error"));
      }
      throw err;
    }
  };

  const deleteShipment = async (id: string) => {
    try {
      await apiDeleteShipment(id);
      setShipments((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      toast.error("Failed to delete shipment: " + (err?.message || "Unknown error"));
      throw err;
    }
  };

  const getShipment = (id: string) => shipments.find((s) => s.id === id);

  return (
    <ShipmentContext.Provider
      value={{ shipments, loading, addShipment, updateShipment, deleteShipment, getShipment, refresh: fetchShipments }}
    >
      {children}
    </ShipmentContext.Provider>
  );
}

export function useShipments() {
  const ctx = useContext(ShipmentContext);
  if (!ctx) throw new Error("useShipments must be used within ShipmentProvider");
  return ctx;
}
