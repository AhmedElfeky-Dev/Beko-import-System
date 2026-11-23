import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  apiLogin,
  apiLogout,
  apiGetMe,
  setToken,
  clearToken,
  getToken,
  type LocalUser,
} from "@/lib/api";

export type PageKey = "dashboard" | "shipments" | "costs" | "settings";
export type PermissionLevel = "none" | "view" | "edit";
export type Permissions = Record<PageKey, PermissionLevel>;

const DEFAULT_PERMS: Permissions = {
  dashboard: "none",
  shipments: "none",
  costs: "none",
  settings: "none",
};

interface AuthContextValue {
  user: LocalUser | null;
  loading: boolean;
  isAdmin: boolean;
  permissions: Permissions;
  displayName: string;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  can: (page: PageKey, level: "view" | "edit") => boolean;
  firstAllowedPath: () => string;
  refresh: () => Promise<void>;
}

const PAGE_ORDER: { page: PageKey; path: string }[] = [
  { page: "dashboard", path: "/" },
  { page: "shipments", path: "/shipments" },
  { page: "costs", path: "/costs" },
  { page: "settings", path: "/settings" },
];

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function parsePermissions(raw: Record<string, string>): Permissions {
  const perms = { ...DEFAULT_PERMS };
  for (const key of Object.keys(raw) as PageKey[]) {
    if (key in perms) perms[key] = raw[key] as PermissionLevel;
  }
  return perms;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions, setPermissions] = useState<Permissions>(DEFAULT_PERMS);
  const [displayName, setDisplayName] = useState("");

  const applyUser = (u: LocalUser) => {
    setUser(u);
    setIsAdmin(u.isAdmin);
    setPermissions(parsePermissions(u.permissions));
    setDisplayName(u.displayName || u.email);
  };

  // On mount, try to restore session from stored token
  useEffect(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }

    apiGetMe()
      .then(applyUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { token, user: u } = await apiLogin(email, password);
      setToken(token);
      applyUser(u);
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || "Login failed" };
    }
  };

  const signOut = async () => {
    await apiLogout();
    setUser(null);
    setIsAdmin(false);
    setPermissions(DEFAULT_PERMS);
    setDisplayName("");
  };

  const can = (page: PageKey, level: "view" | "edit") => {
    if (isAdmin) return true;
    const lvl = permissions[page];
    if (level === "view") return lvl === "view" || lvl === "edit";
    return lvl === "edit";
  };

  const firstAllowedPath = () => {
    const found = PAGE_ORDER.find((p) => can(p.page, "view"));
    return found?.path ?? "/login";
  };

  const refresh = async () => {
    if (!getToken()) return;
    try {
      const u = await apiGetMe();
      applyUser(u);
    } catch {
      // token expired — sign out silently
      await signOut();
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, isAdmin, permissions, displayName, signIn, signOut, can, firstAllowedPath, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
