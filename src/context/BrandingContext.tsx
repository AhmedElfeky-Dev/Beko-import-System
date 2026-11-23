import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { apiGetSettings, apiUpdateSettings, type BrandingSettings } from "@/lib/api";

const STORAGE_KEY = "branding_cache";

export type { BrandingSettings };

const DEFAULT_BRANDING: BrandingSettings = {
  companyName: "LogiTrack",
  logoUrl: "",
  logoWidth: 32,
  logoHeight: 32,
};

interface BrandingContextValue {
  branding: BrandingSettings;
  loading: boolean;
  updateBranding: (settings: BrandingSettings) => Promise<void>;
  refresh: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextValue>({
  branding: DEFAULT_BRANDING,
  loading: true,
  updateBranding: async () => {},
  refresh: async () => {},
});

export function useBranding() {
  return useContext(BrandingContext);
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingSettings>(() => {
    // Load from cache for instant render
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) return JSON.parse(cached);
    } catch {}
    return DEFAULT_BRANDING;
  });
  const [loading, setLoading] = useState(true);

  const fetchBranding = useCallback(async () => {
    try {
      const data = await apiGetSettings();
      setBranding(data);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // keep cached/defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  // Keep document title in sync
  useEffect(() => {
    document.title = branding.companyName || "LogiTrack";
  }, [branding.companyName]);

  const updateBranding = useCallback(async (settings: BrandingSettings) => {
    const saved = await apiUpdateSettings(settings);
    setBranding(saved);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }, []);

  return (
    <BrandingContext.Provider value={{ branding, loading, updateBranding, refresh: fetchBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}
